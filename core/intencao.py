"""Intenção: o que o cérebro decidiu fazer em resposta a um evento.

É o contrato entre o cérebro e qualquer corpo (terminal, tela, servos).
O LLM precisa responder exatamente neste formato JSON.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict

Emocao = Literal["neutro", "feliz", "curioso", "desconfiado", "irritado", "triste"]
Olhar = Literal["usuario", "baixo", "lado", "cima"]
Gesto = Literal["nenhum", "inclinar_cabeca", "acenar_cabeca", "negar_cabeca", "piscar"]


class Intencao(BaseModel):
    """Resposta estruturada do cérebro: fala + expressão corporal."""

    # Campos extras vindos do LLM são ignorados em vez de quebrar a validação.
    model_config = ConfigDict(extra="ignore")

    fala: str
    emocao: Emocao
    olhar: Olhar
    gesto: Gesto


# Resposta usada quando o LLM falha duas vezes ou a API está fora do ar.
RESPOSTA_PADRAO = Intencao(
    fala="Repita. Devagar.",
    emocao="neutro",
    olhar="usuario",
    gesto="nenhum",
)
