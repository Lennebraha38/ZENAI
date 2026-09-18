"""ZenAI Voice Streamer — mevcut beyni (agentv2) DEĞİŞTİRMEDEN streaming köprüsü.

Strateji: ``agentv2.zenai_zeka.llm`` çağrısına *çalışma anında* sarmalama
(monkeypatch) yaparız; model tokenları canlı kanal olaylarına akar, beynin
yönlendirme + CoT + ajan döngüsü + derin araştırma mantığı aynen çalışır.
Sarmala her durumda geri çekilir (orijinal ``llm`` referansı korunur).

Kanal olayları (gateway tarafından SSE'ye çevrilir):
  on_faz(faz: str, durum: str, detay: str = "")   -> durum makinesi (HUD)
  on_delta(tur: str, icerik: str)                 -> tur: "answer" | "thought"
"""
from __future__ import annotations

import os
import re
import sys
import threading
import time
from typing import Callable, Generator, List, Optional, Sequence, Tuple

# ── Beyin importu: repo kökünden çalıştırılınca `agentv2.*` çözülür ──────
_REPO_KOK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
if _REPO_KOK not in sys.path:
    sys.path.insert(0, _REPO_KOK)

try:
    from agentv2 import zenai_zeka as zz
    from agentv2.llm_provider import sira_sor
    from agentv2.onbellek import onbel_istek, onbel_kaydet
except ImportError:  # düz klasör çalıştırması (voiceden bağımsız)
    import zenai_zeka as zz
    from llm_provider import sira_sor
    from onbellek import onbel_istek, onbel_kaydet

from .modes import mod_tanima, model_sec, ses_prompt_kisa
try:
    from agentv2.model_routing import HIZLI_MODEL, HIZLI_YEDEKLER
except Exception:
    HIZLI_MODEL, HIZLI_YEDEKLER = "nex-agi/nex-n2.5-mini:free", []

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434/v1/chat/completions")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.1")

# Groq donanim hizi (saniye alti ilk token) — key yoksa atlanir.
GROQ_KEY = os.environ.get("GROQ_API_KEY")
GROQ_FAST = os.environ.get("GROQ_FAST_MODEL", "llama-3.3-70b-versatile")
GROQ_ULTRA = os.environ.get("GROQ_ULTRA_MODEL", "llama-3.1-8b-instant")
GROQ_ILK_TOKEN = float(os.environ.get("GROQ_ILK_TOKEN", "3"))  # ilk token üst limit (sn)

def _hizli_zinciri(birincil: str) -> List[str]:
    """Birincil model + hızlı yedeklerin sıralı zinciri (1 sn hedefi).

    Groq donanim hizi en onde; olmazsa OpenRouter mini, sonra yedekler.
    """
    zincir: List[str] = []
    if os.environ.get("GROQ_API_KEY"):
        zincir += [f"groq:{GROQ_ULTRA}", f"groq:{GROQ_FAST}"]
    for m in [birincil] + list(HIZLI_YEDEKLER):
        if m not in zincir:
            zincir.append(m)
    return zincir

FazCagiri = Callable[[str, str, str], None]
DeltaCagiri = Callable[[str, str], None]


class StreamHatasi(Exception):
    """Üst akış (OpenRouter) hatası — fallback zinciri devreye girer."""


def kirpil(metin: str, boyut: int = 180) -> List[str]:
    """Uzun metni cümle sınırlarından parçalar (TTS kuyruğu için)."""
    metin = (metin or "").strip()
    if not metin:
        return []
    cumleler = re.split(r"(?<=[.!?])\s+|\n+", metin)
    parcalar: List[str] = []
    parca = ""
    for c in cumleler:
        if len(parca) + len(c) > boyut and parca:
            parcalar.append(parca.strip())
            parca = c
        else:
            parca = (parca + " " + c) if parca else c
    if parca.strip():
        parcalar.append(parca.strip())
    return parcalar or [metin]


