#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/sync_konu_modelleri.py

`agentv2/model_routing.py` icindeki `KONU_MODELLERI` tek kaynak; bu script
`web/app.js` ve `web/api/voice.js` icindeki konu->model nesnesini ayni
degerlerle yeniden uretir. Boylece Python ve JS konu->model haritasinin
cogalmasi onlenir.

Kullanim:
  python3 scripts/sync_konu_modelleri.py            # senkronize et
  python3 scripts/sync_konu_modelleri.py --kontrol  # sadece fark kontrol (CI)
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PY_SRC = ROOT / "agentv2" / "model_routing.py"
# (dosya, JS değişken adı, format) — format: "cift" -> [model, maxt], "tek" -> "model"
JS_NEZAKETLER = [
    ("web/app.js", "KONU_MODELLERI", "cift"),
    ("web/api/voice.js", "MODELLER", "tek"),
]

sys.path.insert(0, str(ROOT / "agentv2"))
import model_routing as _mr  # noqa: E402

def js_block(var_ad: str, fmt: str) -> str:
    """model_routing.py'deki KONU_MODELLERI'ni JS nesnesi metnine cevirir."""
    en_genis = max(len(k) for k in _mr.KONU_MODELLERI)
    satirlar = [f"const {var_ad} = {{"]
    for konu, (model, maxt, _) in _mr.KONU_MODELLERI.items():
        bosluk = " " * (en_genis - len(konu))
        if fmt == "cift":
            satirlar.append(f"  {konu}:{bosluk} [\"{model}\", {maxt}],")
        else:
            satirlar.append(f"  {konu}:{bosluk} \"{model}\",")
    satirlar.append("};")
    return "\n".join(satirlar)

def main() -> int:
    if not PY_SRC.exists():
        print("Kaynak dosya bulunamadi.", file=sys.stderr)
        return 1
    degisti = False
    for js_yolu, var_ad, fmt in JS_NEZAKETLER:
        js_src = ROOT / js_yolu
        if not js_src.exists():
            print(f"{js_yolu} bulunamadi (atlaniyor).", file=sys.stderr)
            continue
        js = js_src.read_text(encoding="utf-8")
        # "const VAR = {" — değişken adını bul, başlangıcı orası kabul et.
        desen = re.compile(rf"(const\s+{var_ad}\s*=\s*\{{)")
        m = desen.search(js)
        if not m:
            print(f"{js_yolu} icinde '{var_ad}' blogu bulunamadi.", file=sys.stderr)
            return 1
        bas = m.start()
        bit = js.find("};", bas)
        if bit < 0:
            print(f"{js_yolu} icinde blok kapanisi bulunamadi.", file=sys.stderr)
            return 1
        bit += len("};")
        yeni = js_block(var_ad, fmt)
        js_yeni = js[:bas] + yeni + js[bit:]
        if js_yeni != js:
            degisti = True
            if "--kontrol" in sys.argv:
                print(f"FARK VAR: {js_yolu} — python3 scripts/sync_konu_modelleri.py calistirilmali.", file=sys.stderr)
            else:
                js_src.write_text(js_yeni, encoding="utf-8")
                print(f"OK: {js_yolu} senkronize edildi ({len(_mr.KONU_MODELLERI)} konu).")
    if degisti and "--kontrol" in sys.argv:
        return 1
    if not degisti:
        print("OK: tum JS konu haritalari senkron.")
    return 0

if __name__ == "__main__":
    sys.exit(main())