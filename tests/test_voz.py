"""Testes da voz: SSML gerado e entrega de áudio pelo servidor web."""

import json
import threading
import urllib.error
import urllib.request

import pytest

from expression.sintetizador import montar_ssml
from web.servidor import ServidorWeb


def test_ssml_tem_pausas_e_escapa_xml() -> None:
    ssml = montar_ssml("Você entrou, humano. Eu & você.")
    assert '<break time="200ms"/>' in ssml   # vírgula
    assert '<break time="450ms"/>' in ssml   # ponto
    assert "&amp;" in ssml and "& " not in ssml
    assert 'pitch="-35%"' in ssml and 'rate="-5%"' in ssml


@pytest.fixture()
def servidor():
    s = ServidorWeb(porta=0, saudar_ao_conectar=False)
    s.iniciar()
    yield s
    s.parar()


def test_entrada_utf8_vira_evento(servidor: ServidorWeb) -> None:
    corpo = json.dumps({"texto": "quem é você?"}).encode("utf-8")
    pedido = urllib.request.Request(f"{servidor.url}/entrada", data=corpo, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(pedido) as resposta:
        assert resposta.status == 204
    assert servidor.entradas.get(timeout=1).conteudo == "quem é você?"


def test_audio_espera_ficar_pronto(servidor: ServidorWeb) -> None:
    servidor.reservar_audio("abc")
    # entrega depois de um tempo, enquanto o navegador já está esperando
    threading.Timer(0.3, lambda: servidor.entregar_audio("abc", b"RIFFteste")).start()
    with urllib.request.urlopen(f"{servidor.url}/voz/abc.wav") as resposta:
        assert resposta.headers["Content-Type"] == "audio/wav"
        assert resposta.read() == b"RIFFteste"


def test_audio_que_falhou_da_404(servidor: ServidorWeb) -> None:
    servidor.reservar_audio("falhou")
    servidor.entregar_audio("falhou", None)
    with pytest.raises(urllib.error.HTTPError) as erro:
        urllib.request.urlopen(f"{servidor.url}/voz/falhou.wav")
    assert erro.value.code == 404
