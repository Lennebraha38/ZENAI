# ZenAI Kapasite Dürüstlüğü Dokümanı

Bu dosyanın amacı: **kullanıcıya ve değerlendiriciye yanlış beklenti yaratmayı önlemek.**
"GPT-6 / Claude seviyesi" pazarlama dilidir; bu doküman gerçek sınırları söyler.

## Gerçek model tabanı (ücretsiz katman)
Sistem, ağırlıkla OpenRouter/Groq üzerinden `:free` modelleri kullanır. Bunlar
üzerinde kendi ince-ayarlı modelimiz YOK; biz bir **yönlendirici + prompt
mühendisliği + doğrulama katmanı**yız.

| Kapasite | Durum | Kanıt |
|---|---|---|
| Token sayımı (8x8, kod) | ✅ iyi — deterministik + Zincir-of-anahtar doğrulaması | `test_lenbeyni` |
| Kısa bilgi (başkent, tarih) | ✅ orta — ücretsiz model bilgisi yeterli | CI smoke |
| Uzun/deep research | ⚠️ yavaş ve sığ olabilir | süre ölçümü CI yok |
| Yaratıcı yazı | ⚠️ orta — ücretsiz model tavanı | örnekleme |
| **Claude/GPT-6 kalitesi** | ❌ **YOK** — API'si para veya taban ücretli | — |

**Doğru ifade:** *"ZenAI, rakip asistanların (ö.z. Claude / GPT) kullandığı
aynı model ailesine erişebilir; kendi modelimiz yok."* Yanlış ifade: *"ZenAI
Claude seviyesinde düşünür."*

## Hız iddiası (1 sn altı)
- Hedef: kullanıcının **ilk token'i 1 saniye içinde** görmesi.
- Gerçekleşme koşulu: **Groq API key tanımlıysa** (Groq donanım hız 1 sn altı
  garantiler). Key yoksa OpenRouter `:free` kuyruğu devrededir → 2-5 sn olabilir.
- Ölçüm: `scripts/olcum.py` ile `kayit/latency.jsonl` — CI'da anahtar yoksa
  bu dosya boş kalır (bilinçli).

## Güvenlik sınırları
- Web katmanı: CORS allowlist + access token + IP rate-limit (bellek içi —
  sunucu yeniden başlarsa sıfırlanır).
- `requests` istemci SSE; sunucu tarafında key asla kullanıcıya dönmez.
- Ses (`pipecat`) lokal CI'da test edilir; üretim deploy'unda pipecat yok → ses
  sadece `web/api` üzerinden stream edilir.

## Ne ZAMAN dürüstçe "bilmiyorum" deme
Uzun/deep araştırmada veya ücretli model gerektiren konularda (ör. güncel tıp,
gerçek zamanlı borsa): model bilgisi yetersizse yaratıcı tahmin YAPMA —
"uzman görüşü gerekir" de. Bu, kullanıcı güvenini rakip tabelalarından daha çok
korur.
