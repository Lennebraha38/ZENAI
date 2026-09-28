# ZenAI — Gerçek Kimlik Doğrulama ve Abonelik Kurulumu

Kod tamam ve test edildi (94/94 birim testi). Aşağıdaki ortam değişkenleri
Vercel'de tanımlanmadan hesap sistemi ve ödeme **bilinçli olarak kapalı** kalır
ve arayüz bunu dürüstçe bildirir.

**Giriş nasıl çalışıyor?** Varsayılan yol kendi hesap sistemimiz: kullanıcı
e-posta + şifreyle kaydolur (`/api/auth/kayit`, `/api/auth/giris`). Ek bir
Google Cloud projesi **gerekmez**. Google girişi isteğe bağlı bir alternatiftir;
`GOOGLE_CLIENT_ID` tanımlıysa arayüzde ek olarak görünür, tanımlı değilse hiç
gösterilmez.

## 1. Vercel'e eklenmesi gereken değişkenler

Vercel → Proje (`zenai`) → Settings → Environment Variables

| Değişken | Zorunlu | Nerede bulunur | Örnek |
|---|---|---|---|
| `SESSION_SECRET` | evet | Kendin üret | `openssl rand -base64 48` |
| `BLOB_READ_WRITE_TOKEN` | evet | `vercel blob create-store` (aşağıda) | `vercel_blob_rw_...` |
| `GOOGLE_CLIENT_ID` | **hayır** | İsteğe bağlı. Google girişi isteniyorsa | `1234...apps.googleusercontent.com` |
| `STRIPE_SECRET_KEY` | evet (ödeme için) | Stripe Dashboard → API keys → Secret key | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | evet | Stripe → Webhooks → endpoint → Signing secret | `whsec_...` |
| `STRIPE_PRICE_SILVER` | evet | Stripe → Products → Prices → ID | `price_...` |
| `STRIPE_PRICE_GOLD` | evet | aynı | `price_...` |
| `STRIPE_PRICE_PLATINUM` | evet | aynı | `price_...` |
| `BLOB_READ_WRITE_TOKEN` | evet | `vercel blob create-store` (aşağıda) | `vercel_blob_rw_...` |
| `ZENAI_ORIGIN` | evet | sitenin adresi (virgülle çoklu) | `https://zenai-two.vercel.app` |
| `OPENROUTER_KEY` | evet | OpenRouter → API keys | `sk-or-...` |

> **`BLOB_READ_WRITE_TOKEN` neden gerekli?** Sunucusuz (serverless) ortamda
> kalıcı bellek yoktur. Aynı depo iki şeyi tutar:
>
> 1. **Hesaplar** — e-posta + şifre kayıtları (`user/<sub>.json`)
> 2. **Abonelik planları** — Stripe webhook'unun yazdığı gerçek plan
>
> Ayrıca bir veritabanı hesabı açmaya gerek yoktur, Vercel hesabı yeterlidir.
> Depo kurulu değilse hesap sistemi kendini kapatır (`hesapAktif: false`) ve
> webhook 500 döner; bu **bilinçlidir** (Stripe olayı yeniden denesin diye).
> Sessizce kayıp yazılsaydı kullanıcı ödeme yapmış ama ücretsiz kalırdı.
>
> Depo kuruluysa `/api/config` çıktısında `depoVar: true` görünür.
> `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` tanımlıysa geriye
> dönük uyum için Upstash de kullanılır (tercih sırası: Blob > Upstash).

## 2. Google Cloud Console — İSTEĞE BAĞLI

Bu bölümü **atlayabilirsiniz.** Google girişi zorunlu değildir; e-posta + şifre
yeterlidir. Yalnızca "Google ile devam et" düğmesini de görmek isterseniz:

