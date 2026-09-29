"""Interface abstrata de memória."""

from __future__ import annotations

from abc import ABC, abstractmethod

from pydantic import BaseModel

from core.evento import Evento
from core.intencao import Intencao


class Interacao(BaseModel):
    """Um par evento -> resposta, a unidade básica guardada na memória."""

    evento: Evento
    resposta: Intencao


class Memoria(ABC):
    """Contrato de memória usado pelo cérebro e pelo loop principal.

    Implementações futuras previstas:
      - MemoriaSQLite: persiste todas as interações entre sessões.
      - MemoriaVetorial: indexa embeddings e busca_contexto() devolve as
        interações semanticamente mais próximas do evento atual.
    Ambas podem ser combinadas (ex.: histórico recente + lembranças relevantes).
    """

    @abstractmethod
    def salvar(self, evento: Evento, resposta: Intencao) -> None:
        """Registra uma interação."""

    @abstractmethod
    def buscar_contexto(self, evento: Evento) -> list[Interacao]:
        """Retorna as interações relevantes para responder a este evento,
        em ordem cronológica (mais antiga primeiro)."""

    # --- Memória de longo prazo: fatos curtos e duráveis ("o nome dele é Lucas").
    # Quem extrai os fatos é o cérebro; a memória só os guarda.

    @abstractmethod
    def buscar_fatos(self) -> list[str]:
        """Retorna os fatos lembrados sobre as pessoas e o próprio robô."""

    @abstractmethod
    def substituir_fatos(self, fatos: list[str]) -> None:
        """Troca a lista inteira de fatos pela versão consolidada."""

    def fechar(self) -> None:
        """Libera recursos (conexões de banco etc.). Opcional."""
