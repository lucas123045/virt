"""Síntese de voz local com o sintetizador embutido no Windows.

Gera a fala do virt em WAV com a voz masculina "Daniel" (pt-BR), já lenta,
grave e com pausas desconfortáveis (via SSML). Os efeitos de animatrônico
(fita desacelerada, alto-falante velho, eco) são aplicados no navegador.
Fora do Windows, `disponivel` é False e o navegador usa a própria voz.
"""

from __future__ import annotations

import logging
import os
import re
import subprocess
import tempfile
from pathlib import Path
from xml.sax.saxutils import escape

log = logging.getLogger(__name__)

SCRIPT = Path(__file__).with_name("voz_windows.ps1")

# Pausas em milissegundos após cada tipo de pontuação
PAUSA_FRASE = 450
PAUSA_VIRGULA = 200


def montar_ssml(texto: str, velocidade: str = "-5%", tom: str = "-35%") -> str:
    """Converte a fala em SSML: um pouco mais lenta, bem mais grave e com pausas.
    (O navegador ainda desacelera a "fita", então a velocidade aqui fica perto do normal.)"""
    partes: list[str] = []
    for trecho in re.findall(r"[^.!?…;:,]+[.!?…;:,]*", texto) or [texto]:
        trecho = trecho.strip()
        if not trecho:
            continue
        partes.append(escape(trecho))
        if trecho[-1] in ".!?…;:":
            partes.append(f'<break time="{PAUSA_FRASE}ms"/>')
        elif trecho[-1] == ",":
            partes.append(f'<break time="{PAUSA_VIRGULA}ms"/>')
    corpo = " ".join(partes)
    return (
        '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="pt-BR">'
        f'<prosody rate="{velocidade}" pitch="{tom}">{corpo}</prosody></speak>'
    )


class SintetizadorWindows:
    def __init__(self, voz: str = "Daniel", tempo_limite: float = 20.0) -> None:
        self._voz = voz
        self._tempo_limite = tempo_limite

    @property
    def disponivel(self) -> bool:
        return os.name == "nt" and SCRIPT.is_file()

    def sintetizar(self, texto: str) -> bytes | None:
        """Retorna o WAV da fala, ou None se a síntese falhar."""
        if not self.disponivel or not texto.strip():
            return None
        with tempfile.TemporaryDirectory(prefix="virt_voz_") as pasta:
            entrada = Path(pasta) / "fala.ssml"
            saida = Path(pasta) / "fala.wav"
            entrada.write_text(montar_ssml(texto), encoding="utf-8")
            try:
                subprocess.run(
                    [
                        "powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
                        "-File", str(SCRIPT), "-Entrada", str(entrada), "-Saida", str(saida), "-Voz", self._voz,
                    ],
                    check=True,
                    capture_output=True,
                    timeout=self._tempo_limite,
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                )
                return saida.read_bytes()
            except (subprocess.SubprocessError, OSError) as erro:
                detalhe = getattr(erro, "stderr", b"") or b""
                log.warning("Falha ao sintetizar a voz: %s %s", erro, detalhe.decode("utf-8", "replace")[:300])
                return None
