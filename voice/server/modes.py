"""Mod tanıma + konu tespiti — ZenAI'nin yönlendirme mantığını korur.

Beyin kaynak koduna dokunulmaz: bu yardımcılar ses katmanına özgüdür ve
agentv2.model_routing.KONU_MODELLERI haritasını yeniden kullanarak cevabın
stream edileceği modeli & token bütçesini seçer.
"""
from typing import Tuple

try:
    from agentv2.model_routing import (
        KONU_MODELLERI, DEFAULT_MODEL, DEFAULT_MAX,
        hizli_model_sec,
    )
except Exception:
    KONU_MODELLERI, DEFAULT_MODEL, DEFAULT_MAX = {}, "dots-studio/dots-3-note-preview:free", 32768

    def hizli_model_sec(soru: str) -> Tuple[str, int]:
        return "nvidia/nemotron-3-ultra-550b-a55b:free", 4096

# Sesli sohbet için konu tespiti (ajan gamında hafif regex; "dil" başta).
KONU_IZLERI = [
    ("dil", r"\b(türkçe|turkce|dilbilgisi|gramer|cümle |kelime|anlamı|ingilizce|sözcük|yazım|deyim|lafız)\b"),
    ("kod", r"\b(python|javascript|dizile|sözdizimi|bug|hatası|kod |functions|class|api|sql|veritabanı|react|bash|script|parça)\b"),
    ("matematik", r"\b(hesapla|hesapla|çarp|böl|topla|kaç eder|denklem|türev|integral|karekök|yüzde|matematik)\b"),
    ("mantik", r"\b(mantık|çıkarım|önerme|akıl yürütme|bilmece|problem çöz|bulmaca)\b"),
    ("bilim", r"\b(fizik|kimya|biyoloji|güneş|atom|hücre|evrim|gen|tıp|bilim)\b"),
    ("tarih", r"\b(osmanlı|tarih|yüzyıl|savaşı|cumhuriyet|antik|imparatorluk)\b"),
    ("teknoloji", r"\b(yapay zeka|\bai\b|yazılım|internet|bilgisayar|telefon|quantum|blockchain|robot|uydular|nasa)\b"),
    ("yaratici", r"\b(hikaye|hikâye|masal|şiir|şiir|senaryo|roman|öykü|fıkra)\b"),
    ("kultur", r"\b(sanat|müzik|film|kitap|yemek|gelenek|kültür|spor)\b"),
    ("pratik", r"\b(nasıl|ne zaman|kaçta|nerede|tavsiye|öner|fiyat|satın al|kullan)\b"),
]


def konu_bul(soru: str) -> str:
    """Soru metninden konu seçer (ilk eşleşen iz). Varsayılan: pratik."""
    metin = " " + soru.lower() + " "
    for konu, iz in KONU_IZLERI:
        import re as _re
        if _re.search(iz, metin):
            return konu
    return "pratik"


def model_sec(soru: str) -> Tuple[str, int]:
    """Konuya göre (model, max_tokens) döndürür — model_routing haritasından.

    Kısa/sohbet meseleleri („8x8“, „ismin ne“) direkt hızlı modele düşer;
    uzun/bilgi isteyen sorular konu haritasından yavaş-ama-kapsamlı modeli alır.
    """
    hizli = hizli_model_sec(soru)
    if hizli:
        # Kısa mesele: hızlı model + küçük bütçe (hemen cevap)
        return hizli
    konu = konu_bul(soru)
    if KONU_MODELLERI and konu in KONU_MODELLERI:
        model, maxt, _ = KONU_MODELLERI[konu]
        return model, int(maxt)
    # konu içi eşleşme yoksa: birebir rangeler dışındaysa varsayılan
    if konu in ("pratik", "dil", "kultur") and KONU_MODELLERI:
        return KONU_MODELLERI[konu][0], int(KONU_MODELLERI[konu][1])
    return DEFAULT_MODEL, DEFAULT_MAX


def mod_tanima(soru: str) -> str:
    """Kullanıcı ifadesindan sesli katman modunu seçer.

    chat   -> doğrudan akış (konuşma için hızlı, araçsız)
    ajan   -> araç kullanımı (arama/site/haber/hava/komut)
    rapor  -> derin araştırma (yavaş; sesli tarafta açıkça istenirse)
    """
    import re as _re
    s = " " + soru.lower() + " "
    if _re.search(r"\b(rapor|derin araştırma|detaylı araştır|kapsamlı araştırma|araştırma yap|kaynaklı rapor)\b", s):
        return "rapor"
    if _re.search(r"\b(web'de ara|internette ara|sayfayı oku|şu siteyi| siteyi görüntüle|github\b|repo\b|hava durumu|haber|günün haberleri|youtube|ekran görüntüsü|dosya oku|python çalıştır)\b", s):
        return "ajan"
    return "chat"


def ses_prompt_kisa() -> str:
    """Sesli sohbete özel, doğal/konuşma dili cevap üreten sistem promptu.

    ZenAI'nin akıl motoru felsefesini korur ama TTS için akıcı, özet,
    liste-ağırlıksız bir anlatım ister (derin_rapor/metin moduna dokunmaz).
    """
    return (
        "Sen ZenAI'sin, Türkçe konuşan bir asistan. Şu an biriyle sesli konuşuyorsun. "
        "Claude, Gemini, ChatGPT veya GPT DEĞİLSİN; adın sorulursa 'ZenAI' de.\n"
        "Yanıtların doğal ve açık olmalı, kulağa robotik gelmemeli. "
        "Liste ve uzun başlık dizileri yerine akıcı, kısa cümlelerle — "
        "tıpkı bir asistanın konuştuğu gibi — anlat. "
        "Önce kısaca doğrudan cevap ver, sonra gerekliyse kısa bir örnek ya da sonuç ekle. "
        "Toplam cevap genelde 2-4 kısa cümle, yazılı ödev/rapor değil."
    )