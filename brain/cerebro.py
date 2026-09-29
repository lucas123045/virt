"""O cérebro: evento + contexto -> LLM -> Intencao validada."""

from __future__ import annotations

import logging

from pydantic import ValidationError

from brain.json_util import extrair_json
from brain.llm import Mensagem, ProvedorLLM
from brain.prompt import (
    descrever_evento,
    mensagem_correcao,
    montar_prompt_sistema,
    serializar_intencao,
)
from brain.reflexao import consolidar_fatos
from core.evento import Evento
from core.intencao import RESPOSTA_PADRAO, Intencao
from memory.base import Interacao, Memoria

log = logging.getLogger(__name__)


class RespostaInvalida(ValueError):
    """O texto do LLM não pôde ser convertido numa Intencao válida."""


def interpretar_resposta(bruto: str) -> Intencao:
    """Extrai e valida o JSON da resposta do LLM.

    Tolera ruído comum (blocos de código, texto antes/depois do objeto),
    mas exige que o objeto em si respeite o contrato Intencao.
    """
    try:
        return Intencao.model_validate_json(extrair_json(bruto))
    except ValidationError as erro:
        # Resume os erros do Pydantic numa frase curta para devolver ao LLM
        detalhes = "; ".join(
            f"{'.'.join(map(str, e['loc'])) or 'json'}: {e['msg']}" for e in erro.errors()
        )
        raise RespostaInvalida(detalhes) from erro
    except ValueError as erro:
        raise RespostaInvalida(str(erro)) from erro


def estimar_tokens(texto: str) -> int:
    """Estimativa grosseira e conservadora (~3 caracteres por token em português).
    Evita depender do tokenizador de cada provedor."""
    return len(texto) // 3 + 1


class Cerebro:
    """Monta o contexto, consulta o LLM e garante uma Intencao válida.

    Também "reflete": a cada N interações (e ao desligar) resume a conversa
    em fatos duráveis, que ficam sempre no prompt de sistema.
    """

    def __init__(
        self,
        llm: ProvedorLLM,
        memoria: Memoria,
        personalidade: str,
        max_tokens_contexto: int = 8000,
        refletir_a_cada: int = 10,
        max_fatos: int = 30,
    ) -> None:
        self._llm = llm
        self._memoria = memoria
        self._personalidade = personalidade
        self._max_tokens_contexto = max_tokens_contexto
        self._refletir_a_cada = refletir_a_cada
        self._max_fatos = max_fatos
        # Interações desta sessão que ainda não viraram fatos
        self._pendentes: list[Interacao] = []

    def pensar(self, evento: Evento) -> Intencao:
        """Decide como reagir ao evento. Nunca lança exceção: no pior caso
        devolve RESPOSTA_PADRAO, para o corpo sempre ter algo a executar."""
        # Montado a cada chamada porque os fatos mudam depois de cada reflexão
        sistema = montar_prompt_sistema(self._personalidade, self._memoria.buscar_fatos())
        mensagens = self._montar_mensagens(evento, sistema)

        intencao = self._consultar(sistema, mensagens)
        if intencao is not RESPOSTA_PADRAO:
            self._pendentes.append(Interacao(evento=evento, resposta=intencao))
        return intencao

    def refletir(self, forcar: bool = False) -> bool:
        """Transforma as interações pendentes em fatos na memória.

        Sem `forcar`, só age quando há pendências suficientes. Retorna True se
        uma reflexão aconteceu com sucesso. Se falhar, as pendências ficam
        guardadas para a próxima tentativa.
        """
        if not self._pendentes or (not forcar and len(self._pendentes) < self._refletir_a_cada):
            return False
        novos = consolidar_fatos(
            self._llm, self._memoria.buscar_fatos(), self._pendentes, self._max_fatos
        )
        if novos is None:
            return False
        self._memoria.substituir_fatos(novos)
        self._pendentes.clear()
        return True

    def _consultar(self, sistema: str, mensagens: list[Mensagem]) -> Intencao:
        """Chama o LLM com até 2 tentativas: a original e uma com pedido de correção."""
        for tentativa in (1, 2):
            try:
                bruto = self._llm.gerar(sistema, mensagens)
            except Exception:
                # Erro de rede/API/autenticação: não adianta insistir agora
                log.exception("Falha ao chamar o LLM")
                return RESPOSTA_PADRAO

            try:
                return interpretar_resposta(bruto)
            except RespostaInvalida as erro:
                log.warning("Resposta inválida do LLM (tentativa %d): %s | %r", tentativa, erro, bruto)
                # Mostra ao modelo o que ele respondeu e pede para corrigir
                mensagens = [
                    *mensagens,
                    {"role": "assistant", "content": bruto.strip() or "(vazio)"},
                    {"role": "user", "content": mensagem_correcao(str(erro))},
                ]

        return RESPOSTA_PADRAO

    def _montar_mensagens(self, evento: Evento, sistema: str = "") -> list[Mensagem]:
        """Histórico da memória (alternando user/assistant) + evento atual,
        cortando as interações mais antigas que não cabem no orçamento de tokens."""
        atual: Mensagem = {"role": "user", "content": descrever_evento(evento)}
        orcamento = self._max_tokens_contexto - estimar_tokens(sistema) - estimar_tokens(atual["content"])

        # Percorre da mais nova para a mais antiga, parando quando estourar
        pares: list[tuple[Mensagem, Mensagem]] = []
        for interacao in reversed(self._memoria.buscar_contexto(evento)):
            usuario: Mensagem = {"role": "user", "content": descrever_evento(interacao.evento)}
            robo: Mensagem = {"role": "assistant", "content": serializar_intencao(interacao.resposta)}
            custo = estimar_tokens(usuario["content"]) + estimar_tokens(robo["content"])
            if custo > orcamento:
                break
            orcamento -= custo
            pares.append((usuario, robo))

        mensagens: list[Mensagem] = []
        for usuario, robo in reversed(pares):
            mensagens += [usuario, robo]
        mensagens.append(atual)
        return mensagens
