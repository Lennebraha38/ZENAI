# ZenAI — Gerçek Kimlik Doğrulama ve Abonelik Kurulumu

Kod tamam ve test edildi (62/62 birim testi). Aşağıdaki ortam değişkenleri
Vercel'de tanımlanmadan Google girişi ve ödeme **bilinçli olarak kapalı** kalır
ve arayüz bunu dürüstçe bildirir.

## 1. Vercel'e eklenmesi gereken değişkenler

Vercel → Proje (`zenai`) → Settings → Environment Variables

| Değişken | Zorunlu | Nerede bulunur | Örnek |
|---|---|---|---|
| `SESSION_SECRET` | evet | Kendin üret | `openssl rand -base64 48` |
| `GOOGLE_CLIENT_ID` | evet | Google Cloud Console → OAuth 2.0 Client ID | `1234...apps.googleusercontent.com` |
| `STRIPE_SECRET_KEY` | evet | Stripe Dashboard → API keys → Secret key | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | evet | Stripe → Webhooks → endpoint → Signing secret | `whsec_...` |
| `STRIPE_PRICE_SILVER` | evet | Stripe → Products → Prices → ID | `price_...` |
| `STRIPE_PRICE_GOLD` | evet | aynı | `price_...` |
| `STRIPE_PRICE_PLATINUM` | evet | aynı | `price_...` |
| `BLOB_READ_WRITE_TOKEN` | evet | `vercel blob create-store` (aşağıda) | `vercel_blob_rw_...` |
| `ZENAI_ORIGIN` | evet | sitenin adresi (virgülle çoklu) | `https://zenai-two.vercel.app` |
| `OPENROUTER_KEY` | evet | OpenRouter → API keys | `sk-or-...` |

> **`BLOB_READ_WRITE_TOKEN` neden gerekli?** Sunucusuz (serverless) ortamda
> kalıcı bellek yoktur; webhook planı bir yere yazmak zorundadır. Proje
> **Vercel Blob** (private store) kullanır — ayrıca bir veritabanı hesabı
> açmaya gerek yoktur, Vercel hesabı yeterlidir. Depo kurulu değilse webhook
> 500 döner; bu **bilinçlidir** (Stripe olayı yeniden denesin diye). Sessizce
> kayıp yazılsaydı kullanıcı ödeme yapmış ama ücretsiz kalırdı.
>
> Depo kuruluysa `/api/config` çıktısında `depoVar: true` görünür.
> `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` tanımlıysa geriye
> dönük uyum için Upstash de kullanılır (tercih sırası: Blob > Upstash).

## 2. Google Cloud Console

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
vercel blob create-store zenai-plan --access private --yes
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
  "googleAktif": true,
  "odemeAktif": true,
  "depoVar": true,
  "girisYapildi": false,
  "plan": { "kod": "free", "ad": "Free", "maxToken": 8192 }
}
```

`depoVar: false` ise abonelik satın alınamaz — webhook planı kaydedemez.

## Güvenlik notları

- `STRIPE_SECRET_KEY`, `OPENROUTER_KEY`, `SESSION_SECRET` **asla** istemciye dönülmez.
  `/api/config` yalnızca `googleAktif`/`odemeAktif` gibi bayraklar ve kullanıcının
  kendi adı/epostası/avatarı döner.
- Google ID token'ı **sunucuda** JWKS/RS256 ile doğrulanır; `aud`, `iss`, `exp`,
  `email_verified` kontrol edilir. İstemciden gelen e-posta veya plana asla
  güvenilmez.
- Plan yetkisi **yalnızca** imzası doğrulanmış Stripe webhook'u ile yazılır.
- Çerez `HttpOnly` + `SameSite=Lax` + production'da `Secure`; imzası
  `timingSafeEqual` ile kontrol edilir.
- Webhook imzası ham gövde üzerinde doğrulanır, 5 dakika toleranslıdır.