# ── Üst akış: model tokenları (OpenRouter SSE, akışlı) ───────────────────
def _akista_cek(mesajlar: Sequence[dict], model: str, max_tokens: int) -> Generator[str, None, None]:
    """OpenRouter /chat/completions'ı akışlı okur; her tokenı üretir.

    Başarısızlıkta (5 sn'de ilk token gelmezse / HTTP hatasında) ``StreamHatasi``
    fırlatır → sarmalama hızlı model yedeğine düşer.
    """
    import json as J
    import requests

    anahtar = os.environ.get("OPENROUTER_KEY") or zz.OPENROUTER_KEY
    if not anahtar:
        raise StreamHatasi("OPENROUTER_KEY yok")
    try:
        r = requests.post(
            zz.OPENROUTER_URL,
            json={"model": model, "messages": list(mesajlar), "temperature": 0.7,
                  "max_tokens": max_tokens, "stream": True},
            headers={"Authorization": f"Bearer {anahtar}"},
            timeout=5,  # ilk bağlantı + başlık: 5 sn üstü limit
        )
    except Exception:
        raise StreamHatasi("ilk yanit 5 sn'yi asti") from None
    if r.status_code != 200:
        raise StreamHatasi(f"OpenRouter {r.status_code}")
    ilk_token = time.monotonic()
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
            # İlk token 4 sn'den geç gelirse: model sıkıştı, yedeğe geç.
            if time.monotonic() - ilk_token > 4:
                raise StreamHatasi("ilk token 4 sn sonra geldi (model sikisti)")
            yield delta


def _duz_cevap(mesajlar: Sequence[dict], model: str, max_tokens: int) -> Optional[str]:
    """Üst akışta akışsız fallback: llm_provider zinciri, sonra yerel Ollama."""
    try:
        c = sira_sor(list(mesajlar), model, max_tokens)
        if c:
            return c
    except Exception:
        pass
    try:
        import requests as _r
        k = _r.post(OLLAMA_URL, json={
            "model": OLLAMA_MODEL, "messages": list(mesajlar), "max_tokens": max_tokens,
        }, timeout=300)
        if k.status_code == 200:
            return (k.json().get("choices") or [{}])[0].get("message", {}).get("content")
    except Exception:
        pass
    return None


