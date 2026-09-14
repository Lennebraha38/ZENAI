from typing import Optional, Tuple, List, Dict, Any
"""ZenAI - yerel + mega beyin. Ajan dongusu ve Deep Research."""
import os, re, sys

ENV_KEY = os.environ.get("OPENROUTER_KEY", "")
OPENROUTER_KEY = ENV_KEY

try:
    from araclar.arac_katmani import sayfa, web_ara, derin_arastirma, komut, Bellek
    from araclar import yonlendir
    from akil_motoru import sistem_promptu, birim_mantik_skoru
    from model_routing import OPENROUTER_URL
except ImportError:
    from agentv2.araclar.arac_katmani import sayfa, web_ara, derin_arastirma, komut, Bellek
    from agentv2.araclar import yonlendir
    from agentv2.akil_motoru import sistem_promptu, birim_mantik_skoru
    from agentv2.model_routing import OPENROUTER_URL

MEGA_MODEL = "dots-studio/dots-3-note-preview:free"
PLAN_MODEL = "poolside/laguna-s-2.1:free"

# Model -> max cikti token (OpenRouter /v1/models'ten). Free modeler 65K-460K tasir.
MODEL_TAVANI = {
    "nvidia/nemotron-3-ultra-550b-a55b:free": 65536,
    "nvidia/nemotron-3.5-lightning:free": 65536,
    "thinkingmachines/inkling:free": 262144,
    "dots-studio/dots-3-note-preview:free": 460800,
    "poolside/laguna-s-2.1:free": 32768,
    "cohere/north-mini-code:free": 8192,
}

def _tavan(model: str, istenen: int) -> int:
    """Modelin tavani ile kullanici istegini dengeler."""
    tav = MODEL_TAVANI.get(model, 65536)
    return min(max(istenen or 65536, 1), tav)

def uzunluk(model: str, seviye: str = "normal") -> int:
    """Pratik cevap uzunlugu: normal(16K), kisa(4K), uzun(65K)."""
    uzunluklar = {"kisa": 4096, "normal": 16384, "uzun": 65536}
    return _tavan(model, uzunluklar.get(seviye, 16384))

def llm(mesajlar, model: str = MEGA_MODEL, max_tokens: Optional[int] = None, seviye: str = "normal", stream: bool = True) -> str:
    import requests, json
    if max_tokens is None:
        max_tokens = uzunluk(model, seviye)
    max_tokens = _tavan(model, max_tokens)

    if OPENROUTER_KEY:
        try:
            r = requests.post(OPENROUTER_URL, json={
                "model": model, "messages": mesajlar, "temperature": 0.7,
                "max_tokens": max_tokens, "stream": stream
            }, headers={"Authorization": f"Bearer {OPENROUTER_KEY}"}, timeout=600)
            if r.status_code == 200:
                if not stream:
                    return (r.json().get("choices", [{}])[0].get("message", {}).get("content")
                            or None)

                # streaming: parcalari topla, ilk tokeni ver (LLM uygulamasi akis hissi icin cagiran yardima bakabilir)
                parcalar = []
                for satir in r.iter_lines(decode_unicode=True):
                    if not satir or not satir.startswith("data:"):
                        continue
                    veri = satir[5:].strip()
                    if veri == "[DONE]":
                        break
                    try:
                        delta = json.loads(veri)["choices"][0]["delta"].get("content", "")
                        if delta:
                            parcalar.append(delta)
                    except Exception:
                        continue
                if parcalar:
                    return "".join(parcalar)
        except Exception:
            pass

    # Tek-key kirilganligi: OpenRouter yoksa/429/5xx verirse diger saglayicilara gec.
    try:
        from llm_provider import sira_sor
    except ImportError:
        from agentv2.llm_provider import sira_sor
    try:
        return sira_sor(mesajlar, model, max_tokens)
    except Exception:
        return None

