// ── Paylaşılan sunucu yardımcıları: imzalı oturum + Google JWKS doğrulama ──
// Bağımlılık yok: Node'un yerleşik WebCrypto'su ile HMAC-SHA256 ve RS256.
// _ ile başlayan dosyalar Vercel'de route olarak sayılmaz.

import crypto from "node:crypto";

const b64u = {
  enc: (buf) => Buffer.from(buf).toString("base64url"),
  dec: (str) => Buffer.from(str, "base64url"),
};

function b64uJson(obje) {
  return Buffer.from(JSON.stringify(obje), "utf8").toString("base64url");
}

function guvenliEsit(a, b) {
  const ab = Buffer.from(String(a || ""), "utf8");
  const bb = Buffer.from(String(b || ""), "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// ── HMAC ile imzalı oturum jetonu (durumsuz; serverless için uygun) ──
export function sifrele(payload, sifre) {
  // Süresiz jeton üretilmesini imkânsız kıl: exp verilmemişse 30 gün uygulanır.
  const simdi = Math.floor(Date.now() / 1000);
  const govde = b64uJson({
    ...payload,
    iat: simdi,
    exp: Number(payload?.exp) || simdi + 30 * 86400,
  });
  return `${govde}.${imzala(govde, sifre)}`;
}

export function dogrula(jeton, sifre) {
  if (typeof jeton !== "string" || !jeton.includes(".")) return null;
  const [govde, imza] = jeton.split(".");
  if (!govde || !imza || !guvenliEsit(imza, imzala(govde, sifre))) return null;
  try {
    const veri = JSON.parse(b64u.dec(govde).toString("utf8"));
    if (!veri.exp || veri.exp < Math.floor(Date.now() / 1000)) return null;
    return veri;
  } catch {
    return null;
  }
}

function imzala(govde, sifre) {
  return crypto.createHmac("sha256", sifre).update(govde).digest("base64url");
}

export function oturumSifresi() {
  // Bilerek başka bir değişkene düşmez: API anahtarları oturum imza anahtarı
  // olarak kullanılmaz (anahtar döndürülünce tüm oturumlar düşerdi).
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) return null; // zayıf/eksik secret ile oturum üretme
  return s;
}

// ── Google JWKS (RS256) doğrulama ──
const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERLER = ["accounts.google.com", "https://accounts.google.com"];
let jwksOnbellek = null, jwksZamani = 0;

async function jwksGetir(zorlaYenile = false) {
  const simdi = Date.now();
  if (!zorlaYenile && jwksOnbellek && simdi - jwksZamani < 3600_000) return jwksOnbellek;
  const r = await fetch(JWKS_URL);
  if (!r.ok) throw new Error("JWKS alınamadı: " + r.status);
  jwksOnbellek = await r.json();
  jwksZamani = simdi;
  return jwksOnbellek;
}

export async function googleDogrula(idToken, clientId) {
  if (!idToken || !clientId) throw new Error("Google doğrulaması için kimlik veya client id eksik");
  const parcalar = idToken.split(".");
  if (parcalar.length !== 3) throw new Error("Geçersiz Google kimlik jetonu biçimi");
  const [h, p, s] = parcalar;

  const baslik = JSON.parse(b64u.dec(h).toString("utf8"));
  if (baslik.alg !== "RS256") throw new Error("Beklenmeyen imza algoritması: " + baslik.alg);

  const { keys } = await jwksGetir();
  const anahtar = keys.find((k) => k.kid === baslik.kid);
  if (!anahtar) {
    await jwksGetir(true);
    throw new Error("Google imza anahtarı bulunamadı (JWKS yenilendi, tekrar dene)");
  }

  const anahtarObj = await crypto.subtle.importKey(
    "jwk",
    { kty: anahtar.kty, n: anahtar.n, e: anahtar.e, alg: "RS256" },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const imzaDogru = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    anahtarObj,
    b64u.dec(s),
    Buffer.from(`${h}.${p}`, "utf8")
  );
  if (!imzaDogru) throw new Error("Google jeton imzası geçersiz");

  const talep = JSON.parse(b64u.dec(p).toString("utf8"));
  const simdi = Math.floor(Date.now() / 1000);
  if (talep.iss && !ISSLER_KONTROL(talep.iss)) throw new Error("Beklenmeyen issuer: " + talep.iss);
  if (talep.aud !== clientId) throw new Error("Client id eşleşmiyor");
  if (!talep.exp || talep.exp < simdi) throw new Error("Jeton süresi dolmuş");
  if (talep.iat && talep.iat > simdi + 60) throw new Error("Jeton gelecek tarihli");
  if (talep.email_verified !== true && talep.email_verified !== undefined) {
    throw new Error("E-posta doğrulanmamış");
  }
  return talep;
}
function ISSLER_KONTROL(iss) {
  return ISSUERLER.includes(iss);
}

// ── Çerez yardımcıları ──
export function cerezAyarla(res, ad, deger, gun) {
  const parcalar = [
    `${ad}=${deger}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(gun * 86400)}`,
  ];
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) parcalar.push("Secure");
  res.appendHeader("Set-Cookie", parcalar.join("; "));
}

export function cerezOku(req, ad) {
  const bas = req.headers.cookie;
  if (!bas) return null;
  for (const parca of bas.split(";")) {
    const i = parca.indexOf("=");
    if (i > -1 && parca.slice(0, i).trim() === ad) return parca.slice(i + 1).trim();
  }
  return null;
}

export function oturumOku(req) {
  const s = oturumSifresi();
  if (!s) return null;
  return dogrula(cerezOku(req, "zenai_oturum"), s);
}

// ── Planlar: tek doğruluk kaynağı ──
export const PLANLAR = {
  free:     { ad: "Free",     rank: 0, gunluk: 30,   maxToken: 8192,  ozellik: ["web-arama"] },
  silver:   { ad: "Silver",   rank: 1, gunluk: 200,  maxToken: 16384, ozellik: ["web-arama", "gorsel"] },
  gold:     { ad: "Gold",     rank: 2, gunluk: 1000, maxToken: 32768, ozellik: ["web-arama", "gorsel", "oncelikli"] },
  platinum: { ad: "Platinum", rank: 3, gunluk: 5000, maxToken: 65536, ozellik: ["web-arama", "gorsel", "oncelikli", "meclis"] },
};

export function planGetir(ad) {
  return PLANLAR[ad] || PLANLAR.free;
}

// ── CORS (chat.js ile aynı allowlist mantığı) ──
export function corsUygula(req, res) {
  const izin = (process.env.ZENAI_ORIGIN || "https://zenai-two.vercel.app")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.origin;
  if (origin && izin.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-zenai-token");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") { res.status(204).end(); return true; }
  if (origin && !izin.includes(origin)) { res.status(403).json({ error: "Kaynak engellendi" }); return true; }
  return false;
}