# ── chat: hızlı konuşma akışı (araçsız) ──────────────────────────────────
def chat_stream(soru: str,
                on_faz: FazCagiri,
                on_delta: DeltaCagiri,
                saglayici: Optional[Callable[..., Generator[str, None, None]]] = None,
                konusma: bool = True) -> str:
    """Konuya yönlendirilmiş, akışlı, araçsız sesli sohbet cevabı üretir."""
    # Kısa meselelerde önbellek atlanır: hızlı model zaten ucuz, yanlış
    # eşleşme ("8x8" vs "8+8") yerine doğru anlık cevap daha iyi.
    if len((soru or "").split()) > 7:
        isabet = onbel_istek(soru, 0.82)
        if isabet:
            on_faz("hazir", "bellek", "önbellek")
            for parca in kirpil(isabet):
                on_delta("answer", parca)
            return isabet
    else:
        # Kısa meselelerde TAM eşleşme: "8x8" ile "8x8" 0ms döner,
        # "8x8" ile "8+8" gibi yanlış benzerlik ÜRETİLMEZ (esik=1.0).
        isabet = onbel_istek(soru, 1.0)
        if isabet:
            on_faz("hazir", "bellek", "önbellek")
            for parca in kirpil(isabet):
                on_delta("answer", parca)
            return isabet

    on_faz("hazirlaniyor", "dusunuyor", "konu analizi")
    model, maxt = model_sec(soru)
    sistem = ses_prompt_kisa() if konusma else (
        "Sen ZenAI'sin, Türkçe konuşan bir asistan. Doğru ve kapsamlı cevap ver."
    )
    mesajlar = [{"role": "system", "content": sistem}, {"role": "user", "content": soru}]

    on_faz("dusunuyor", "dusunuyor", model)
    uretec = (saglayici or _akista_cek)

    def _aday_ureti(aday: str, gonder: Sequence[dict], mt_sinir: int):
        """groq:MODEL önekli adayları Groq donanımına, diğerlerini OpenRouter'a gönderir."""
        if aday.startswith("groq:"):
            try:
                from agentv2.llm_provider import akista_cek_groq
            except ImportError:
                from llm_provider import akista_cek_groq
            return akista_cek_groq(list(gonder), aday[5:], mt_sinir,
                                   ilk_token_sinir=GROQ_ILK_TOKEN)
        return uretec(gonder, aday, mt_sinir)

    adaylar = _hizli_zinciri(model)
    parcalar: List[str] = []
    yanit = ""
    for idx, aday in enumerate(adaylar):
        try:
            parcalar = []
            akis = _aday_ureti(aday, mesajlar, min(int(maxt), 16384))
            on_faz("yanit", "konusuyor", aday.split("/")[0].replace(":", "") if len(aday.split("/")) > 1 else aday)
            for token in akis:
                parcalar.append(token)
                on_delta("answer", token)
            yanit = "".join(parcalar).strip()
            break  # başarılı: akış bitti
        except StreamHatasi:
            if idx + 1 < len(adaylar):
                on_faz("yedek", "hizli", adaylar[idx + 1])  # sıkışan model, yedeğe geç
                continue
            yanit = (_duz_cevap(mesajlar, aday, min(int(maxt), 16384)) or "Cevap üretilemedi.").strip()
            if yanit and yanit != "Cevap üretilemedi.":
                on_faz("yanit", "konusuyor", "fallback")
                for parca in kirpil(yanit):
                    on_delta("answer", parca)
            else:
                on_delta("answer", yanit)
        except Exception as e:  # ağ/sınıf hatası: asla düşme, fallback
            if idx + 1 < len(adaylar):
                continue
            yanit = "Cevap üretilemedi."
    if not yanit and not parcalar:
        yanit = "Cevap üretilemedi."

    if len(yanit) > 10:
        try:
            onbel_kaydet(soru, yanit)
        except Exception:
            pass
    return yanit


# ── ajan: araç kullanımı + canlı token akışı (beyin döngüsü aynen) ───────
def ajan_stream(soru: str,
                on_faz: FazCagiri,
                on_delta: DeltaCagiri,
                saglayici: Optional[Callable[..., Generator[str, None, None]]] = None) -> str:
    """ZenAI ajan döngüsünü sarmalayarak çalıştırır; son yanıtı akışlı döner.

    - İlk (plan) çağrısında araç etiketi arar: varsa sessiz geçer (HUD fazı),
      yoksa doğrudan konuşma yanıtı olarak akar.
    - Araç sonuçları / doğrulama çağrılarında tokenlar canlı "answer" olarak akar.
    """
    orijinal = zz.llm
    plan_tipleri = ("ARAMA", "SITE", "KOMUT", "BELGE", "PYTHON", "BASH",
                    "SISTEM", "GITHUB", "SIFRE", "RSS", "LISTE", "TARAYICI", "GORUN")

    def _arac_sonuc_var(mesajlar: Sequence[dict]) -> bool:
        return any(m.get("role") == "user" and str(m.get("content", "")).startswith("ARAC SONUCLARI")
                   for m in mesajlar)

    def _sarmal(mesajlar, model=None, max_tokens=None, seviye="normal", stream=True) -> Optional[str]:
        model = model or zz.MEGA_MODEL
        mt = int(max_tokens) if max_tokens else zz.uzunluk(model, seviye)
        ilk_cagri = len(list(mesajlar)) <= 2 and not _arac_sonuc_var(list(mesajlar))
        try:
            if ilk_cagri:
                # Plan: tokenları tamponla, araç mı kullanacak sınıflandır.
                on_faz("plan", "dusunuyor", model)
                parcalar = list((saglayici or _akista_cek)(mesajlar, model, mt))
                metin = "".join(parcalar)
                iz = re.search(r"\[([A-Z]+)\]", metin)
                if (iz and iz.group(1) in plan_tipleri):
                    on_faz("arac-hazirligi", "arac", iz.group(1) if iz else "arac")
                    return metin
                on_faz("yanit", "konusuyor", "")
                for token in parcalar:
                    on_delta("answer", token)
                return metin
            # Araç sonucu / doğrulama çağrısı: canlı akış
            on_faz("yanit", "konusuyor", "")
            parcalar = []
            for token in (saglayici or _akista_cek)(mesajlar, model, mt):
                parcalar.append(token)
                on_delta("answer", token)
            return "".join(parcalar)
        except StreamHatasi:
            d = _duz_cevap(list(mesajlar), model, mt)
            if d:
                on_delta("answer", d)
                return d
            return None
        except Exception:
            return orijinal(list(mesajlar), model, mt, seviye)

    zz.llm = _sarmal
    try:
        final = zz.ajan(soru)
    finally:
        zz.llm = orijinal
    if not final:
        final = "Şu anda beynim yanıt üretemedi, tekrar deneyebilirsin."
    return final