1. [console.cloud.google.com](https://console.cloud.google.com) → proje oluştur
2. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
3. Application type: **Web application**
4. Authorized JavaScript origins:
   - `https://zenai-two.vercel.app`
   - (lokal geliştirme için) `http://localhost:8899`
5. Authorized redirect URIs: (bu akış kullanmıyor, boş bırakılabilir)
6. Client ID'yi `GOOGLE_CLIENT_ID` olarak ekle
7. **OAuth consent screen**'de uygulama yayına alınmadıysa test kullanıcıları
   ekle (kendi Google hesabın) veya "In production" seç

Bu değişken tanımlı değilse arayüz Google düğmesini hiç göstermez; e-posta +
şifre çalışmaya devam eder.

## 3. Stripe

1. [dashboard.stripe.com](https://dashboard.stripe.com) → Products → Silver, Gold,
   Platinum için ayrı ayrı **aylık** fiyat oluştur
2. Her fiyatın `price_...` kimliğini `STRIPE_PRICE_*` olarak ekle
3. Developers → Webhooks → Endpoint ekle:
   - URL: `https://zenai-two.vercel.app/api/billing/webhook`
   - Events: `checkout.session.completed`,
     `customer.subscription.updated`,
     `customer.subscription.deleted`
4. Endpoint'in **Signing secret** değerini `STRIPE_WEBHOOK_SECRET` olarak ekle
5. Test modunda denemek için Stripe CLI:
   `stripe listen --forward-to localhost:8899/api/billing/webhook`

## 4. Vercel Blob deposu (abonelik kalıcılığı) — ZATEN KURULU

Ayrı hesap açmaya gerek yok; Vercel hesabı yeterli. Depo `web/` dizininde
kurulur ve `BLOB_READ_WRITE_TOKEN` değişkenini **otomatik** ekler:

```bash
cd web
vercel blob create-store zenai-plan --access private --yes   # mevcut depo: zenai-plan2
```

Doğrulama:

```bash
vercel env ls          # BLOB_READ_WRITE_TOKEN görünmeli
```

> Yeniden kurulum gerekirse: `vercel blob delete-store <storeId> --yes`
> sonra yukarıdaki create komutu.

## 5. Deploy sonrası kontrol

```
https://zenai-two.vercel.app/api/config
```

Bu uç nokta **gizli anahtar içermez**. Şunları doğrulaması gerekir:

```json
{
  "hesapAktif": true,
  "googleAktif": false,
  "odemeAktif": false,
  "depoVar": true,
  "girisYapildi": false,
  "plan": { "kod": "free", "ad": "Free", "maxToken": 8192 }
}
```

- `hesapAktif: false` → e-posta + şifre kaydı açılmamış; sadece misafir modu çalışır.
  Açmak için `BLOB_READ_WRITE_TOKEN` tanımlı olmalı.
- `depoVar: false` → abonelik satın alınamaz, webhook planı kaydedemez.
- `odemeAktif: false` → Stripe değişkenleri eksik; plan satın alma düğmeleri
  pasif kalır (e-posta + şifre çalışmaya devam eder).

## 5b. OpenRouter bakiyesi (görsel üretimi)

Sohbet ve görsel üretimi **aynı** OpenRouter hesabını kullanır, ama görsel modeli
çok daha pahalıdır. Tek bir 1:1 görsel ~1000–1500 token tutar.

OpenRouter, istenen azami token'ın hesap bakiyesini karşılayıp karşılamadığını
**üretim yapmadan** denetler. Bakiye yetmiyorsa isteği reddeder. `/api/gorsel`
bu durumda HTTP 402 döner ve yanıtta `karşılanabilirToken` alanı, bakiyenin kaç
token'a yettiğini söyler.

> Şu anda bu hesapta görsel için yalnızca **163 token** karşılanabiliyor — tek bir
> görsel bile üretmeye yetmiyor. Bakiye yüklenmeden görsel üretimi çalışmaz.

Bakiye yükleme: openrouter.ai → Settings → Credits

Sohbet şu anda çalışıyor (aynı anahtar, HTTP 200 doğrulandı) — yalnızca görsel
üretimi bakiyeye takılıyor.

Gereken azami token sayısını değiştirmek istersen:
`OPENROUTER_IMAGE_MAX_TOKENS` (varsayılan 3000).

## 6. E-posta + şifre hesap sistemi — ZATEN KURULU

Ayrıca hiçbir şey yapmanız gerekmiyor; yalnızca `BLOB_READ_WRITE_TOKEN` yeterli.

| Uç nokta | Ne yapar |
|---|---|
| `POST /api/auth/kayit` | Yeni hesap açar, oturum çerezi verir. Aynı e-posta ikinci kez kaydedilemez (409) — mevcut hesap **ezilmez**. |
| `POST /api/auth/giris` | E-posta + şifre doğrular, oturum çerezi verir. |
| `POST /api/auth/logout` | Oturumu kapatır. |

Bilinen sınırlar (bilinçli tercih): e-posta doğrulama ve şifre sıfırlama **yok**.
Kullanıcı şifresini unutursa hesabı manuel olarak sıfırlamak gerekir.

### Güvenlik davranışı

- Şifre asla düz saklanmaz: **scrypt** (N=16384) + 16 baytlık rastgele tuz.
- Kullanıcı numarası (`sub`), e-postanın SHA-256 özetidir → e-posta hiçbir dosya
  adında görünmez.
- Giriş hatası **her zaman** aynı mesajı döner ("E-posta veya şifre hatalı");
  kullanıcının var olup olmadığı sızdırılmaz.
- Kaba kuvvet koruması: 8 hatalı denemede hesap **15 dakika** kilitlenir (HTTP 429).
  Sayaç, gecikmeli okuma yüzünden geriye gidemeyecek şekilde **her deneme için
  ayrı bir kayıt** olarak tutulur; pencere dolunca kilit kendiliğinden açılır
  (kalıcı kilitlenme yok).

## Güvenlik notları

- `STRIPE_SECRET_KEY`, `OPENROUTER_KEY`, `SESSION_SECRET` **asla** istemciye dönülmez.
  `/api/config` yalnızca `googleAktif`/`odemeAktif` gibi bayraklar ve kullanıcının
  kendi adı/epostası/avatarı döner.
- Google ID token'ı (Google girişi açıksa) **sunucuda** JWKS/RS256 ile
  doğrulanır; `aud`, `iss`, `exp`, `email_verified` kontrol edilir. İstemciden
  gelen e-posta veya plana asla güvenilmez.
- Depo gecikmeli (eventually consistent) çalıştığı için **güvenlik sayaçları
  asla "oku → değiştir → yaz" ile tutulmaz**; her olay ayrı bir anahtar olarak
  eklenir. Yazma hataları sessizce yutulmaz, `console.error`'a düşer.
- Plan yetkisi **yalnızca** imzası doğrulanmış Stripe webhook'u ile yazılır.
- Çerez `HttpOnly` + `SameSite=Lax` + production'da `Secure`; imzası
  `timingSafeEqual` ile kontrol edilir.
- Webhook imzası ham gövde üzerinde doğrulanır, 5 dakika toleranslıdır.