def ajan(soru: str) -> str:
    belleklik = Bellek()
    ilgili = belleklik.ara(soru)
    baglam = "\n\n".join(f"{k}: {v}" for k, v in ilgili) if ilgili else ""
    # Akil Motoru: CoT + kapsam + dogrulama promptu
    sistem = sistem_promptu(konu=None, kapsam="uzun", seviye="duzgun")
    mesajlar = [{"role": "system", "content": sistem
        + (f"\n\nHatirla (bellekten):\n{baglam}" if baglam else "")
        + "\n\nARAclarini kullan: [ARAMA]soru[/ARAMA] web arar, [SITE]url[/SITE] site okur, "
          "[KOMUT]cmd[/KOMUT] komut calistirir, [BELGE]dosya[/BELGE] dosya okur, "
          "[PYTHON]kod[/PYTHON] python calistirir, [BASH]cmd[/BASH] bash calistirir, "
          "[SISTEM]bakis[/SISTEM] sistem bilgisi, [GITHUB]sorgu[/GITHUB] github ara, "
          "[SIFRE]uzunluk[/SIFRE] sifre uret, [RSS]kategori[/RSS] haber, "
          "[LISTE]klasor,kalip[/LISTE] dosya listeler, "
          "[TARAYICI]ac,url[/TARAYICI] site acar, [GORUN]dosya.png[/GORUN] goruntu analiz eder. "
          "GEREKSIZSE ARAÇ KULLANMA: bilgi, tanim, hesaplama, ad, kimlik, genel sohbet gibi "
          "dogrudan cevaplanabilen sorularda araç çağırmadan aninda cevap ver."
        },
        {"role": "user", "content": soru}]
    dogrulandi = False
    for tur in range(7):
        cevap = llm(mesajlar)
        if not cevap:
            return "Mega beyin yanit vermedi (OPENROUTER_KEY ayarla)."
        aramalar = re.findall(r"\[ARAMA\]([^\[]*)\[/ARAMA\]", cevap)
        siteler = re.findall(r"\[SITE\]([^\[]*)\[/SITE\]", cevap)
        komutlar = re.findall(r"\[KOMUT\]([^\[]*)\[/KOMUT\]", cevap)
        digerler = []
        for sozcuk in ["BELGE","PYTHON","BASH","SISTEM","GITHUB","SIFRE","RSS","LISTE","TARAYICI","GORUN"]:
            if f"[{sozcuk}]" in cevap:
                digerler.append(sozcuk)
        if not (aramalar or siteler or komutlar or digerler):
            if len(cevap) > 3000:
                belleklik.ozet_ata(llm, cevap, "yanit_" + re.sub(r"[^a-z0-9]", "_", soru.lower())[:40])
            # Self-verification: yalniz uzun/iddiali cevaplarda; kisa meselede aninda dondur.
            kisa = len(soru.split()) <= 7
            if not dogrulandi and not kisa:
                skor = birim_mantik_skoru(cevap)
                if skor < 0.4:
                    dogrulandi = True
                    mesajlar += [{"role": "assistant", "content": cevap},
                                 {"role": "user", "content": (
                                     "Kendi cevabini kontrol et: "
                                     "mantik hatasi, eksik bilgi veya yarim kalmis cumle var mi? "
                                     "Varsa kisa duzeltmeleri yap, sonra tam cevabi ver. "
                                     "Hedef: madde sayisi 4+, kelime 300+."
                                 )}]
                    continue
            return cevap
        sonuclar = []
        for s in aramalar: sonuclar.append("ARAMA: " + web_ara(s.strip()))
        for s in siteler: sonuclar.append("SITE: " + sayfa(s.strip()))
        for s in komutlar: sonuclar.append("KOMUT: " + komut(s.strip()))
        if digerler:
            router_sonucu = yonlendir(cevap)
            if router_sonucu:
                sonuclar.append(router_sonucu)
        if not sonuclar:
            # Cevap hazir, ama bir dogrulama turu daha (maks 1 kez) — kisa mesele pas geciyor.
            skor = birim_mantik_skoru(cevap)
            if skor < 0.5 and tur == 0 and len(soru.split()) > 7:
                mesajlar += [{"role": "assistant", "content": cevap},
                             {"role": "user", "content": (
                                 "Kendi cevabini kontrol et: mantik hata mi, eksik mi var? "
                                 "Varsa duzelt. Hedef: madde sayisi 4+, kelime 300+."
                             )}]
                continue  # Duzeltme turu icin donguye don
            return cevap
        mesajlar += [{"role": "assistant", "content": cevap},
                     {"role": "user", "content": "ARAC SONUCLARI:\n" + "\n".join(sonuclar) + "\nDevam et ve kullaniciya cevap ver."}]
    return "Araclar islendi."

def rapor(soru: str) -> None:
    belleklik = Bellek()
    sonuc = derin_arastirma(llm, soru)
    belleklik.ozet_ata(llm, sonuc, "rapor_" + re.sub(r"[^a-z0-9]", "_", soru.lower())[:40])
    return sonuc

def chat(soru: str) -> str:
    return ajan(soru)

def acik(soru: str, mod: str = "ajan") -> str:
    # Semantik onbellek: tekrar eden sorularda API cagrisini kes.
    try:
        from onbellek import onbel_istek, onbel_kaydet
    except ImportError:
        from agentv2.onbellek import onbel_istek, onbel_kaydet

    if mod == "rapor":
        return rapor(soru)
    esik = 0.85 if mod == "chat" else 0.97  # ajan aracli oldugu icin neredeyse-birebir ister
    isabet = onbel_istek(soru, esik)
    if isabet:
        return isabet
    if mod == "chat":
        sistem = sistem_promptu(konu=None, kapsam="uzun", seviye="duzgun")
        son = llm([{"role": "system", "content": sistem},
                   {"role": "user", "content": soru}], seviye="normal")
        yanit = son or "Beyin yanit vermedi."
        onbel_kaydet(soru, yanit)
        return yanit
    yanit = ajan(soru)
    onbel_kaydet(soru, yanit)
    return yanit

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Kullanim: python3 zenai_zeka.py <soru> [ajan|rapor|chat]")
        sys.exit(1)
    if len(sys.argv) == 2:
        soru, mod = sys.argv[1], "ajan"
    else:
        soru, mod = " ".join(sys.argv[1:-1]), sys.argv[-1]
    print(acik(soru, mod))