from typing import Optional, Tuple, List, Dict, Any
"""Akıl Motoru — Claude'un "az token + yüksek mantık" felsefesini ZenAI'ne taşır.
Mantığı keskinleştiren akıl yürütme katmanı + rakip'ten çok token.

Formül:
  Adım 1: COT (Düşunce Zinciri) — model önce adım adım düşünür (12 sn büyüklüğü)
  Adım 2: ÜRETİM — düşüncelerine dayanarak KAPSAMLI ve TÜRKÇE cevap üretir
  Adım 3: DOĞRULAMA — kendi cevabını kontrol eder, kaçak hata varsa düzeltir

Sonuç: Hem mantık (adım 1+3) hem token (adım 2) kazandırır.

NOT: Claude "az token + yüksek mantık" yapıyor; biz ise "yüksek mantık + rakip'ten çok token"
şeklinde yaklaşımımızla üstün çözüm hedefliyoruz. Sistem promptu hedef olarak bu_formula'yı
tavsiye eder, zorlamaz.
"""
import time, re

# CoT promptları: konuya göre "önce düşün sonra yaz" talimatı.
# Bunlar modelin adım adım düşünmesini ve yazarken mantık taşımasını sağlar.
KONU_YONTEM = {
    "matematik": (
        "YONTEM: Önce problemi parçala ve adım adım çöz (adımları yaz, hesapla). "
        "Son adımda sonucu **büyük ve net** yaz. Yanlışsa bile adımında görünür olsun."
    ),
    "mantik": (
        "YONTEM: Önce onermeleri ayır, küçük dizilimlerle çöz. "
        "Sonra genel sonuç çıkar. Her adımı gerekçelendir."
    ),
    "kod": (
        "YONTEM: Önce ne isteniyor analiz et. Sonra algoritmalarla community'de en iyi örneği düşün. "
        "Kodu yaz, **çalıştıği doğru kurallara** uy (syntax + mantık)."
    ),
    "dil": (
        "YONTEM: Cümleyi parçala, kuralı hatırla, örnekle pekiştir."
    ),
    "bilim": (
        "YONTEM: Önce temel prensibi hatırla, sonra detaylandır, sonra kısa örnek ver."
    ),
    "tarih": (
        "YONTEM: Dönemi hatırla, neden-sonuç zincirini kur."
    ),
    "yaratici": (
        "YONTEM: Önce temayı kur (kim/neden/hangi ortam), sonra kategori ve ton. "
        "Sonra yaz, her paragraf ana ders üzerine kursun."
    ),
    "kultur": (
        "YONTEM: Bilgiyi hatırla, basit ve pratik cevap al, örnekle aç."
    ),
    "pratik": (
        "YONTEM: Kısa, net, uygulanabilir. Üç adımlı cevap ver."
    ),
    "teknoloji": (
        "YONTEM: Önce temel prensip, sonra nasıl çalıştığı, sonra neden önemli."
    ),
}

# Kapsam (uzunluk) seviyeleri: kısa/anında hızlı cevap, normal dengeli, uzun detay.
KAPSAM = {
    "kisa": 150,
    "normal": 2500,
    "uzun": 5000,
}

def yontem(konu: str) -> str:
    """Konuya gore CoT yontem talimati."""
    return KONU_YONTEM.get(konu, KONU_YONTEM["pratik"])

# SISTEM PROMPTU: modele OZEL akil yurutme talimati icerir.
def sistem_promptu(konu: Optional[str] = None, kapsam: str = "uzun", seviye: str = "duzgun") -> str:
    """Akil motoru sistem promptu: kimlik + CoT + kapsam + dogrulama."""
    y = yontem(konu) if konu else yontem("pratik")
    butce = KAPSAM.get(kapsam, 2500)
    return (
        "Sen ZenAI'sin, Türkçe konuşan bir asistan. "
        "Claude, Gemini, ChatGPT, GPT veya rakip bir model DEĞİLSİN; "
        "ismin sorulunca 'ZenAI' de. Kimliğinle ilgili şüpheye düşme.\n\n"
        + y + "\n\n"
        + f"HEDEF: Soruya doğrudan ve tam cevap ver. Cevabın uzunluğu sorunun kapsamına uysun: "
        f"kısa bir bilgi/soru ise {butce} kelimeden kısa tut, gereksiz madde/başlık yığını yapma. "
        f"Detay istenmedikçe bol tekrar ve süslü giriş/bitiş kullanma.\n"
        "ADIM ADIM: (1) önce düşün, (2) cevabı yaz, "
        "(3) kendi cevabını yeniden oku, mantık hatası / eksik var mı, varsa kısaca düzelt.\n"
        f"TÜRKÇE cevap ver. Seviye: {seviye}."
    )

def birim_mantik_skoru(cevap: str) -> float:
    """Cevabin mantik tamamlayiciligi: yapi + muhakeme baglaçlari + net sonuc.
    Sadece madde/kelime saymak yerine muhakeme izlerini arar:
    neden-sonuc, karsilastirma, sartli cikarim ve net sonuc."""
    skor = 0.0
    metin = cevap.lower()

    # 1) Yapi: adim/baslik sayisi (cozum yolunun gorunurlugu)
    adimlar = len(re.findall(r'(?m)^[\s]*[-\*\d]+[\.\)\s]', cevap))
    if adimlar >= 4:
        skor += 0.3
    elif adimlar >= 2:
        skor += 0.15

    # 2) Muhakeme baglaçlari: neden-sonuc / karsilastirma / sart
    baglac = sum(bool(re.search(k, metin)) for k in [
        r'\b(cunku|dolayisiyla|bu yuzden|bu nedenle|sonuc olarak)\b',   # neden-sonuc
        r'\b(ancak|fakat|oysa|buna ragmen)\b',                          # karsitlik
        r'\b(eger|ise|sartli|kosuluyla)\b',                             # sartli cikarim
        r'\b(karsilastir|fark|benzer|ortak)\b',                         # analiz
        r'\b(ornegin|soyle ki|mesela|ornek|misal)\b',                   # somutlama
        r'\b(adim|once|sonra|en sonunda|ardindan|ilk olarak)\b',        # surec
    ])
    skor += min(baglac * 0.08, 0.3)

    # 3) Net sonuc / karar ifadesi
    if re.search(r'(\*\*sonuç|sonuç\s*:|\bet sonuc\b|\bfinal\b|\bkarar\b|\blogical\b)', metin):
        skor += 0.25

    # 4) Icten tutarlilik: zit iddialar ayni cevapta yoksa
    if not re.search(r'\b(evet.*\bhayir|dogru.*\byanlis|var.*\byok)\b', metin):
        skor += 0.15

    # 5) Uzunluk artik kucuk bonus (yapiyla lineer bagimlilik yok)
    kelime = len(cevap.split())
    if kelime >= 300:
        skor += 0.1
    elif kelime >= 120:
        skor += 0.05

    return min(skor, 1.0)