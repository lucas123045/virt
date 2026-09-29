"""Corpo de texto: mostra a intenção de forma legível no terminal."""

from __future__ import annotations

import os
import sys

from core.intencao import Emocao, Gesto, Intencao, Olhar
from expression.base import Corpo

# Rostinho em texto para cada emoção
ROSTOS: dict[Emocao, str] = {
    "neutro": "[ o_o ]",
    "feliz": "[ ^_^ ]",
    "curioso": "[ o_O ]",
    "desconfiado": "[ ¬_¬ ]",
    "irritado": "[ >_< ]",
    "triste": "[ T_T ]",
}

# Cores ANSI por emoção
CORES: dict[Emocao, str] = {
    "neutro": "\033[37m",
    "feliz": "\033[92m",
    "curioso": "\033[96m",
    "desconfiado": "\033[93m",
    "irritado": "\033[91m",
    "triste": "\033[94m",
}

OLHARES: dict[Olhar, str] = {
    "usuario": "olhando para você",
    "baixo": "olhando para baixo",
    "lado": "olhando de lado",
    "cima": "olhando para cima",
}

GESTOS: dict[Gesto, str] = {
    "nenhum": "",
    "inclinar_cabeca": "inclina a cabeça",
    "acenar_cabeca": "acena com a cabeça",
    "negar_cabeca": "balança a cabeça negando",
    "piscar": "pisca devagar",
}

RESET = "\033[0m"
DIM = "\033[2m"


def _suporta_cor() -> bool:
    """Usa cor só em terminal interativo e se NO_COLOR não estiver definido."""
    if os.environ.get("NO_COLOR") or not sys.stdout.isatty():
        return False
    if os.name == "nt":
        # Truque conhecido: ativa o modo de sequências ANSI no console do Windows
        os.system("")
    return True


class TerminalBody(Corpo):
    """Imprime a fala e descreve emoção, olhar e gesto."""

    def __init__(self, nome: str = "virt", cores: bool | None = None) -> None:
        self._nome = nome
        self._cores = _suporta_cor() if cores is None else cores

    def _c(self, codigo: str) -> str:
        return codigo if self._cores else ""

    def executar(self, intencao: Intencao) -> None:
        cor = self._c(CORES[intencao.emocao])
        reset, dim = self._c(RESET), self._c(DIM)

        # Linha de "linguagem corporal": rosto, emoção, olhar e gesto
        corpo = [intencao.emocao, OLHARES[intencao.olhar]]
        if GESTOS[intencao.gesto]:
            corpo.append(GESTOS[intencao.gesto])
        print(f"{cor}{ROSTOS[intencao.emocao]}{reset} {dim}*{', '.join(corpo)}*{reset}")

        # A fala propriamente dita
        if intencao.fala:
            print(f"{cor}{self._nome}>{reset} {intencao.fala}")
        print()
