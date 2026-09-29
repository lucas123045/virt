"""Utilitários para extrair JSON do texto devolvido pelo LLM."""

from __future__ import annotations

import re

# Captura o conteúdo de um bloco ```json ... ``` caso o modelo insista em usá-lo
_BLOCO_CODIGO = re.compile(r"```(?:json)?\s*(.*?)\s*```", re.DOTALL)


def extrair_json(bruto: str) -> str:
    """Isola o objeto JSON de uma resposta, tolerando blocos de código e
    texto antes/depois. Lança ValueError se não houver nenhum objeto."""
    texto = bruto.strip()
    if bloco := _BLOCO_CODIGO.search(texto):
        texto = bloco.group(1)
    inicio, fim = texto.find("{"), texto.rfind("}")
    if inicio == -1 or fim <= inicio:
        raise ValueError("nenhum objeto JSON encontrado")
    return texto[inicio : fim + 1]
