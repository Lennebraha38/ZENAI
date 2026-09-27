// Abonelik planı için kalıcı depo — Vercel Blob (private store) veya Upstash.
//
// Neden Vercel Blob: kullanıcının Vercel hesabı zaten var, ayrıca Upstash/veritabanı
// hesabı açmaya gerek kalmıyor. Sunucusuz (serverless) ortamda bellek kalıcı değildir;
// ödeme webhook'u planı burada saklar, diğer uç noktalar buradan okur.
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

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const UP_URL = process.env.UPSTASH_REDIS_REST_URL;
const UP_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const blobVar = !!BLOB_TOKEN;
const upstashVar = !blobVar && !!(UP_URL && UP_TOKEN);

export const depoVar = blobVar || upstashVar;
export const depoTuru = blobVar ? "vercel-blob" : upstashVar ? "upstash" : "yok";

const ONEKI = "zenai/plan/";
const anahtar = (sub) => ONEKI + String(sub || "").replace(/[^A-Za-z0-9._-]/g, "_") + ".json";

const OZ = { token: BLOB_TOKEN, access: "private" };

// ── Vercel Blob ──────────────────────────────────────────
let sdk = null;
async function blobSdk() {
  if (!sdk) {
    const m = await import("@vercel/blob");
    sdk = { put: m.put, head: m.head };
  }
  return sdk;
}

async function blobYaz(sub, plan) {
  const { put } = await blobSdk();
  await put(anahtar(sub), JSON.stringify({ plan, at: new Date().toISOString() }), {
    ...OZ,
    addRandomSuffix: 0,
    allowOverwrite: true,
  });
  return true;
}

// Private store'da SDK'nin get()'i stream döndürmez (stream: null) — yetkili
// indirme adresini head() ile alıp Bearer token ile fetch etmek gerekir.
async function blobOku(sub) {
  const { head } = await blobSdk();
  let url;
  try {
    const h = await head(anahtar(sub), { token: BLOB_TOKEN });
    if (!h) return null;
    url = h.downloadUrl || h.url;
  } catch {
    return null; // kayıt yok -> çağıran varsayılana düşer
  }
  if (!url) return null;
  // ÖNEMLİ: private blob GET'i önbelleğe alınıyor. Kullanıcı ödeme yapıp sayfayı
  // yenilediğinde planı ESKİ görmemeli, yoksa "ödedim ama ücretsiz görünüyorum"
  // durumu oluşur. Bu yüzden her okumada önbellek kırıcı eklenir (veri birkaç
  // yüz bayt, maliyeti ihmal edilebilir).
  const ayirici = url.includes("?") ? "&" : "?";
  const r = await fetch(url + ayirici + "_t=" + Date.now(), {
    headers: { Authorization: `Bearer ${BLOB_TOKEN}`, "Cache-Control": "no-cache" },
  });
  if (!r.ok) return null;
  try {
    const j = JSON.parse(await r.text());
    return j?.plan || null;
  } catch {
    return null;
  }
}


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
    if (blobVar) return await blobYaz(sub, plan);
    await upCmd("SET", anahtar(sub), plan, "EX", 60 * 60 * 24 * 400);
    return true;
  } catch {
    return false;
  }
}

// İptal / askıya alma -> planı "free" yaz.
//
// NORMALDE SİLME YAPMIYORUZ: Vercel Blob'da silinen bir yolun tekrar yazılması
// tombstone birikimi yüzünden "yazıldı ama okunmuyor" durumuna düşüyor (head var
// diyor, GET 404). Bu, "iptal et -> yeniden abone ol" akışını sessizce bozardı.
// Bu yüzden kayıt her zaman var olur, yalnızca değeri değişir.
export async function planSifirla(sub) {
  return planYaz(sub, "free");
}

// Kullanıcının gerçek planını ok. Bulunamazsa çerezdeki plana düşer.
export async function planOku(sub, varsayilan) {
  if (!sub || !depoVar) return varsayilan;
  try {
    if (blobVar) {
      const v = await blobOku(sub);
      return typeof v === "string" && v ? v : varsayilan;
    }
    const v = await upCmd("GET", anahtar(sub));
    return typeof v === "string" && v ? v : varsayilan;
  } catch {
    return varsayilan;
  }
}
