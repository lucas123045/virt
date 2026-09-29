"""Servidor HTTP local da oficina virtual (só biblioteca padrão).

Rotas:
    GET  /              -> página da oficina 3D
    GET  /static/...    -> arquivos JS/CSS
    GET  /eventos       -> Server-Sent Events: o navegador recebe intenções em tempo real
    POST /entrada       -> {"texto": "..."}: o que a pessoa digitou no navegador
    GET  /voz/<id>.wav  -> áudio de uma fala (espera a síntese terminar)

O servidor só traduz HTTP <-> objetos padronizados: entradas viram Eventos
numa fila (lida pela PercepcaoWeb) e intenções são publicadas pelo WebBody.
"""

from __future__ import annotations

import json
import logging
import queue
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from core.evento import Evento

log = logging.getLogger(__name__)

PASTA_ESTATICA = Path(__file__).parent / "static"

# Tipos fixos: no Windows o registro às vezes mapeia .js para text/plain,
# o que faz o navegador recusar os módulos JavaScript
TIPOS = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".png": "image/png",
    ".glb": "model/gltf-binary",
}

# Quantas falas sintetizadas ficam guardadas para o navegador buscar
MAX_AUDIOS = 30

MAX_TEXTO = 2000
# Intervalo mínimo entre dois "rosto_detectado" gerados por abrir a página
INTERVALO_SAUDACAO = 60.0


class ServidorWeb:
    """Servidor da oficina, rodando numa thread em segundo plano."""

    def __init__(self, porta: int = 8765, saudar_ao_conectar: bool = True) -> None:
        self._porta_pedida = porta
        self._saudar = saudar_ao_conectar
        # Eventos vindos do navegador, consumidos pela PercepcaoWeb
        self.entradas: queue.Queue[Evento] = queue.Queue()
        # Uma fila por navegador conectado (cada aba recebe todas as mensagens)
        self._clientes: set[queue.Queue[str]] = set()
        self._trava = threading.Lock()
        self._ultima_saudacao = 0.0
        self._http: ThreadingHTTPServer | None = None
        # Áudios das falas: id -> (evento "pronto", bytes do WAV ou None)
        self._audios: dict[str, tuple[threading.Event, list[bytes | None]]] = {}

    # --- ciclo de vida ---------------------------------------------------

    def iniciar(self) -> None:
        # Só 127.0.0.1: a oficina não fica exposta para outras máquinas da rede
        self._http = ThreadingHTTPServer(("127.0.0.1", self._porta_pedida), _criar_handler(self))
        self._http.daemon_threads = True
        threading.Thread(target=self._http.serve_forever, name="oficina-web", daemon=True).start()

    def parar(self) -> None:
        if self._http:
            self._http.shutdown()
            self._http.server_close()

    @property
    def porta(self) -> int:
        return self._http.server_address[1] if self._http else self._porta_pedida

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.porta}"

    # --- comunicação -----------------------------------------------------

    def publicar(self, tipo: str, dados: dict[str, Any] | None = None) -> None:
        """Envia uma mensagem para todos os navegadores conectados."""
        mensagem = json.dumps({"tipo": tipo, **(dados or {})}, ensure_ascii=False)
        with self._trava:
            for fila in self._clientes:
                fila.put(mensagem)

    def reservar_audio(self, ident: str) -> None:
        """Anuncia que um áudio vai existir (o navegador pode pedir antes de ficar pronto)."""
        with self._trava:
            self._audios[ident] = (threading.Event(), [None])
            while len(self._audios) > MAX_AUDIOS:
                del self._audios[next(iter(self._audios))]

    def entregar_audio(self, ident: str, dados: bytes | None) -> None:
        with self._trava:
            item = self._audios.get(ident)
        if item:
            item[1][0] = dados
            item[0].set()

    def _obter_audio(self, ident: str, espera: float = 20.0) -> bytes | None:
        with self._trava:
            item = self._audios.get(ident)
        if not item or not item[0].wait(espera):
            return None
        return item[1][0]

    def clientes_conectados(self) -> int:
        with self._trava:
            return len(self._clientes)

    def _registrar(self) -> queue.Queue[str]:
        fila: queue.Queue[str] = queue.Queue()
        with self._trava:
            primeiro = not self._clientes
            self._clientes.add(fila)
        # Alguém "entrou na oficina": o robô percebe um rosto (com limite de frequência)
        agora = time.monotonic()
        if self._saudar and primeiro and agora - self._ultima_saudacao > INTERVALO_SAUDACAO:
            self._ultima_saudacao = agora
            self.entradas.put(Evento(tipo="rosto_detectado"))
        return fila

    def _remover(self, fila: queue.Queue[str]) -> None:
        with self._trava:
            self._clientes.discard(fila)


def _criar_handler(servidor: ServidorWeb) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, formato: str, *args: Any) -> None:
            log.debug(formato, *args)

        def do_GET(self) -> None:
            caminho = self.path.split("?", 1)[0]
            if caminho == "/":
                self._arquivo(PASTA_ESTATICA / "index.html")
            elif caminho.startswith("/static/"):
                alvo = (PASTA_ESTATICA / caminho.removeprefix("/static/")).resolve()
                # Impede "../" de escapar da pasta estática
                if PASTA_ESTATICA.resolve() in alvo.parents:
                    self._arquivo(alvo)
                else:
                    self.send_error(404)
            elif caminho == "/eventos":
                self._eventos()
            elif caminho.startswith("/voz/") and caminho.endswith(".wav"):
                dados = servidor._obter_audio(caminho[len("/voz/"):-len(".wav")])
                if dados:
                    self.send_response(200)
                    self.send_header("Content-Type", "audio/wav")
                    self.send_header("Content-Length", str(len(dados)))
                    self.end_headers()
                    self.wfile.write(dados)
                else:
                    self.send_error(404)
            else:
                self.send_error(404)

        def do_POST(self) -> None:
            if self.path != "/entrada":
                self.send_error(404)
                return
            try:
                tamanho = int(self.headers.get("Content-Length", 0))
                dados = json.loads(self.rfile.read(min(tamanho, 16_384)) or b"{}")
                texto = str(dados.get("texto", "")).strip()[:MAX_TEXTO]
            except (ValueError, AttributeError):
                self.send_error(400)
                return
            if texto:
                servidor.entradas.put(Evento(tipo="fala", conteudo=texto))
                # Todas as abas mostram a mensagem e o robô "pensando"
                servidor.publicar("entrada", {"texto": texto})
            self.send_response(204)
            self.end_headers()

        def _arquivo(self, arquivo: Path) -> None:
            if not arquivo.is_file():
                self.send_error(404)
                return
            corpo = arquivo.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", TIPOS.get(arquivo.suffix, "application/octet-stream"))
            self.send_header("Content-Length", str(len(corpo)))
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(corpo)

        def _eventos(self) -> None:
            """Mantém a conexão aberta e empurra mensagens (Server-Sent Events)."""
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            fila = servidor._registrar()
            try:
                self.wfile.write(b": conectado\n\n")
                self.wfile.flush()
                while True:
                    try:
                        dados = f"data: {fila.get(timeout=15)}\n\n"
                    except queue.Empty:
                        dados = ": ping\n\n"  # mantém a conexão viva
                    self.wfile.write(dados.encode("utf-8"))
                    self.wfile.flush()
            except OSError:
                pass  # navegador fechou a aba
            finally:
                servidor._remover(fila)

    return Handler
