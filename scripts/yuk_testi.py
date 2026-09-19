#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/yuk_testi.py — voice gateway eşzamanlılık (load) testi.

Ağa ÇIKMAZ: `akis_uret` sahte bir üreticiyle değiştirilir (kontrollü gecikme),
istekler TestClient üzerinden gateway'e gider. Amacı:
eşzamanlı SSE taleplerinde altyapının (kanal, faz/delta çağrıları, SSE
çerçeveleme) çöküşsüz ve öngörülebilir gecikmeyle çalıştığını kanıtlamak.

Kullanım:
  python3 scripts/yuk_testi.py --n 50 --eşzaman 20 --hiz_cap 5 --esik 2.0
  # --n      toplam istek
  # --eşzaman aynı anda kaç istek
  # --hiz_cap  sahte üreticinin saniye başına ürettiği chunk (kontrollü gecikme)
  # --esik    saniye; p95 bu değeri aşarsa exit 1 (CI gate)
CI: `python3 scripts/yuk_testi.py --n 20 --eşzaman 10 --hiz_cap 20 --esik 3.0`
"""
import argparse
import json
import random
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


def _sahte_akis(mod, soru, on_faz, on_delta, saglayici=None):
    """Gerçek LLM'i taklit eden üretici: kontrollü gecikme + parçalı token."""
    on_faz("hazirlaniyor", "dusunuyor", "yuk")
    parcalar = ["ZenAI ", "yük ", "testi ", "yanıtı ", str(len(soru))]
    gcikme = 1.0 / max(1, float(getattr(_sahte_akis, "hiz_cap", 20.0)))
    for p in parcalar:
        time.sleep(gcikme * random.uniform(0.5, 1.5))
        on_delta("answer", p)
    on_faz("tamamlandi", "konusuyor", "ok")
    return "".join(parcalar)


def _bir_istek(istemci_kur, gorev: int) -> tuple[bool, float, int]:
    """Tek bir OpenAI-uyumlu SSE isteği; (basarili, sure, chunk_sayisi) döner."""
    from fastapi.testclient import TestClient
    import voice.server.gateway as gw
    with TestClient(gw.APP) as c:
        baslama = time.perf_counter()
        try:
            with c.stream("POST", "/v1/chat/completions", json={
                "model": "chat",
                "messages": [{"role": "user", "content": f"yük isteği {gorev}"}],
                "stream": True,
            }) as r:
                if r.status_code != 200:
                    return False, time.perf_counter() - baslama, 0
                veri = r.read()
        except Exception:
            return False, time.perf_counter() - baslama, 0
    sure = time.perf_counter() - baslama
    ok = b"[DONE]" in veri and b"data: " in veri
    chunks = veri.count(b'"content"')
    return ok, sure, chunks


def _kos(n: int, eşzaman: int, hiz_cap: float) -> dict:
    import voice.server.gateway as gw
    _sahte_akis.hiz_cap = hiz_cap
    gw.streamer.akis_uret = _sahte_akis

    t0 = time.perf_counter()
    sonuclar = []
    with ThreadPoolExecutor(max_workers=eşzaman) as havuz:
        for son in havuz.map(lambda i: _bir_istek(None, i), range(n)):
            sonuclar.append(son)
    duvar = time.perf_counter() - t0

    basarisiz = [r for r in sonuclar if not r[0]]
    sureler = sorted(r[1] for r in sonuclar)
    p = lambda oran: (sureler[int(oran * (len(sureler) - 1))] if sureler else 0.0)
    ortalama_ms = (sum(r[1] for r in sonuclar) / max(1, len(sonuclar)) * 1000
                   if sureler else 0.0)
    toplam_chunk = sum(r[2] for r in sonuclar) if sonuclar else 0
    return {
        "istek": n, "eşzaman": eşzaman,
        "basarili": n - len(basarisiz), "hatali": len(basarisiz),
        "p50_ms": round(p(0.50) * 1000, 1), "p90_ms": round(p(0.90) * 1000, 1),
        "p95_ms": round(p(0.95) * 1000, 1), "p99_ms": round(p(0.99) * 1000, 1),
        "ortalama_ms": round(ortalama_ms, 1),
        "duvar_suresi_ms": round(duvar * 1000, 1),
        "qps": round(n / duvar, 1) if duvar else 0.0,
        "toplam_chunk": toplam_chunk,
    }


def ana() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=20)
    ap.add_argument("--eşzaman", type=int, default=10)
    ap.add_argument("--hiz_cap", type=float, default=20.0)
    ap.add_argument("--esik", type=float, default=3.0)
    a = ap.parse_args()
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    try:
        import voice.server.gateway  # noqa: F401 — bagimlilik erken hata verir
    except ImportError as e:
        print(f"[GATE] SKIP: voice bagimliliklari yok ({e})")
        return 0

    r = _kos(a.n, a.eşzaman, a.hiz_cap)
    print(json.dumps(r, ensure_ascii=False, indent=2))
    if r["hatali"]:
        print(f"[GATE] FAIL: {r['hatali']}/{r['istek']} istek başarısız")
        return 1
    if r["p95_ms"] / 1000.0 > a.esik:
        print(f"[GATE] FAIL: p95={r['p95_ms']}ms > eşik {a.esik*1000:.0f}ms")
        return 1
    print("[GATE] OK: yük testi başarılı, SSE sözleşmesi korunuyor")
    return 0


if __name__ == "__main__":
    raise SystemExit(ana())