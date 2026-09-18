#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/olcum.py — Gerçek gecikme ölçümü (AR-GE metriği).

Groq ve OpenRouter üzerinden aynı soruları koşar; İLK TOKEN süresi (kullanıcı
hissi) + toplam süre + token/s ölçer. "1 sn altı" iddiası bu sayıyla kanıtlanır.

Kullanim:
  GROQ_API_KEY=... OPENROUTER_KEY=... python3 scripts/olcum.py [--tur=ses|metin] [--adet=5]

Çıktı: kayit/latency.jsonl + özet tablo. Key yoksa o sağlayıcı atlanır.
"""
import os, sys, time, json, argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

def olc(saglayici: str, anahtar: str, url: str, model: str, soru: str,
        sistem: str, max_tokens: int, ilk_token_sinir: float = 15.0) -> dict:
    """Tek istek; SSE'den ilk token ne zaman geldiğini ölçer."""
    try:
        import requests
    except ImportError:
        print("requests gerekli: pip install requests", file=sys.stderr)
        raise SystemExit(1)
    govde = {
        "model": model,
        "messages": [{"role": "system", "content": sistem},
                     {"role": "user", "content": soru}],
        "max_tokens": max_tokens, "temperature": 0.7, "stream": True,
    }
    t0 = time.monotonic()
    r = requests.post(url, json=govde,
                      headers={"Authorization": f"Bearer {anahtar}"},
                      timeout=ilk_token_sinir + 30)
    t_http = (time.monotonic() - t0) * 1000
    if r.status_code != 200:
        return {"saglayici": saglayici, "model": model, "soru": soru[:50],
                "hata": f"HTTP {r.status_code}: {r.text[:120]}", "ilktoken_ms": None}
    ilk = None
    toplam_metin = []
    for satir in r.iter_lines(decode_unicode=True):
        if not satir or not satir.startswith("data: "):
            continue
        veri = satir[6:].strip()
        if veri == "[DONE]":
            break
        try:
            import json as J
            d = J.loads(veri)["choices"][0]["delta"].get("content")
        except Exception:
            continue
        if d:
            if ilk is None:
                ilk = (time.monotonic() - t0) * 1000
            toplam_metin.append(d)
    bitis = (time.monotonic() - t0) * 1000
    metin = "".join(toplam_metin)
    kelime = len(metin.split())
    return {
        "saglayici": saglayici, "model": model, "soru": soru[:50],
        "hata": None,
        "ilktoken_ms": round(ilk, 1) if ilk else None,
        "toplam_ms": round(bitis, 1),
        "kelime": kelime, "karakter": len(metin),
        "hiz_token_alti": round(bitis / max(kelime, 1), 1) if kelime else None,
    }

SORULAR = [
    "8 kere 8 kaç eder?",
    "Türkiye'nin başkenti neresidir?",
    "Python'da bir listeyi ters çeviren kodu yaz.",
    "Iklim değişikliğinin nedenlerini 3 maddeyle açıkla.",
]

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--adet", type=int, default=len(SORULAR))
    ap.add_argument("--soru", default=None, help="Tek soru verin (boşsa varsayılan liste)")
    a = ap.parse_args()

    or_key = os.environ.get("OPENROUTER_KEY", "")
    groq_key = os.environ.get("GROQ_API_KEY", "")
    if not or_key and not groq_key:
        print("UYARI: ne GROQ_API_KEY ne OPENROUTER_KEY var — ölçüm yapılamaz.\n"
              "  GROQ_API_KEY=... OPENROUTER_KEY=... python3 scripts/olcum.py",
              file=sys.stderr)
        return 2

    sonuclar = []
    sorular = [a.soru] if a.soru else SORULAR[:a.adet]
    sistem = ("Sen ZenAI'sin, Türkçe konuşan bir asistan. Doğru ve kısa cevap ver. "
              "Giris cumlesi yazma, ilk cumlede cevaba gir.")

    for soru in sorular:
        if or_key:
            sonuclar.append(olc("OpenRouter", or_key,
                "https://openrouter.ai/api/v1/chat/completions",
                "dot-studio/dots-3-note-preview:free", soru, sistem, 512))
        if groq_key:
            sonuclar.append(olc("Groq", groq_key,
                "https://api.groq.com/openai/v1/chat/completions",
                os.environ.get("GROQ_ULTRA_MODEL", "llama-3.1-8b-instant"), soru, sistem, 512))

    # kaydet
    kayit_dir = ROOT / "kayit"
    kayit_dir.mkdir(exist_ok=True)
    kayit = kayit_dir / "latency.jsonl"
    with open(kayit, "a") as f:
        for s in sonuclar:
            f.write(json.dumps(s, ensure_ascii=False) + "\n")

    print(f"\n{'Saglayici':<11} {'Model':<28} {'Ilk token':>9} {'Toplam':>9} {'Kelime':>6}")
    for s in sonuclar:
        if s["hata"]:
            print(f"{s['saglayici']:<11} {s['model'][:28]:<28} {'HATA':>9} {'-':>9} {'-':>6}  {s['hata']}")
        else:
            print(f"{s['saglayici']:<11} {s['model'][:28]:<28} "
                  f"{s['ilktoken_ms']:>8.0f}ms {s['toplam_ms']:>8.0f}ms {s['kelime']:>6}")
    print(f"\nKayit: {kayit}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())