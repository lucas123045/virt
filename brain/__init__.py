"""Cérebro: decide o que o robô fala e expressa a partir de um evento."""

from brain.cerebro import Cerebro
from brain.llm import ProvedorLLM, criar_llm
from brain.personalidade import carregar_personalidade

__all__ = ["Cerebro", "ProvedorLLM", "criar_llm", "carregar_personalidade"]
