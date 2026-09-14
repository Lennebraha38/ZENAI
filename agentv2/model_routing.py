from typing import Optional, Tuple, List, Dict, Any
"""Model Routing — konuya gore dogru modeli sec + tokeni bol tut.
Claude "az token + yuksek mantik" yapiyor. Bizim formulumuz:
  yuksek mantik + rakipten cok token = ustun cozum

Token limitlerini yüksek tut (Claude 128K'dan 2x-4x daha fazla çıktı).
Kod modülü: free tier ağırlıklı; önceki deepseek hesabı (bakiye sona erdi) → free kod uzmanına geri dönüldü.
"""
import os
import re

# ── Merkezi API ayarlari ───────────────────────────────────────────────
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

# Konu bazli model haritasi: (model_id, max_tokens, aciklama)
# Kod: free-tier anahtarda deepseek 402 (bakiye yok) -> free kod uzmanina geri.
KONU_MODELLERI = {
    "kod": (
        "cohere/north-mini-code:free",
        65536,  # kod uzmanı + geniş token (free tier)
        "Kod uzmanı (free): syntax + çalışan kod üret"
    ),
    "matematik": (
        "nvidia/nemotron-3-ultra-550b-a55b:free",
        65536,  # 4x Claude seviyesi — adım adım göster, hata bul
        "Büyük model: mantık ağırlıklı, uzun CoT çıktısı için"
    ),
    "mantik": (
        "nvidia/nemotron-3-ultra-550b-a55b:free",
        65536,  # 4x — karmaşık problem çözümleri için
        "Büyük model: soyut düşünce, karmaşık mantık ağırlıklı"
    ),
    "bilim": (
        "dots-studio/dots-3-note-preview:free",
        48000,  # 3x — bilimsel açıklama için geniş metin
        "Geniş bağlam: bilimsel bilgi + örnek + detay"
    ),
    "tarih": (
        "dots-studio/dots-3-note-preview:free",
        48000,  # 3x — tarihsel olay zinciri için uzun anlatım
        "Tarihsel olaylar: neden-sonuç zinciri + dönem bağlamı"
    ),
    "dil": (
        "dots-studio/dots-3-note-preview:free",
        24000,  # 2x — dil bilgisi açıklama + örnek
        "Türkçe dilbilgisi: kural + örnek + karşı örnek"
    ),
    "yaratici": (
        "dots-studio/dots-3-note-preview:free",
        40000,  # 2.5x — uzun hikaye/masal için
        "Yaratıcı yazı: uzun anlatım + detay + atmosfer"
    ),
    "kultur": (
        "dots-studio/dots-3-note-preview:free",
        24000,  # 2x — bilgi + örnek + bağlamsal
        "Genel kültür: detaylı bilgi + güncel örnekler"
    ),
    "pratik": (
        "dots-studio/dots-3-note-preview:free",
        16000,  # 1.5x — pratik ama yeterli
        "Pratik bilgi: uygulanabilir, kısa ama tam"
    ),
"teknoloji": (
        "dots-studio/dots-3-note-preview:free",
        48000,  # 3x — teknik derinlik için
        "Teknoloji: derin analitik, teknik terim + örnek"
    ),
}

# Kısa/sohbet soruları için HIZLI model (ilk token çok kısa sürede gelir).
# "8x8" gibi tek satır meseleler 460K'lık yavaş model yerine buraya düşer.
HIZLI_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free"
HIZLI_MAX = 4096

DEFAULT_MODEL = "dots-studio/dots-3-note-preview:free"
DEFAULT_MAX = 32768

def hizli_model_sec(soru: str) -> Optional[Tuple[str, int]]:
    """Çok kısa/sohbet sorularında anında cevap için hızlı model + küçük bütçe;
    kısa değilse None (çağıran konu haritasına düşer)."""
    s = (soru or "").strip()
    if not s:
        return HIZLI_MODEL, HIZLI_MAX
    kelime = len(s.split())
    # Tek satır meseleler (soru < 7 kelime) ve saf hesaplama→ hızlı model.
    if kelime <= 7 or re.search(r'^[0-9xX*/=+\-., ]+$', s):
        return HIZLI_MODEL, HIZLI_MAX
    return None

