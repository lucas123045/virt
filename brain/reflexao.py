"""Reflexão: resume conversas recentes numa lista curta de fatos duráveis.

É o que permite ao virt lembrar de coisas antigas sem mandar o histórico
inteiro ao LLM: os fatos ocupam espaço fixo no prompt, não importa quantas
conversas já aconteceram.
"""

from __future__ import annotations

import logging

from pydantic import BaseModel, ValidationError

from brain.json_util import extrair_json
from brain.llm import ProvedorLLM
from brain.prompt import descrever_evento
from memory.base import Interacao

log = logging.getLogger(__name__)

# Limita quantas interações vão para uma única reflexão (evita prompts gigantes
# se várias reflexões seguidas falharem e as pendências se acumularem)
MAX_INTERACOES_POR_REFLEXAO = 50

_INSTRUCOES = """Você é o módulo de memória de longo prazo de um robô chamado virt.
Recebe a lista atual de fatos lembrados e um trecho recente de conversa.
Devolva a lista ATUALIZADA de fatos, em JSON: {{"fatos": ["...", "..."]}}

Regras:
- Fatos curtos (uma frase), em português, na terceira pessoa ("O Lucas gosta de café").
- Guarde só o que vale lembrar em conversas futuras: nomes, preferências, planos,
  acontecimentos marcantes, apelidos, coisas que o virt prometeu ou contou de si.
- Ignore conversa fiada, cumprimentos e o que não diz nada sobre ninguém.
- Mantenha os fatos antigos que continuam válidos; corrija os que a conversa
  contradisse; junte duplicados.
- No máximo {max_fatos} fatos; se passar disso, descarte os menos importantes.
- Responda SOMENTE com o JSON."""


class Fatos(BaseModel):
    fatos: list[str]


def _transcrever(interacoes: list[Interacao]) -> str:
    """Conversa em texto corrido, legível para o LLM."""
    linhas = []
    for i in interacoes:
        linhas.append(f"Entrada: {descrever_evento(i.evento)}")
        linhas.append(f"virt ({i.resposta.emocao}): {i.resposta.fala or '(em silêncio)'}")
    return "\n".join(linhas)


def consolidar_fatos(
    llm: ProvedorLLM, fatos_atuais: list[str], interacoes: list[Interacao], max_fatos: int
) -> list[str] | None:
    """Retorna a nova lista de fatos, ou None se a reflexão falhou
    (nesse caso os fatos atuais devem ser mantidos como estão)."""
    atuais = "\n".join(f"- {f}" for f in fatos_atuais) or "(nenhum ainda)"
    conversa = _transcrever(interacoes[-MAX_INTERACOES_POR_REFLEXAO:])
    try:
        bruto = llm.gerar(
            _INSTRUCOES.format(max_fatos=max_fatos),
            [{"role": "user", "content": f"Fatos atuais:\n{atuais}\n\nConversa recente:\n{conversa}"}],
        )
        resultado = Fatos.model_validate_json(extrair_json(bruto))
    except (ValueError, ValidationError) as erro:
        log.warning("Reflexão devolveu um formato inválido; fatos mantidos. (%s)", erro)
        return None
    except Exception:
        log.exception("Falha ao chamar o LLM durante a reflexão; fatos mantidos.")
        return None
    # Limpa vazios e respeita o limite mesmo se o LLM exagerar
    return [f.strip() for f in resultado.fatos if f.strip()][:max_fatos]
