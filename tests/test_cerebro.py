"""Testes do cérebro usando o LLM falso (não precisam de chave de API)."""

import json

import pytest

from brain.cerebro import Cerebro, RespostaInvalida, interpretar_resposta
from brain.llm import LLMFalso
from core.evento import Evento
from core.intencao import RESPOSTA_PADRAO, Intencao
from memory.sessao import MemoriaSessao

VALIDA = json.dumps({"fala": "Olá, humano.", "emocao": "curioso", "olhar": "usuario", "gesto": "piscar"})


def cerebro_com(*respostas: str, memoria: MemoriaSessao | None = None) -> Cerebro:
    return Cerebro(LLMFalso(list(respostas)), memoria or MemoriaSessao(), "Nome: teste")


def test_resposta_valida() -> None:
    intencao = cerebro_com(VALIDA).pensar(Evento(tipo="fala", conteudo="oi"))
    assert intencao.fala == "Olá, humano."
    assert intencao.emocao == "curioso"


def test_json_dentro_de_bloco_de_codigo() -> None:
    assert interpretar_resposta(f"Claro!\n```json\n{VALIDA}\n```").gesto == "piscar"


def test_valor_fora_do_enum_e_invalido() -> None:
    with pytest.raises(RespostaInvalida):
        interpretar_resposta(VALIDA.replace("curioso", "eufórico"))


def test_tenta_de_novo_uma_vez() -> None:
    intencao = cerebro_com("isso não é json", VALIDA).pensar(Evento(tipo="fala", conteudo="oi"))
    assert intencao.fala == "Olá, humano."


def test_usa_resposta_padrao_apos_duas_falhas() -> None:
    intencao = cerebro_com("lixo", '{"fala": 1}').pensar(Evento(tipo="silencio"))
    assert intencao == RESPOSTA_PADRAO


def test_historico_entra_no_contexto() -> None:
    memoria = MemoriaSessao(max_interacoes=2)
    for i in range(3):
        memoria.salvar(Evento(tipo="fala", conteudo=f"msg {i}"), Intencao.model_validate_json(VALIDA))
    mensagens = cerebro_com(memoria=memoria)._montar_mensagens(Evento(tipo="fala", conteudo="nova"))
    # 2 interações guardadas (a mais antiga foi descartada) x 2 mensagens + evento atual
    assert [m["role"] for m in mensagens] == ["user", "assistant", "user", "assistant", "user"]
    assert mensagens[0]["content"] == "[fala] msg 1"
    assert mensagens[-1]["content"] == "[fala] nova"


def test_evento_serializa_no_formato_padrao() -> None:
    dados = Evento(tipo="fala", conteudo="oi").para_dict()
    assert set(dados) == {"tipo", "conteudo", "timestamp"}
