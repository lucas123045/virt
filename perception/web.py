"""Percepção pelo navegador: o que é digitado na oficina virtual vira Evento."""

from __future__ import annotations

import queue
import time

from core.evento import Evento
from perception.base import Percepcao
from web.servidor import ServidorWeb

# Depois de falar sozinho algumas vezes sem resposta, o virt espera alguém falar
MAX_SILENCIOS_SEGUIDOS = 2


class PercepcaoWeb(Percepcao):
    """Lê eventos da fila do servidor web.

    Se ninguém disser nada por `silencio_segundos` enquanto há um navegador
    aberto, gera um evento "silencio" (o virt pode puxar assunto sozinho).
    Use 0 para desativar.
    """

    def __init__(self, servidor: ServidorWeb, silencio_segundos: float = 60.0) -> None:
        self._servidor = servidor
        self._silencio = silencio_segundos
        self._silencios_seguidos = 0

    def perceber(self) -> Evento | None:
        inicio = time.monotonic()
        while True:
            try:
                # Timeout curto em vez de bloquear para sempre: assim o Ctrl+C
                # funciona também no Windows
                evento = self._servidor.entradas.get(timeout=0.5)
            except queue.Empty:
                if self._deve_quebrar_silencio(time.monotonic() - inicio):
                    self._silencios_seguidos += 1
                    return Evento(tipo="silencio")
                continue

            self._silencios_seguidos = 0
            self._ecoar(evento)
            return evento

    def _deve_quebrar_silencio(self, esperado: float) -> bool:
        return (
            self._silencio > 0
            and esperado >= self._silencio
            and self._silencios_seguidos < MAX_SILENCIOS_SEGUIDOS
            and self._servidor.clientes_conectados() > 0
        )

    @staticmethod
    def _ecoar(evento: Evento) -> None:
        """Mostra no terminal o que chegou do navegador (log da conversa)."""
        if evento.tipo == "fala":
            print(f"você (navegador)> {evento.conteudo}")
        elif evento.tipo == "rosto_detectado":
            print("* alguém abriu a oficina *")