def model_sec(konu: str) -> Tuple[str, int]:
    """Konuya gore model ve max_tokens dondurur."""
    model, maxt, _ = KONU_MODELLERI.get(konu, (DEFAULT_MODEL, DEFAULT_MAX, "Varsayilan"))
    return model, maxt

# ── Fallback zinciri (429/401/404 durumunda otomatik geçiş) ──────────────
FALLBACK_ZINCIRI = [
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "openrouter/auto",
    "qwen/qwen-3-coder-flash",
    "meta-llama/llama-3.3-70b-instruct:free",
]

def model_fallback(model: str) -> List[str]:
    """Verilen modelin ardindan denenebilecek yedek modelleri dondurur.
    (model, maxt) girdisine model adi verilir; kalan linkler paylasilir."""
    sira = []
    for m in FALLBACK_ZINCIRI:
        if m != model:
            sira.append(m)
    return sira

def model_sec_hepsi(konu: str) -> Tuple[List[str], int]:
    """Konu icin (birincil + fallback) model listesi dondurur.
    Tam zirve akisinda 429/402/404 gorurse siralamayi dener."""
    birincil, maxt, _ = KONU_MODELLERI.get(konu, (DEFAULT_MODEL, DEFAULT_MAX, "Varsayilan"))
    return [birincil] + [m for m in FALLBACK_ZINCIRI if m != birincil], maxt

def konu_aciklama(konu: str) -> str:
    """Konunun neden o modelde secildigini acikla."""
    _, _, aciklama = KONU_MODELLERI.get(konu, (DEFAULT_MODEL, DEFAULT_MAX, "Varsayilan model"))
    return aciklama

# ── Veri odakli routing: her gercek sonucu logla ──
def routing_logla(konu: str, soru: str, model: str, skor: float, sure: Optional[float] = None, kelime: Optional[int] = None) -> Dict[str, Any]:
    """Test sonucunu kayide isler; routing kurallari veriyle guncellenebilir."""
    import os, time, json
    dizin = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "kayit")
    os.makedirs(dizin, exist_ok=True)
    dosya = os.path.join(dizin, "routing_log.jsonl")
    satir = {
        "zaman": time.time(), "konu": konu, "soru": soru[:80],
        "model": model, "skor": round(float(skor), 3),
        "sure": sure, "kelime": kelime,
    }
    try:
        with open(dosya, "a") as f:
            f.write(json.dumps(satir, ensure_ascii=False) + "\n")
    except Exception:
        pass
    return satir

def routing_rapor() -> Dict[str, Any]:
    """Loglardan hangi model hangi konuda kazaniyor ozetler."""
    import os, glob, json
    sayilar = {}
    dizin = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "kayit")
    dosyalar = glob.glob(os.path.join(dizin, "routing_log.jsonl")) or glob.glob("kayit/routing_log.jsonl")
    for dosya in dosyalar:
        try:
            with open(dosya) as f:
                for satir in f:
                    try:
                        d = json.loads(satir)
                    except Exception:
                        continue
                    ana = (d.get("konu"), d.get("model"))
                    k, n, s = sayilar.get(ana, (0, 0, 0.0))
                    sayilar[ana] = (k + 1, n + d.get("kelime") or 0, s + (d.get("skor") or 0))
        except Exception:
            continue
    rapor = {}
    for (konu, model), (k, n, s) in sorted(sayilar.items()):
        rapor.setdefault(konu, []).append({
            "model": model, "adet": k, "ortalama": round(s / k, 3), "toplam_kelime": n})
    for konu in rapor:
        rapor[konu].sort(key=lambda x: x["ortalama"], reverse=True)
    return rapor

def model_profil(konu: str) -> Optional[str]:
    """Loglara gore konu icin en iyi modeli oner (veri varsa)."""
    rapor = routing_rapor().get(konu or "")
    if rapor and rapor[0]["adet"] >= 3:
        return rapor[0]["model"]
    return None
