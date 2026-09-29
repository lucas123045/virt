"""Corpo virtual: o virt em 3D na oficina, animado no navegador."""

from __future__ import annotations

import threading
import uuid

from core.intencao import Intencao
from expression.base import Corpo
from expression.sintetizador import SintetizadorWindows
from web.servidor import ServidorWeb


class WebBody(Corpo):
    """Envia cada intenção para os navegadores conectados.

    A tradução de emoção/olhar/gesto em movimento acontece no navegador
    (web/static/virt3d.js), do mesmo jeito que um ServoBody traduziria
    em ângulos de servo.
    """

    def __init__(self, servidor: ServidorWeb, sintetizador: SintetizadorWindows | None = None) -> None:
        self._servidor = servidor
        self._sintetizador = sintetizador

    def executar(self, intencao: Intencao) -> None:
        dados = intencao.model_dump()
        if self._sintetizador and self._sintetizador.disponivel and intencao.fala.strip():
            # A voz é gerada em paralelo: o texto chega na hora e o navegador
            # busca o áudio em /voz/<id>.wav (o servidor espera ficar pronto)
            ident = uuid.uuid4().hex[:16]
            self._servidor.reservar_audio(ident)
            threading.Thread(
                target=lambda: self._servidor.entregar_audio(ident, self._sintetizador.sintetizar(intencao.fala)),
                daemon=True,
            ).start()
            dados["audio"] = f"/voz/{ident}.wav"
        self._servidor.publicar("intencao", dados)
