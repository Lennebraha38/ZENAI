// Google girişi: istemcinin gönderdiği ID token'ı Google JWKS ile doğrular,
// sonra imzalı oturum çerezi verir. İstemciden gelen e-posta/plan ASLA güvenilmez.
import { corsUygula, googleDogrula, sifrele, cerezAyarla, oturumSifresi, planGetir } from "../_lib/auth.js";
import { planOku } from "../_lib/store.js";

export default async function handler(req, res) {
  if (corsUygula(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "POST gerekli" });

  const sifre = oturumSifresi();
  if (!sifre) {
    return res.status(500).json({
      error: "Sunucu yapılandırması eksik: SESSION_SECRET tanımlı değil (en az 16 karakter).",
    });
  }
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return res.status(500).json({
      error: "Google girişi kapalı: Vercel -> Environment Variables -> GOOGLE_CLIENT_ID ekle.",
    });
  }

  const { idToken } = req.body || {};
  if (!idToken) return res.status(400).json({ error: "idToken gerekli" });

  try {
    const talep = await googleDogrula(idToken, clientId);
    if (!talep.email) return res.status(400).json({ error: "Google hesabında e-posta yok" });

    const jeton = sifrele(
      {
        sub: talep.sub,
        eposta: talep.email,
        ad: talep.name || talep.email.split("@")[0],
        avatar: talep.picture || null,
        plan: "free", // plan yalnızca ödeme webhook'u ile yükseltilir
        exp: Math.floor(Date.now() / 1000) + 30 * 86400,
      },
      sifre
    );
    cerezAyarla(res, "zenai_oturum", jeton, 30);
    // Gerçek plan çerezdekinden üstündür: depodan okunur. Yanıt da e-posta +
    // şifre girişiyle AYNI şekilde nesne döner. (Eskiden plan: "free" string'i
    // dönüyordu; istemci bunu SUNUCU.plan'a yazınca plan.kod undefined kalıyor
    // ve ödeme yapmış kullanıcı kendine Free görünüyordu.)
    const kod = await planOku(talep.sub, "free");
    const p = planGetir(kod);
    res.json({
      ok: true,
      kullanici: {
        eposta: talep.email,
        ad: talep.name,
        avatar: talep.picture || null,
        plan: { kod, ad: p.ad, maxToken: p.maxToken },
      },
    });
  } catch (e) {
    res.status(401).json({ error: "Google doğrulaması başarısız: " + String(e.message || e).slice(0, 160) });
  }
}
