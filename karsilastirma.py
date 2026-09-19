"""ZenAI 50-konu karsilastirma testi.
Her konuda bir soru sorar, sure/kelime/cikti kaydeder, JSON rapor yazar.
Rate-limit aware: her istek arasinda bekleme + 429'da exponential backoff.
Model Routing: konuya gore dogru modeli secer.
Self-Correction: hatali cevap bulursa duzeltme turu calistirir.
"""
import os, sys, json, time, re
from typing import Any, Dict, List, Optional, Tuple

# Routing ve self-correction modulleri
_syd = os.path.dirname(__file__)
if _syd not in sys.path:
    sys.path.insert(0, _syd)
if os.path.join(_syd, "agentv2") not in sys.path:
    sys.path.insert(0, os.path.join(_syd, "agentv2"))
try:
    from model_routing import model_sec, konu_aciklama, OPENROUTER_URL
    from self_correction import self_correction
except ImportError:
    from agentv2.model_routing import model_sec, konu_aciklama, OPENROUTER_URL
    from agentv2.self_correction import self_correction

def _yaz(cikti_yol: str, rapor: Dict[str, Any]) -> None:
    """JSON'a yazmadan once otomatik skorer ile POST-puanlama yapar.
    Boylece `karsilastirma.json` her zaman puansiz ham kayit degil,
    dogrulanmis bir olcum dosyasi olur (CI gate'iyle korunur)."""
    try:
        from otomatik_skorer import puanla
    except ImportError:
        from agentv2.otomatik_skorer import puanla
    puanlar = puanla(list(rapor.get("sonuclar", [])))
    rapor["ozet"] = {k: puanlar[k] for k in
                     ("genel_puan", "ortalama_cevaplanan", "basarili_soru",
                      "hatali_soru", "konu_ozet")}
    rapor["sonuclar"] = puanlar["sonuclar"]
    with open(cikti_yol, "w") as f:
        json.dump(rapor, f, ensure_ascii=False, indent=1)

