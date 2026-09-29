"""Ponto de entrada do virt: percepção -> cérebro -> memória -> expressão."""

from __future__ import annotations

import logging
import sys
import webbrowser

from brain import Cerebro, carregar_personalidade, criar_llm
from config import Configuracao
from core.evento import Evento
from expression import Corpo, CorpoComposto, TerminalBody
from memory import Memoria, MemoriaSessao, MemoriaSQLite
from perception import Percepcao, TextoTerminal
from perception.texto_terminal import AJUDA
from web import ServidorWeb


def ciclo(percepcao: Percepcao, cerebro: Cerebro, memoria: Memoria, corpo: Corpo) -> None:
    """Loop principal. Cada módulo só conhece os contratos (Evento/Intencao),
    então trocar TextoTerminal por voz ou TerminalBody por servos não muda nada aqui."""
    while True:
        evento: Evento | None = percepcao.perceber()   # 1. percepção
        if evento is None:
            break
        intencao = cerebro.pensar(evento)               # 2. cérebro
        memoria.salvar(evento, intencao)                # 3. memória
        corpo.executar(intencao)                        # 4. expressão
        cerebro.refletir()                              # 5. a cada N interações, vira fatos


def criar_memoria(config: Configuracao) -> Memoria:
    """Escolhe a memória conforme MEMORY_BACKEND no .env."""
    if config.tipo_memoria == "sqlite":
        return MemoriaSQLite(config.arquivo_banco, max_interacoes=config.max_interacoes_memoria)
    return MemoriaSessao(max_interacoes=config.max_interacoes_memoria)


def main() -> int:
    # Garante acentos corretos no console do Windows (inclusive com pipes)
    for fluxo in (sys.stdin, sys.stdout, sys.stderr):
        if hasattr(fluxo, "reconfigure"):
            fluxo.reconfigure(encoding="utf-8")  # type: ignore[union-attr]

    servidor: ServidorWeb | None = None
    try:
        config = Configuracao.do_ambiente()
        logging.basicConfig(level=config.nivel_log, format="%(levelname)s %(name)s: %(message)s")
        personalidade = carregar_personalidade(config.arquivo_personalidade)
        llm = criar_llm(config)
        memoria = criar_memoria(config)
        if config.interface == "web":
            servidor = ServidorWeb(config.porta_web)
            servidor.iniciar()
    except Exception as erro:
        print(f"Erro de configuração: {erro}", file=sys.stderr)
        return 1

    # Montagem das peças: é aqui que se escolhe de onde vêm os eventos
    # e em qual corpo o virt se expressa. O cérebro não muda.
    percepcao: Percepcao
    corpo: Corpo
    if servidor:
        # Imports aqui para o modo terminal não depender do módulo web
        from expression.sintetizador import SintetizadorWindows
        from expression.web import WebBody
        from perception.web import PercepcaoWeb

        percepcao = PercepcaoWeb(servidor, silencio_segundos=config.silencio_segundos)
        # O terminal continua mostrando a conversa como log
        corpo = CorpoComposto(WebBody(servidor, SintetizadorWindows()), TerminalBody(nome="virt"))
        instrucoes = f"Oficina aberta em {servidor.url} | Ctrl+C desliga"
    else:
        percepcao = TextoTerminal()
        corpo = TerminalBody(nome="virt")
        instrucoes = AJUDA

    cerebro = Cerebro(
        llm,
        memoria,
        personalidade,
        max_tokens_contexto=config.max_tokens_contexto,
        refletir_a_cada=config.refletir_a_cada,
        max_fatos=config.max_fatos,
    )

    lembrancas = f"{len(memoria.buscar_fatos())} fatos lembrados"
    if isinstance(memoria, MemoriaSQLite):
        lembrancas = f"{memoria.total()} interações, {lembrancas}"
    print(f"virt online ({config.provedor}/{config.modelo} | memória: {lembrancas}).\n{instrucoes}\n")
    if servidor and config.abrir_navegador:
        webbrowser.open(servidor.url)

    try:
        ciclo(percepcao, cerebro, memoria, corpo)
    except KeyboardInterrupt:
        print()
    finally:
        # Antes de desligar, guarda o que aprendeu nesta sessão como fatos
        print("virt organizando as lembranças...")
        cerebro.refletir(forcar=True)
        percepcao.fechar()
        memoria.fechar()
        corpo.desligar()
        if servidor:
            servidor.parar()
    print("virt desligando... *bzzt*")
    return 0


if __name__ == "__main__":
    sys.exit(main())
