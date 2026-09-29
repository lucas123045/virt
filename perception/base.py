"""Interface abstrata de percepção."""

from __future__ import annotations

from abc import ABC, abstractmethod

from core.evento import Evento


class Percepcao(ABC):
    """Fonte de eventos do robô.

    Implementações futuras previstas:
      - VozMicrofone: captura áudio, faz STT e gera eventos "fala"/"silencio".
      - Camera: detecta rostos e gera eventos "rosto_detectado".
    Para combinar várias fontes ao mesmo tempo, cada uma pode rodar numa
    thread e publicar numa fila; uma Percepcao "combinada" lê dessa fila.
    """

    @abstractmethod
    def perceber(self) -> Evento | None:
        """Bloqueia até o próximo evento. Retorna None quando a fonte encerrou."""

    def fechar(self) -> None:
        """Libera recursos (microfone, câmera...). Opcional."""
