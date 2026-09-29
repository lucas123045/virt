"""Testes da memória de fatos e do corte de contexto (sem chave de API)."""

import json
from pathlib import Path

from brain.cerebro import Cerebro
from brain.llm import LLMFalso
from brain.prompt import montar_prompt_sistema
from core.evento import Evento
from core.intencao import Intencao
from memory.sessao import MemoriaSessao
from memory.sqlite import MemoriaSQLite

RESPOSTA = json.dumps({"fala": "Anotado.", "emocao": "curioso", "olhar": "usuario", "gesto": "piscar"})
FATOS = json.dumps({"fatos": ["O Lucas gosta de café.", "  ", "O Lucas mora em SP."]})


def test_reflete_depois_de_n_interacoes() -> None:
    memoria = MemoriaSessao()
    cerebro = Cerebro(LLMFalso([RESPOSTA, RESPOSTA, FATOS]), memoria, "Nome: teste", refletir_a_cada=2)

    cerebro.pensar(Evento(tipo="fala", conteudo="gosto de café"))
    assert cerebro.refletir() is False  # só 1 pendente, ainda não reflete

    cerebro.pensar(Evento(tipo="fala", conteudo="moro em SP"))
    assert cerebro.refletir() is True
    # Fato vazio é descartado
    assert memoria.buscar_fatos() == ["O Lucas gosta de café.", "O Lucas mora em SP."]


def test_reflexao_invalida_mantem_fatos_e_pendencias() -> None:
    memoria = MemoriaSessao()
    memoria.substituir_fatos(["fato antigo"])
    cerebro = Cerebro(LLMFalso([RESPOSTA, "não é json", FATOS]), memoria, "Nome: teste")

    cerebro.pensar(Evento(tipo="fala", conteudo="oi"))
    assert cerebro.refletir(forcar=True) is False
    assert memoria.buscar_fatos() == ["fato antigo"]
    # A pendência não se perdeu: a próxima tentativa funciona
    assert cerebro.refletir(forcar=True) is True


def test_fatos_entram_no_prompt() -> None:
    prompt = montar_prompt_sistema("Nome: teste", ["O Lucas gosta de café."])
    assert "- O Lucas gosta de café." in prompt


def test_contexto_e_cortado_pelo_orcamento() -> None:
    memoria = MemoriaSessao(max_interacoes=1000)
    for i in range(500):
        memoria.salvar(Evento(tipo="fala", conteudo=f"mensagem {i} " + "x" * 100), Intencao.model_validate_json(RESPOSTA))
    cerebro = Cerebro(LLMFalso(), memoria, "Nome: teste", max_tokens_contexto=2000)

    mensagens = cerebro._montar_mensagens(Evento(tipo="fala", conteudo="nova"))
    assert 1 < len(mensagens) < 1000               # cortou, mas manteve parte do histórico
    assert "mensagem 499" in mensagens[-3]["content"]  # a mais recente está lá
    assert mensagens[-1]["content"] == "[fala] nova"
    assert sum(len(m["content"]) for m in mensagens) // 3 <= 2000


def test_fatos_persistem_no_sqlite(tmp_path: Path) -> None:
    banco = tmp_path / "teste.db"
    memoria = MemoriaSQLite(banco)
    memoria.substituir_fatos(["O Lucas gosta de café."])
    memoria.substituir_fatos(["O Lucas gosta de café.", "O Lucas tem um gato."])
    memoria.fechar()

    memoria = MemoriaSQLite(banco)
    assert memoria.buscar_fatos() == ["O Lucas gosta de café.", "O Lucas tem um gato."]
    memoria.fechar()
