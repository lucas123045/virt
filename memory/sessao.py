"""Memória volátil: histórico da sessão atual, perdido ao encerrar o programa."""

from __future__ import annotations

from collections import deque

from core.evento import Evento
from core.intencao import Intencao
from memory.base import Interacao, Memoria


class MemoriaSessao(Memoria):
    """Guarda as últimas N interações em RAM (janela deslizante)."""

    def __init__(self, max_interacoes: int = 20) -> None:
        # deque com maxlen descarta automaticamente as interações mais antigas
        self._historico: deque[Interacao] = deque(maxlen=max_interacoes)
        self._fatos: list[str] = []

    def salvar(self, evento: Evento, resposta: Intencao) -> None:
        self._historico.append(Interacao(evento=evento, resposta=resposta))

    def buscar_contexto(self, evento: Evento) -> list[Interacao]:
        # Por enquanto ignora o evento e devolve todo o histórico recente.
        # Uma memória vetorial usaria o evento para filtrar por relevância.
        return list(self._historico)

    def buscar_fatos(self) -> list[str]:
        return list(self._fatos)

    def substituir_fatos(self, fatos: list[str]) -> None:
        self._fatos = list(fatos)
