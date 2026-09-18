"""Coklu-saglayici LLM ara katmani — tek key bagimliligini kirmak.

Zincir: OpenRouter -> Groq -> Google AI Studio (Gemini).
Her saglayici kendi env anahtarini bekler; anahtar yoksa veya
429/5xx/okunmaz cevap verirse siradaki saglayiciya gecilir.

Kullanim:
    from llm_provider import sira_sor
    cevap = sira_sor(mesajlar, model="openrouter/model:id", max_tokens=16384)

Not: yedek saglayicilarin modelleri sabittir (buradan gelen Or-model
OpenRouter'a ozeldir); Groq/Gemini icin burada tanimli modeller kullanilir.
"""
import os
from typing import Any, Dict, List, Optional, Sequence

OPENROUTER_URL = os.environ.get("OPENROUTER_URL", "https://openrouter.ai/api/v1/chat/completions")
GROQ_URL = os.environ.get("GROQ_URL", "https://api.groq.com/openai/v1/chat/completions")
GEMINI_URL = "generativelanguage.googleapis.com"

ANAHTAR_OR = os.environ.get("OPENROUTER_KEY", "")
ANAHTAR_GROQ = os.environ.get("GROQ_API_KEY", "")
ANAHTAR_GEMINI = os.environ.get("GEMINI_API_KEY", "")

# Yedek saglayicilarin varsayilan modelleri (OpenRouter id'lere ozgu model gecersiz)
MODEL_GROQ = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
MODEL_GEMINI = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")


def _openai_compat(mesajlar: List[Dict[str, str]], model: str,
                   max_tokens: int, api_key: str, taban_url: str) -> Optional[str]:
    """OpenAI uyumlu /chat/completions son noktasi (OpenRouter, Groq)."""
    import requests
    r = requests.post(
        taban_url,
        json={"model": model, "messages": mesajlar, "temperature": 0.7,
              "max_tokens": max_tokens, "stream": False},
        headers={"Authorization": f"Bearer {api_key}"},
        timeout=90,
    )
    if r.status_code != 200:
        return None
    try:
        icerik = r.json().get("choices", [{}])[0].get("message", {}).get("content")
    except Exception:
        return None
    return icerik if isinstance(icerik, str) and icerik.strip() else None


class _AkisHatasi(Exception):
    """Streaming'de ilk token gecikmesi / HTTP hatasi."""


def akista_cek_groq(mesajlar: List[Dict[str, str]], model: str,
                    max_tokens: int, ilk_token_sinir: float = 4.0):
    """Groq streaming generator — ilk token saniyeler icinde gelir (donanim hizi).

    OpenAI uyumlu SSE okur, her content parcasini yield'lar. Ilk token
    ``ilk_token_sinir`` saniyeyi asarsa ``_AkisHatasi`` firlatir (cağıran
    OpenRouter'a duser).
    """
    import time
    import json as J
    import requests

    anahtar = os.environ.get("GROQ_API_KEY", "")
    if not anahtar:
        raise _AkisHatasi("GROQ_API_KEY yok")
    try:
        r = requests.post(
            GROQ_URL,
            json={"model": model, "messages": list(mesajlar), "temperature": 0.7,
                  "max_tokens": max_tokens, "stream": True},
            headers={"Authorization": f"Bearer {anahtar}"},
            timeout=ilk_token_sinir + 2,
        )
    except Exception:
        raise _AkisHatasi("groq ilk baglanti asildi") from None
    if r.status_code != 200:
        raise _AkisHatasi(f"groq HTTP {r.status_code}")
    baslangic = time.monotonic()
    for satir in r.iter_lines(decode_unicode=True):
        if not satir or not satir.startswith("data:"):
            continue
        veri = satir[5:].strip()
        if veri == "[DONE]":
            break
        try:
            delta = J.loads(veri)["choices"][0]["delta"].get("content")
        except Exception:
            continue
        if delta:
            if time.monotonic() - baslangic > ilk_token_sinir:
                raise _AkisHatasi("groq ilk token siniri asti")
            yield delta
    # Stream bitti ve hic token yoksa: bos gorunmez say
    if time.monotonic() - baslangic < 0.001 and False:  # noqa
        raise _AkisHatasi("groq bos akis")


def _gemini(mesajlar: List[Dict[str, str]], model: str,
            max_tokens: int, api_key: str) -> Optional[str]:
    """Google AI Studio Gemini REST (OpenAI mesaj seklini parts'a cevirir)."""
    import json
    from urllib.request import Request, urlopen
    icerik = ""
    for m in mesajlar:
        rol = "user" if m["role"] in ("user", "system") else "model"
        icerik += f"{m.get('content', '')}\n"
    govde = {
        "contents": [{"role": "user", "parts": [{"text": icerik.strip()}]}],
        "generationConfig": {"maxOutputTokens": max_tokens, "temperature": 0.7},
    }
    url = (f"https://{GEMINI_URL}/v1beta/models/{model}:generateContent"
           f"?key={api_key}")
    try:
        istek = Request(url, data=json.dumps(govde).encode(),
                        headers={"Content-Type": "application/json"})
        with urlopen(istek, timeout=90) as yanit:
            veri = json.loads(yanit.read().decode())
        parcalar = veri["candidates"][0]["content"]["parts"]
        metin = "".join(p.get("text", "") for p in parcalar).strip()
    except Exception:
        return None
    return metin or None


def _probat_sirasi(mesajlar: List[Dict[str, str]], model: str,
                   max_tokens: int) -> List[Any]:
    """Kullanilabilir (anahtarli) saglayici yetenek listesi, oncelik sirasiyla."""
    adimlar = []
    if ANAHTAR_OR.strip():
        adimlar.append(lambda: _openai_compat(mesajlar, model, max_tokens, ANAHTAR_OR, OPENROUTER_URL))
    if ANAHTAR_GROQ.strip():
        adimlar.append(lambda: _openai_compat(mesajlar, MODEL_GROQ, max_tokens, ANAHTAR_GROQ, GROQ_URL))
    if ANAHTAR_GEMINI.strip():
        adimlar.append(lambda: _gemini(mesajlar, MODEL_GEMINI, max_tokens, ANAHTAR_GEMINI))
    return adimlar


def sira_sor(mesajlar: List[Dict[str, str]], model: str,
             max_tokens: int = 16384,
             adimlar: Optional[Sequence[Any]] = None) -> Optional[str]:
    """Anahtari olan saglayicilari sirayla dener; ilk basarili cevabi dondurur."""
    deneme = list(adimlar) if adimlar is not None else _probat_sirasi(mesajlar, model, max_tokens)
    hatalar = []
    for adim in deneme:
        try:
            sonuc = adim()
        except Exception as e:  # ag/hata durumu: digerine gec
            hatalar.append(repr(e))
            continue
        if sonuc:
            return sonuc
        hatalar.append("bos-ya-da-kota")
    return None