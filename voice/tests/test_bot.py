"""Bot katmanı testleri.

Ağ YOK: gerçek ''streamer'' değil, deterministic ``akis_uret`` üzerinden
çalışan gerçek bir uvicorn gateway ile uçtan uca LLM servisi doğrulanır.
``test_bot.py`` pipecat-ai çekirdeğini kullanır; sesli ekstraları gerektirmez.
"""
import asyncio
import sys
import os
import threading
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import pytest

pytest.importorskip(
    "pipecat",
    reason="pipecat-ai kurulu değil (pip install 'pipecat-ai>=1.10'); "
           "CI'daki voice işine kurulur, lokalda isteğe bağlı atlanır.",
)

from voice.bot import pipeline as pl
from voice.bot.pipeline import SesAyarlar
from voice.bot.zenai_llm import ZenaiFazFrame, ZenaiLLMService
from voice.server import gateway

from pipecat.frames.frames import LLMTextFrame


def _fake_akis(mod, soru, on_faz, on_delta, saglayici=None):
    on_faz("hazirlaniyor", "dusunuyor", "")
    on_delta("answer", "Merhaba ")
    on_delta("answer", "dünya")
    on_delta("faz", "bilgi")
    on_faz("tamamlandi", "konusuyor", "1")
    return "Merhaba dünya"


def _sunucu(monkeypatch, port):
    monkeypatch.setattr(gateway.streamer, "akis_uret", _fake_akis)
    import uvicorn

    cfg = uvicorn.Config(gateway.APP, host="127.0.0.1", port=port, log_level="error")
    srv = uvicorn.Server(cfg)
    threading.Thread(target=srv.run, daemon=True).start()
    for _ in range(100):
        if srv.started:
            return srv
        time.sleep(0.05)
    raise RuntimeError("gateway başlamadı")


@pytest.mark.asyncio
async def test_zenai_llm_gateway_akisi(monkeypatch):
    port = 8791
    srv = _sunucu(monkeypatch, port)
    svc = ZenaiLLMService(gateway_url=f"http://127.0.0.1:{port}", model="chat")
    try:
        kareler = []
        async for k in svc._zenai_akisi([{"role": "user", "content": "selam"}]):
            kareler.append(k)
        metin = "".join(getattr(f, "text", "") for f in kareler if isinstance(f, LLMTextFrame))
        assert "Merhaba dünya" in metin
        assert any(isinstance(f, ZenaiFazFrame) for f in kareler)
        fazlar = [f.faz for f in kareler if isinstance(f, ZenaiFazFrame)]
        assert "hazirlaniyor" in fazlar and "tamamlandi" in fazlar
    finally:
        await svc._client.aclose()
        srv.should_exit = True
        await asyncio.sleep(0.2)


def test_demet_islem_parcalama():
    svc = ZenaiLLMService(gateway_url="http://0.0.0.0:1", model="chat")
    demet = (
        'data: {"choices":[{"delta":{"type":"faz","faz":"hazirlaniyor","detay":""}}]}\n'
        'data: {"choices":[{"delta":{"type":"answer","content":"Merhaba "}}]}\n'
        'data: {"choices":[{"delta":{"type":"answer","content":"dünya"}}]}\n'
        "data: [DONE]\n"
    )
    asyncio.run(_topla(svc, demet))


async def _topla(svc, demet):
    kareler = []
    async for k in svc._demet_islem(demet):
        kareler.append(k)
    metin = "".join(getattr(f, "text", "") for f in kareler if isinstance(f, LLMTextFrame))
    assert metin == "Merhaba dünya"
    assert len([f for f in kareler if isinstance(f, ZenaiFazFrame)]) == 1


def test_demet_islem_bozuk_satir():
    svc = ZenaiLLMService(gateway_url="http://0.0.0.0:1", model="chat")

    async def _gor():
        kareler = [f async for f in svc._demet_islem("data: {bozuk\nidle metin")]
        return kareler

    assert asyncio.run(_gor()) == []


def test_secici_hatalari():
    with pytest.raises(ValueError):
        pl._stt(SesAyarlar(stt="bilinmez"))
    with pytest.raises(ValueError):
        pl._tts(SesAyarlar(tts="bilinmez"))


def test_ayarlar_env_varsayilan():
    a = SesAyarlar()
    assert a.gateway_url.startswith("http")
    assert a.model == "chat"
    assert a.bekletme_ms > 0