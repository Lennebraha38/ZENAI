// Stripe webhook: ödemeyi doğrular ve planı kalıcı olarak günceller.
// Tek güvenilir plan yazma noktası budur.
import crypto from "node:crypto";
import { planYaz, planSil } from "../_lib/store.js";

// Stripe imza doğrulaması (HMAC-SHA256, header'daki timestamp ile).
function imzaDogrula(yazi, header, secret) {
  const parcalar = {};
  for (const p of header.split(",")) {
    const i = p.indexOf("=");
    if (i > -1) parcalar[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  }
  if (!parcalar.t || !parcalar.v1) return false;
  const zamanFarki = Math.abs(Date.now() / 1000 - Number(parcalar.t));
  if (!Number.isFinite(zamanFarki) || zamanFarki > 300) return false; // 5 dk tolerans

  const imzali = `${parcalar.t}.${yazi}`;
  const beklenen = crypto
    .createHmac("sha256", secret)
    .update(imzali, "utf8")
    .digest("hex");
  const alinan = Buffer.from(parcalar.v1, "hex");
  const hedef = Buffer.from(beklenen, "hex");
  if (alinan.length !== hedef.length) return false;
  return crypto.timingSafeEqual(alinan, hedef);
}

// Stripe plan kodu -> bizim plan kodumuz (fiyat kimliğinden geri çözer).
function planCoz(nesne) {
  const fiyat = nesne?.metadata?.plan;
  if (fiyat && ["silver", "gold", "platinum"].includes(fiyat)) return fiyat;
  const id = nesne?.items?.data?.[0]?.price?.id;
  const harita = {
    [process.env.STRIPE_PRICE_SILVER]: "silver",
    [process.env.STRIPE_PRICE_GOLD]: "gold",
    [process.env.STRIPE_PRICE_PLATINUM]: "platinum",
  };
  return id ? harita[id] || null : null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST gerekli" });

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return res.status(500).json({ error: "STRIPE_WEBHOOK_SECRET tanımlı değil" });

  // Ham gövde şart: imza doğrulaması parse edilmiş JSON üzerinde çalışmaz.
  const ham = (req.body && typeof req.body === "string") ? req.body : JSON.stringify(req.body ?? {});
  const header = req.headers["stripe-signature"];
  if (!header) return res.status(400).json({ error: "Stripe-Signature başlığı yok" });
  if (!imzaDogrula(ham, header, secret)) return res.status(400).json({ error: "İmza doğrulanamadı" });

  let olay;
  try { olay = JSON.parse(ham); } catch { return res.status(400).json({ error: "Geçersiz JSON" }); }

  const tip = olay.type;
  const nesne = olay.data?.object || {};

  try {
    if (tip === "checkout.session.completed") {
      const sub = nesne.metadata?.sub || nesne.client_reference_id;
      const plan = planCoz(nesne);
      if (sub && plan) {
        const yazildi = await planYaz(sub, plan);
        if (!yazildi) throw new Error("plan yazılamadı (depo yapılandırılmamış veya erişilemiyor)");
      }
    } else if (tip === "customer.subscription.updated") {
      const sub = nesne.metadata?.sub;
      if (!sub) return res.json({ alindi: true });
      if (["active", "trialing"].includes(nesne.status)) {
        const plan = planCoz(nesne) || "silver";
        const yazildi = await planYaz(sub, plan);
        if (!yazildi) throw new Error("plan yazılamadı");
      } else {
        await planSil(sub); // iptal/askıya alma -> ücretsiz
      }
    } else if (tip === "customer.subscription.deleted") {
      const sub = nesne.metadata?.sub;
      if (sub) await planSil(sub);
    }
  } catch (e) {
    // Stripe 2xx bekler; depoya yazılamadıysa yeniden denesin diyle 500 dön.
    return res.status(500).json({ error: "Plan güncellenemedi: " + String(e.message || e).slice(0, 120) });
  }

  res.json({ alindi: true });
}