SORULAR = [
    # 1-5: Kod
    ("kod", "Python ile bir dosyanin ilk 5 satirini okuyan fonksiyon yaz."),
    ("kod", "Basit bir web sunucusu (HTTP) Python ile nasil yazilir? Ornek ver."),
    ("kod", "Bir listeyi kucukten buyuge siralama algoritmasini acikla (quicksort)."),
    ("kod", "SQL'de iki tabloyu birleştirmenin (JOIN) turlerini acikla."),
    ("kod", "Regex ile e-posta adresi dogrulayan ornek yaz."),
    # 6-10: Matematik
    ("matematik", "2+7*3-8/2 isleminin sonucu kactir? Adim adim goster."),
    ("matematik", "Bir dortgenin ic acilarinin toplami neden 360 derecedir?"),
    ("matematik", "Pi sayisinin kesirli yaklasik degerini ve neden dogru oldugunu anlat."),
    ("matematik", "Bir sayinin asal olup olmadigini bulmanin en hizli yolu nedir?"),
    ("matematik", "Olasilik: 6 yuzlu zar 2 kez atilinca iki kez 6 gelme ihtimali?"),
    # 11-15: Dil / Turkce
    ("dil", "'Ki' baglacinin yazim kurallarini orneklerle anlat."),
    ("dil", "'Degil' veya 'değil' hangisi dogru? Turkce imla kurallarini acikla."),
    ("dil", "Bu cumledeki anlam bozuklugunu bul ve duzelt: 'Kitap okumayi cok seviyorum ama zamanim olmuyor, arkadaslarim kitap okur'"),
    ("dil", "Bir paragrafi Turkce'den Ingilizce'ye cevir: 'Yaz mevsimi denize girmek icin en guzel zamandir.'"),
    ("dil", "'Elma' kelimesinin mecaz anlamini cumlede kullan."),
    # 16-20: Mantik / Akil yurutme
    ("mantik", "Bir copcu günde 3 sokak temizliyor, her sokak 40 dakika suruyor. 5 copcu 2 sokak temizlerse ne kadar surer? Yanlis varsayimlari da belirt."),
    ("mantik", "Bir dunyada tum kuzgunlar siyahtir. Beyaz bir kuzgun bulursak bu onermeyi nasil degisir?"),
    ("mantik", "Sudoku bulmaca cozumune nasil yaklasilir? Adim adim anlat."),
    ("mantik", "Klasik bilmece: Hangi soruyu herkes farkli cevaplar?"),
    ("mantik", "Eger bugun carsamba ise yarin gunlerden ne? Ama 'yarin' kelimesi pazartesi anlamina gelebilir mi?"),
    # 21-25: Bilim / Teknoloji
    ("bilim", "Fotoelektrik etki nedir ve Einstein bunu nasil acikladi?"),
    ("bilim", "DNA'nin yapisini kisa ve anlasilir sekilde anlat."),
    ("bilim", "Yapay zeka ile makine ogrenmesi arasindaki fark nedir?"),
    ("bilim", "Iki fotonun birbirleriyle dolanik olmasi ne demek? Ornek ver."),
    ("bilim", "Kuantum bilgisayary nerede klasik bilgisayardan ustun olacak?"),
    # 26-30: Tarih
    ("tarih", "Osmanli Devleti'nin kurulusu hangi donemde gerceklesti ve kim kurdu?"),
    ("tarih", "Ronesans neden Italya'da basladi?"),
    ("tarih", "Birinci Dunya Savasi'nin ana nedenlerini madde madde yaz."),
    ("tarih", "Cumhuriyet ne zaman ilan edildi ve neyi sembolize eder?"),
    ("tarih", "Tarihte 'Guclu Devlet' kavrami hangi donemde ortaya cikti?"),
    # 31-35: Yaratıcılık
    ("yaratici", "Maviden baslayip kizila donen bir sehir manzarasi hikayesi yaz (3 paragraf)."),
    ("yaratici", "Bir masal kahramani icin benzersiz bir guc tasarla ve acikla."),
    ("yaratici", "Iki kelime veriyorum: 'feridun', 'telefon'. Ikisini birlesitiren komik bir kisa hikaye yaz."),
    ("yaratici", "Bir logo icin 3 fikir oner: kahve dukkani."),
    ("yaratici", "5 maddelik bir 'dogayla uyumlu yasam' manifestosu yaz."),
    # 36-40: Genel Kultur
    ("kultur", "Turk kahvesi nasil yapilir? Adim adim anlat."),
    ("kultur", "Maskot kavrami nedir ve neden markalar icin onemlidir?"),
    ("kultur", "Bayrak yarisi nedir? Acikla."),
    ("kultur", "Bir turist icin Istanbul'da 3 gunluk gezi plani oner."),
    ("kultur", "Dunyanin en kalabalik 5 sehrini isimlendir."),
    # 41-45: Pratik / Gundelik
    ("pratik", "Araba lastigi ne zaman degistirilmeli? Abartma, kisa anlat."),
    ("pratik", "Bir dakikada uykuya dalmak icin teknikler oner."),
    ("pratik", "Yemekte limon suyu yerine ne kullanabilirim?"),
    ("pratik", "Sunger sifirlamak icin en hizli yontem nedir?"),
    ("pratik", "Iyi bir sabah rutini icin 3 madde oner."),
    # 46-50: Teknoloji / Ileri
    ("teknoloji", "LLM olarak 'context window' nedir? Kisa ve net anlat."),
    ("teknoloji", "Vektorel veritabani ne ise yarar? Ornek ver."),
    ("teknoloji", "Blockchain'in temel calisma mantigi nedir?"),
    ("teknoloji", "GPU neden fermliyor? performans artisi nasil olur?"),
    ("teknoloji", "Bir yapay zeka modelini nasil egitirsin? Adim adim."),
]

def test_et(o: Dict[str, Any], model: str, key: str, max_tokens: int = 1024, deneme: int = 3) -> Tuple[Optional[str], int]:
    import requests
    for tur in range(deneme):
        t0 = time.time()
        try:
            r = requests.post(OPENROUTER_URL, json={
                "model": model,
                "messages": [{"role": "system", "content": "Turkce, net ve dogru cevap ver."},
                             {"role": "user", "content": o}],
                "max_tokens": max_tokens, "temperature": 0.3,
            }, headers={"Authorization": "Bearer " + key}, timeout=120)
            sure = round(time.time()-t0, 1)
            if r.status_code == 200:
                c = r.json()["choices"][0]["message"]["content"]
                return {"sure": sure, "kelime": len(c.split()), "cikti": c[:3000]}
            elif r.status_code == 429:
                bekle = (2 ** tur) * 3  # 3sn, 6sn, 12sn
                print(f"   [429 rate-limit] {bekle}sn bekleniyor... (deneme {tur+1}/{deneme})")
                time.sleep(bekle)
                continue
            return {"sure": sure, "kelime": 0, "cikti": f"[HTTP {r.status_code}: {r.text[:100]}]"}
        except Exception as e:
            return {"sure": round(time.time()-t0,1), "kelime": 0, "cikti": f"[HATA: {e}]"}
    return {"sure": 0, "kelime": 0, "cikti": "[HTTP 429: rate-limit asildi, tum denemeler tükendi]"}

