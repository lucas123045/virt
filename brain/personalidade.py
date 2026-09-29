"""Carregamento da personalidade a partir de um arquivo Markdown."""

from __future__ import annotations

from pathlib import Path


def carregar_personalidade(caminho: str | Path) -> str:
    """Lê o arquivo de personalidade. Falha com mensagem clara se não existir."""
    arquivo = Path(caminho)
    if not arquivo.is_file():
        raise FileNotFoundError(f"Arquivo de personalidade não encontrado: {arquivo.resolve()}")
    texto = arquivo.read_text(encoding="utf-8").strip()
    if not texto:
        raise ValueError(f"Arquivo de personalidade vazio: {arquivo.resolve()}")
    return texto
