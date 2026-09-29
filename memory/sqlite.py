"""Memória persistente em SQLite: o virt lembra das conversas entre sessões."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from core.evento import Evento
from core.intencao import Intencao
from memory.base import Interacao, Memoria

_ESQUEMA = """
CREATE TABLE IF NOT EXISTS interacoes (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    evento    TEXT NOT NULL,  -- Evento serializado em JSON
    resposta  TEXT NOT NULL,  -- Intencao serializada em JSON
    criado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE TABLE IF NOT EXISTS fatos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    texto         TEXT NOT NULL,
    atualizado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
"""


class MemoriaSQLite(Memoria):
    """Guarda todas as interações num arquivo SQLite.

    buscar_contexto() devolve as N interações mais recentes, inclusive de
    sessões anteriores. O banco guarda tudo; só a janela enviada ao LLM é limitada.
    """

    def __init__(self, caminho: str | Path = "virt.db", max_interacoes: int = 20) -> None:
        self._max = max_interacoes
        self._conexao = sqlite3.connect(caminho)
        self._conexao.executescript(_ESQUEMA)

    def salvar(self, evento: Evento, resposta: Intencao) -> None:
        self._conexao.execute(
            "INSERT INTO interacoes (evento, resposta) VALUES (?, ?)",
            (evento.model_dump_json(), resposta.model_dump_json()),
        )
        # Commit a cada interação: se o programa cair, nada se perde
        self._conexao.commit()

    def buscar_contexto(self, evento: Evento) -> list[Interacao]:
        linhas = self._conexao.execute(
            "SELECT evento, resposta FROM interacoes ORDER BY id DESC LIMIT ?",
            (self._max,),
        ).fetchall()
        # A consulta traz da mais nova para a mais antiga; o contrato pede cronológica
        return [
            Interacao(
                evento=Evento.model_validate_json(ev),
                resposta=Intencao.model_validate_json(resp),
            )
            for ev, resp in reversed(linhas)
        ]

    def buscar_fatos(self) -> list[str]:
        return [texto for (texto,) in self._conexao.execute("SELECT texto FROM fatos ORDER BY id")]

    def substituir_fatos(self, fatos: list[str]) -> None:
        # "with" = transação: ou troca tudo, ou não troca nada
        with self._conexao:
            self._conexao.execute("DELETE FROM fatos")
            self._conexao.executemany("INSERT INTO fatos (texto) VALUES (?)", [(f,) for f in fatos])

    def total(self) -> int:
        """Quantas interações estão guardadas no banco."""
        return self._conexao.execute("SELECT COUNT(*) FROM interacoes").fetchone()[0]

    def fechar(self) -> None:
        self._conexao.close()