def _sor(mesajlar: List[Dict[str, str]], model: str, key: str, max_tokens: int = 1024) -> str:
    """Self-correction duzeltme turlari icin dogrudan soru sorma."""
    import requests
    try:
        r = requests.post(OPENROUTER_URL, json={
            "model": model,
            "messages": mesajlar,
            "max_tokens": max_tokens, "temperature": 0.2,
        }, headers={"Authorization": "Bearer " + key}, timeout=120)
        if r.status_code == 200:
            return r.json()["choices"][0]["message"]["content"]
        return None
    except Exception:
        return None

if __name__ == "__main__":
    model = os.environ.get("LB_MODEL", "dots-studio/dots-3-note-preview:free")
    routing = os.environ.get("LB_ROUTING", "on") != "off"
    key = os.environ.get("OPENROUTER_KEY", "")
    butun = []
    model_kullanim = {}
    for i, (k, s) in enumerate(SORULAR, 1):
        # Model Routing: konuya gore model sec
        secilen_model = model
        secilen_max = 1024
        if routing:
            secilen_model, secilen_max = model_sec(k)
            model_kullanim[secilen_model] = model_kullanim.get(secilen_model, 0) + 1
        print(f"[{i}/50] {k}: {s[:45]}... (model: {secilen_model.split('/')[-1].split(':')[0]})")
        
        # Ilk test: seçilen model ile
        son = test_et(s, secilen_model, key, secilen_max)
        
        # Self-Correction: kod/matematik hatalarinda duzeltme turlari
        duzeltilen = 0
        sc_notu = ""
        if son.get("kelime", 0) > 0 and k in ("kod", "matematik"):
            cevap, tur, not_ = self_correction(s, son["cikti"], k, 
                lambda msg: _sor(msg, secilen_model, key, secilen_max))
            duzeltilen = tur
            sc_notu = not_
            son["cikti"] = cevap
            son["kelime"] = len(cevap.split())
        elif son.get("kelime", 0) > 0 and k == "mantik":
            cevap, tur, not_ = self_correction(s, son["cikti"], "genel",
                lambda msg: _sor(msg, secilen_model, key, secilen_max))
            duzeltilen = tur
            sc_notu = not_
            son["cikti"] = cevap
            son["kelime"] = len(cevap.split())
        
        butun.append({"no": i, "konu": k, "soru": s, "model": secilen_model, 
                      "duzeltme": duzeltilen, "sc_notu": sc_notu, **son})
        print(f"   -> {son['sure']}sn, {son['kelime']} kelime, sc:{duzeltilen} {sc_notu[:30]} {son['cikti'][:40].replace(chr(10),' ')!r}")
        # Her sorudan sonra 2sn bekle (rate-limit korumasi)
        if i < len(SORULAR):
            time.sleep(2)
            # Her 10 soruda aralik kaydet (kismi sonuc)
            if i % 10 == 0:
                cikti_yol = os.environ.get("LB_CIKTI", "karsilastirma.json")
                _yaz(cikti_yol, {"model": model, "routing": routing, "model_kullanim": model_kullanim, "sonuclar": butun})
                print(f"   [kismi kaydedildi: {i}/50]")
    cikti_yol = os.environ.get("LB_CIKTI", "karsilastirma.json")
    _yaz(cikti_yol, {"model": model, "routing": routing, "model_kullanim": model_kullanim, "sonuclar": butun})
    print(f"\nRapor: {cikti_yol}")
    if routing:
        print("\nModel kullanim dagilimi:")
        for m, adet in sorted(model_kullanim.items(), key=lambda x: -x[1]):
            print(f"  {m.split('/')[-1].split(':')[0]:30s} {adet} soru")