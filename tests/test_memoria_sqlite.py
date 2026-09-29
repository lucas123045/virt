"""Testes da memória SQLite (usa um banco temporário)."""

from pathlib import Path

from core.evento import Evento
from core.intencao import Intencao
from memory.sqlite import MemoriaSQLite

RESPOSTA = Intencao(fala="Anotado.", emocao="curioso", olhar="usuario", gesto="acenar_cabeca")


def test_persiste_entre_sessoes(tmp_path: Path) -> None:
    banco = tmp_path / "teste.db"

    memoria = MemoriaSQLite(banco)
    memoria.salvar(Evento(tipo="fala", conteudo="meu nome é Lucas"), RESPOSTA)
    memoria.fechar()

    # "Religa" o robô: nova instância, mesmo arquivo
    memoria = MemoriaSQLite(banco)
    contexto = memoria.buscar_contexto(Evento(tipo="fala", conteudo="lembra de mim?"))
    memoria.fechar()

    assert len(contexto) == 1
    assert contexto[0].evento.conteudo == "meu nome é Lucas"
    assert contexto[0].resposta == RESPOSTA


def test_janela_devolve_as_mais_recentes_em_ordem(tmp_path: Path) -> None:
    memoria = MemoriaSQLite(tmp_path / "teste.db", max_interacoes=3)
    for i in range(5):
        memoria.salvar(Evento(tipo="fala", conteudo=f"msg {i}"), RESPOSTA)

    contexto = memoria.buscar_contexto(Evento(tipo="silencio"))
    assert [i.evento.conteudo for i in contexto] == ["msg 2", "msg 3", "msg 4"]
    assert memoria.total() == 5  # o banco guarda tudo; só a janela é limitada
    memoria.fechar()