# ── rapor: derin araştırma (yavaş) — kalp atışı + parçalı yayın ──────────
def rapor_stream(soru: str,
                 on_faz: FazCagiri,
                 on_delta: DeltaCagiri,
                 kalp_atis: float = 3.0) -> str:
    """Derin araştırma modu. Yavaştır: aşama geri bildirimi + sonunda parça akışı."""
    on_faz("rapor", "dusunuyor", "alt başlıklara bölünüyor")
    sonuc: dict = {"y": None}
    dur = {"kaldi": True}

    def _kalp():
        sayim = 0
        while dur["kaldi"]:
            time.sleep(kalp_atis)
            sayim += 1
            on_faz("arastiriliyor", "rapor", f"kaynak taraması ({sayim})")

    t = threading.Thread(target=_kalp, daemon=True)
    t.start()
    try:
        sonuc["y"] = zz.rapor(soru)
    finally:
        dur["kaldi"] = False

    metin = (sonuc["y"] or "Araştırma tamamlandı ama sonuç çıkarılamadı.").strip()
    on_faz("tamamlandi", "konusuyor", f"{len(kirpil(metin))} parça")
    for parca in kirpil(metin, 220):
        on_delta("answer", parca)
    return metin


def akis_uret(mod: str, soru: str,
              on_faz: FazCagiri, on_delta: DeltaCagiri,
              saglayici: Optional[Callable[..., Generator[str, None, None]]] = None) -> str:
    """Mod seçip ilgili stream üretecini koşar. Gateway bu fonksiyonu çağırır."""
    if mod == "rapor":
        return rapor_stream(soru, on_faz, on_delta)
    if mod == "ajan":
        return ajan_stream(soru, on_faz, on_delta, saglayici=saglayici)
    return chat_stream(soru, on_faz, on_delta, saglayici=saglayici)


if __name__ == "__main__":
    import json

    def _faz(faz, durum, detay):
        print("FAZ", json.dumps({"faz": faz, "durum": durum, "detay": detay}, ensure_ascii=False), flush=True)

    def _delta(tur, icerik):
        print("DELTA", json.dumps({"tur": tur, "icerik": icerik}, ensure_ascii=False), flush=True)

    soru = sys.argv[1] if len(sys.argv) > 1 else "Merhaba, kendini tanıtır mısın?"
    mod = sys.argv[2] if len(sys.argv) > 2 else mod_tanima(soru)
    print(f"# mod={mod}", flush=True)
    son = akis_uret(mod, soru, _faz, _delta)
    print("SON:", json.dumps(son[:200], ensure_ascii=False), flush=True)