"""Montagem do prompt: personalidade + regras de formato + descrição dos eventos."""

from __future__ import annotations

import json
from typing import get_args

from core.evento import Evento
from core.intencao import Emocao, Gesto, Intencao, Olhar


def _opcoes(tipo: object) -> str:
    """Lista os valores de um Literal, ex.: "feliz" | "triste"."""
    return " | ".join(f'"{v}"' for v in get_args(tipo))


def montar_prompt_sistema(personalidade: str, fatos: list[str] | None = None) -> str:
    """Prompt de sistema. As opções vêm dos próprios Literals do Pydantic,
    então o prompt nunca fica dessincronizado do contrato em core/intencao.py."""
    lembrancas = ""
    if fatos:
        itens = "\n".join(f"- {f}" for f in fatos)
        lembrancas = (
            "\n\n## O que você lembra de conversas anteriores\n"
            f"{itens}\nUse essas lembranças com naturalidade, sem recitá-las."
        )
    return f"""{personalidade}{lembrancas}

## Como você percebe o mundo
Cada mensagem do usuário é um evento dos seus sentidos, no formato "[tipo] conteúdo":
- [fala] alguém falou com você; o conteúdo é o que foi dito.
- [rosto_detectado] sua câmera viu um rosto; o conteúdo é o nome, se conhecido.
- [silencio] ninguém disse nada por um tempo. Você pode puxar assunto, comentar
  algo ou ficar quieto (fala vazia "").

## Formato OBRIGATÓRIO da resposta
Responda SOMENTE com um objeto JSON, sem texto antes ou depois e sem blocos de código:
{{
  "fala": "o que você diz em voz alta",
  "emocao": {_opcoes(Emocao)},
  "olhar": {_opcoes(Olhar)},
  "gesto": {_opcoes(Gesto)}
}}
Emoção, olhar e gesto devem combinar com o que você diz."""


def descrever_evento(evento: Evento) -> str:
    """Converte um evento na mensagem de "usuário" enviada ao LLM."""
    match evento.tipo:
        case "fala":
            return f"[fala] {evento.conteudo}"
        case "rosto_detectado":
            return f"[rosto_detectado] {evento.conteudo or 'desconhecido'}"
        case "silencio":
            return "[silencio]"
        case _:
            # Tipos novos ainda não mapeados caem aqui com o conteúdo cru
            return f"[{evento.tipo}] {evento.conteudo or ''}".strip()


def serializar_intencao(intencao: Intencao) -> str:
    """Intenção como JSON compacto, usada no histórico como resposta do assistente.
    Mostrar respostas anteriores já em JSON reforça o formato para o LLM."""
    return json.dumps(intencao.model_dump(), ensure_ascii=False)


def mensagem_correcao(erro: str) -> str:
    """Pedido de correção enviado quando o LLM devolve um JSON inválido."""
    return (
        f"Sua resposta anterior não era um JSON válido no formato exigido ({erro}). "
        "Responda novamente APENAS com o objeto JSON, com os campos "
        "fala, emocao, olhar e gesto usando somente os valores permitidos."
    )
