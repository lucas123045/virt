"""Interface abstrata de corpo."""

from __future__ import annotations

from abc import ABC, abstractmethod

from core.intencao import Intencao


class Corpo(ABC):
    """Qualquer forma física ou visual de expressar uma Intencao.

    Implementações futuras previstas (sem nenhuma mudança no cérebro):
      - ScreenFaceBody: desenha olhos/boca numa tela (ex.: pygame).
      - ServoBody: traduz emoção/olhar/gesto em ângulos e envia via serial
        para o Arduino; a fala vai para um TTS sincronizado com a mandíbula.
    """

    @abstractmethod
    def executar(self, intencao: Intencao) -> None:
        """Expressa a intenção (fala, emoção, olhar e gesto)."""

    def desligar(self) -> None:
        """Volta à posição de repouso e libera recursos. Opcional."""


class CorpoComposto(Corpo):
    """Executa a mesma intenção em vários corpos (ex.: servos + log no terminal)."""

    def __init__(self, *corpos: Corpo) -> None:
        self._corpos = corpos

    def executar(self, intencao: Intencao) -> None:
        for corpo in self._corpos:
            corpo.executar(intencao)

    def desligar(self) -> None:
        for corpo in self._corpos:
            corpo.desligar()
