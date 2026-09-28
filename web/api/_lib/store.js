// Abonelik planı için kalıcı depo — Vercel Blob (private store) veya Upstash.
//
// Sunucusuz (serverless) ortamda bellek kalıcı değildir; ödeme webhook'u planı
// burada saklar, diğer uç noktalar buradan okur.
//
// GEREKSİNİM (Vercel ortam değişkeni):
//   BLOB_READ_WRITE_TOKEN -> `vercel blob create-store <ad> --access private --yes`
//                            komutu projeye bağlar ve otomatik ekler.
//
// UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN varsa geriye dönük uyum için
// desteklenir (tercih sırası Blob > Upstash). Hiçbiri yoksa depoVar=false döner,
// uygulama ücretsiz planda çalışmaya devam eder ve webhook bilinçli olarak 500
// döner ki Stripe yeniden denesin — sessizce kayıp yazmak, kullanıcıya ücretli
// olduğu halde bedava göstermekten çok daha kötüdür.

import { BLOB_OKUNUR, yolOku, yolYaz } from "./blob.js";

const UP_URL = process.env.UPSTASH_REDIS_REST_URL;
const UP_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const upstashVar = !BLOB_OKUNUR && !!(UP_URL && UP_TOKEN);

export const depoVar = BLOB_OKUNUR || upstashVar;
export const depoTuru = BLOB_OKUNUR ? "vercel-blob" : upstashVar ? "upstash" : "yok";

const yol = (sub) => `plan/${String(sub || "").replace(/[^A-Za-z0-9._-]/g, "_")}.json`;

// ── Upstash REST (geriye dönük uyum) ─────────────────────
async function upCmd(...parcalar) {
  const r = await fetch(`${UP_URL}/${parcalar.map(encodeURIComponent).join("/")}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${UP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(parcalar),
  });
  if (!r.ok) throw new Error("Depo hatası: " + r.status);
  return (await r.json())?.result ?? null;
}

// ── Genel arayüz ──────────────────────────────────────────
// Aboneliğin planını yaz. YALNIZCA imzası doğrulanmış webhook çağırır.
export async function planYaz(sub, plan) {
  if (!sub || !depoVar) return false;
  try {
    if (BLOB_OKUNUR) await yolYaz(yol(sub), { plan, at: new Date().toISOString() });
    else await upCmd("SET", yol(sub), plan, "EX", 60 * 60 * 24 * 400);
    return true;
  } catch {
    return false;
  }
}

// İptal / askıya alma -> planı "free" yaz.
//
// Kayıt SİLİNMEZ: Vercel Blob'da silinen bir yolun tekrar yazılması tombstone
// birikimi yüzünden "yazıldı ama okunmuyor" durumuna düşüyor (head var diyor,
// GET 404). Bu, "iptal et -> yeniden abone ol" akışını sessizce bozardı.
export async function planSifirla(sub) {
  return planYaz(sub, "free");
}

// Kullanıcının gerçek planını ok. Bulunamazsa çerezdeki plana düşer.
export async function planOku(sub, varsayilan) {
  if (!sub || !depoVar) return varsayilan;
  try {
    if (BLOB_OKUNUR) {
      const j = await yolOku(yol(sub));
      return typeof j?.plan === "string" && j.plan ? j.plan : varsayilan;
    }
    const v = await upCmd("GET", yol(sub));
    return typeof v === "string" && v ? v : varsayilan;
  } catch {
    return varsayilan;
  }
}
