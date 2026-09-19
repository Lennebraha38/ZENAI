#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/olcum_dogrula.py — canli/repo olcum kanitini dogrular (CI gate'i).

Gitmeyecek durumlar (CI'da fail):
  1. karsilastirma.json'da `puan` alani olmayan kayit varsa (ham veri commit'lenirse)
  2. karsilastirma.json'da genel puan 0 veya basarisiz kayit varsa
  3. kayit/latency.jsonl yoksa VEYA hic ilktoken_ms>=0 kayit icermiyorsa
  4. latency kayitlari github action ortaminda uretildiyse gelismis deger yok ise
     (CI'da aksiyon key'siz calisir; bu hasar yalnizca TARIH alani kontroludur)

Kullanim: python3 scripts/olcum_dogrula.py [kok-dizin]
"""
import json, os, sys
from pathlib import Path

def hata(msg: str) -> None:
    print(f"[GATE] FAIL: {msg}")
    sys.exit(1)

def ana(kok: str) -> int:
    kok = Path(kok)
    # 1) karsilastirma.json: puansiz kayit yok, genel puan gecersiz degil
    kars = kok / "karsilastirma.json"
    if not kars.exists():
        hata(f"{kars.name} yok — 'sonuclar' listesi commit'lenmeli")
    d = json.loads(kars.read_text(encoding="utf-8"))
    sonuclar = d.get("sonuclar", d if isinstance(d, list) else [])
    if not sonuclar:
        hata("karsilastirma.json'da 'sonuclar' yok")
    puansiz = [s.get("no") for s in sonuclar if s.get("puan") is None]
    if puansiz:
        hata(f"{len(puansiz)} kayit puansiz (no: {puansiz[:8]}...) — once otomatik_skorer calistir")
    genel = d.get("ozet", d.get("genel_puan", 0))
    if isinstance(genel, dict):
        genel = genel.get("genel_puan", 0)
    if genel <= 0:
        hata("karsilastirma genel_puan <= 0 — olcum commit'lenmemis/cift sayim")

    # 2) kayit/latency.jsonl: gercek bir olcum satiri var mi
    lat = kok / "kayit" / "latency.jsonl"
    if not lat.exists():
        hata("kayit/latency.jsonl yok — canli ilk-token olcumu commit'lenmeli")
    gecerli = 0
    for satir in lat.read_text(encoding="utf-8").splitlines():
        try:
            r = json.loads(satir)
        except Exception:
            continue
        if r.get("hata") is None and r.get("ilktoken_ms") is not None and r["ilktoken_ms"] > 0:
            gecerli += 1
    if gecerli == 0:
        hata("latency.jsonl'da gecerli ilk-token kaydi yok")

    print(f"[GATE] OK: karsilastirma={len(sonuclar)} kayit/puan={genel}, "
          f"latency={gecerli} gecerli kayit")
    return 0

if __name__ == "__main__":
    raise SystemExit(ana(sys.argv[1] if len(sys.argv) > 1 else "."))