"""Percepção por texto digitado no terminal (primeira etapa do projeto)."""

from __future__ import annotations

from core.evento import Evento
from perception.base import Percepcao

AJUDA = (
    "Comandos: /sair encerra | /rosto [nome] simula um rosto detectado | "
    "linha vazia simula silêncio"
)


class TextoTerminal(Percepcao):
    """Lê linhas do terminal e as converte em eventos.

    - Texto comum        -> evento "fala"
    - Linha vazia        -> evento "silencio"
    - /rosto [nome]      -> evento "rosto_detectado" (útil para testar antes da câmera)
    - /sair, Ctrl+D/Z    -> encerra (retorna None)
    """

    def __init__(self, prompt: str = "você> ") -> None:
        self._prompt = prompt

    def perceber(self) -> Evento | None:
        while True:
            try:
                linha = input(self._prompt).strip()
            except EOFError:
                return None

            if linha.lower() in {"/sair", "/exit", "/quit"}:
                return None
            if linha.lower() in {"/ajuda", "/help"}:
                print(AJUDA)
                continue
            if linha.lower().startswith("/rosto"):
                nome = linha[len("/rosto"):].strip() or "desconhecido"
                return Evento(tipo="rosto_detectado", conteudo=nome)
            if not linha:
                return Evento(tipo="silencio")
            return Evento(tipo="fala", conteudo=linha)
