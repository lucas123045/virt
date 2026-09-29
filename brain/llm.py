"""Provedores de LLM intercambiáveis (Anthropic, OpenAI e um falso para testes).

O cérebro só conhece a interface ProvedorLLM: recebe o prompt de sistema e
a lista de mensagens, devolve o texto cru. Validar o JSON é tarefa do cérebro.
"""

from __future__ import annotations

import json
import random
from abc import ABC, abstractmethod
from typing import Literal, TypedDict

from config import Configuracao


class Mensagem(TypedDict):
    role: Literal["user", "assistant"]
    content: str


class ProvedorLLM(ABC):
    """Interface comum para qualquer LLM."""

    @abstractmethod
    def gerar(self, sistema: str, mensagens: list[Mensagem]) -> str:
        """Retorna o texto bruto gerado pelo modelo."""


class AnthropicLLM(ProvedorLLM):
    def __init__(self, chave_api: str, modelo: str, max_tokens: int) -> None:
        # Import tardio: só exige o pacote do provedor que está sendo usado
        import anthropic

        self._cliente = anthropic.Anthropic(api_key=chave_api)
        self._modelo = modelo
        self._max_tokens = max_tokens

    def gerar(self, sistema: str, mensagens: list[Mensagem]) -> str:
        resposta = self._cliente.messages.create(
            model=self._modelo,
            max_tokens=self._max_tokens,
            system=sistema,
            messages=mensagens,
        )
        return "".join(bloco.text for bloco in resposta.content if bloco.type == "text")


class OpenAILLM(ProvedorLLM):
    def __init__(self, chave_api: str, modelo: str, max_tokens: int) -> None:
        from openai import OpenAI

        self._cliente = OpenAI(api_key=chave_api)
        self._modelo = modelo
        self._max_tokens = max_tokens

    def gerar(self, sistema: str, mensagens: list[Mensagem]) -> str:
        resposta = self._cliente.chat.completions.create(
            model=self._modelo,
            max_completion_tokens=self._max_tokens,
            # "json_object" obriga o modelo a devolver um JSON sintaticamente válido
            response_format={"type": "json_object"},
            messages=[{"role": "system", "content": sistema}, *mensagens],
        )
        return resposta.choices[0].message.content or ""


class LLMFalso(ProvedorLLM):
    """LLM offline para testar o pipeline sem chave de API.

    Se receber uma lista de respostas prontas, devolve-as em ordem (útil em testes);
    caso contrário, improvisa uma resposta ecoando a última mensagem.
    """

    def __init__(self, respostas: list[str] | None = None) -> None:
        self._respostas = list(respostas) if respostas else None

    def gerar(self, sistema: str, mensagens: list[Mensagem]) -> str:
        if self._respostas is not None:
            return self._respostas.pop(0)
        ultima = mensagens[-1]["content"] if mensagens else ""
        return json.dumps(
            {
                "fala": f"(modo offline) Registrei: {ultima}",
                "emocao": random.choice(["curioso", "desconfiado", "neutro"]),
                "olhar": "usuario",
                "gesto": random.choice(["inclinar_cabeca", "piscar", "nenhum"]),
            },
            ensure_ascii=False,
        )


def criar_llm(config: Configuracao) -> ProvedorLLM:
    """Fábrica: escolhe o provedor conforme LLM_PROVIDER no .env."""
    match config.provedor:
        case "anthropic":
            return AnthropicLLM(config.chave_api_obrigatoria(), config.modelo, config.max_tokens)
        case "openai":
            return OpenAILLM(config.chave_api_obrigatoria(), config.modelo, config.max_tokens)
        case "mock":
            return LLMFalso()
