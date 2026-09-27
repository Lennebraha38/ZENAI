// Stripe Checkout oturumu başlatır. Plan yetkisi YALNIZCA webhook'tan gelir;
// buradaki plan bilgisi sadece fiyat seçimi içindir.
import { corsUygula, oturumOku, oturumSifresi, planGetir } from "../_lib/auth.js";
import { planOku } from "../_lib/store.js";

// Stripe fiyat kimlikleri ortam değişkeninden okunur (kod içinde secret yok).
const FIYAT_ENV = {
  silver: "STRIPE_PRICE_SILVER",
  gold: "STRIPE_PRICE_GOLD",
  platinum: "STRIPE_PRICE_PLATINUM",
};

export default async function handler(req, res) {
  if (corsUygula(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "POST gerekli" });

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return res.status(500).json({
      error: "Ödeme kapalı: Vercel -> Environment Variables -> STRIPE_SECRET_KEY ekle.",
    });
  }
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(500).json({ error: "Ödeme kapalı: STRIPE_WEBHOOK_SECRET eksik." });
  }

  // Ücretli plan için oturum zorunlu — sahipsiz abonelik oluşmasın.
  const oturum = oturumOku(req);
  if (!oturum) {
    return res.status(401).json({ error: "Abonelik için önce Google ile giriş yap." });
  }
  const sifre = oturumSifresi();
  if (!sifre) return res.status(500).json({ error: "Sunucu yapılandırması eksik" });

  const { plan } = req.body || {};
  const envAd = FIYAT_ENV[plan];
  if (!envAd) return res.status(400).json({ error: "Geçersiz plan" });

  // Gerçek plan depodan okunur (çerezdeki plan satın alım sonrası bayatlar).
  const mevcutKod = await planOku(oturum.sub, oturum.plan || "free");
  const mevcut = planGetir(mevcutKod);
  if (mevcut.rank >= planGetir(plan).rank && mevcut.rank > 0) {
    return res.status(400).json({ error: "Zaten bu plandasın veya daha yüksek bir plandasın." });
  }

  const fiyatId = process.env[envAd];
  if (!fiyatId) {
    return res.status(500).json({ error: `${envAd} tanımlı değil; bu plan satın alınamıyor.` });
  }

  const site = process.env.ZENAI_ORIGIN?.split(",")[0]?.trim() || "https://zenai-two.vercel.app";
  try {
    const govde = new URLSearchParams({
      mode: "subscription",
      "line_items[0][price]": fiyatId,
      "line_items[0][quantity]": "1",
      success_url: `${site}/?odeme=basarili`,
      cancel_url: `${site}/?odeme=iptal`,
      client_reference_id: oturum.sub,
      customer_email: oturum.eposta,
      "subscription_data[metadata][sub]": oturum.sub,
      "subscription_data[metadata][plan]": plan,
      "metadata[sub]": oturum.sub,
      "metadata[plan]": plan,
    });

    const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + secret,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: govde.toString(),
    });
    const veri = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: veri?.error?.message || "Ödeme başlatılamadı" });
    res.json({ url: veri.url, id: veri.id });
  } catch (e) {
    res.status(500).json({ error: "Ödeme sağlayıcısına ulaşılamadı: " + String(e.message || e).slice(0, 120) });
  }
}
