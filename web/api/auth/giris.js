// Giriş: e-posta + şifre doğrular, oturum çerezi verir.
// Kullanıcı var mı yok mu bilgisi sızdırılmaz; hatalı denemeler sayılır.
import { corsUygula, sifrele, cerezAyarla, oturumSifresi, planGetir } from "../_lib/auth.js";
import { girisDene, hesapSistemiVar, epostaNormalize } from "../_lib/hesap.js";
import { planOku } from "../_lib/store.js";

const EPOSTA_DESEN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default async function handler(req, res) {
  if (corsUygula(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "POST gerekli" });

  const sifre = oturumSifresi();
  if (!sifre) {
    return res.status(500).json({ error: "Sunucu yapılandırması eksik: SESSION_SECRET tanımlı değil." });
  }
  if (!hesapSistemiVar()) {
    return res.status(500).json({
      error: "Hesap sistemi kapalı: Vercel -> Environment Variables -> BLOB_READ_WRITE_TOKEN ekle.",
    });
  }

  const { email, sifre: parola } = req.body || {};
  const eposta = epostaNormalize(email);
  if (!EPOSTA_DESEN.test(eposta) || typeof parola !== "string" || parola.length < 1 || parola.length > 200) {
    return res.status(400).json({ error: "E-posta ve şifre gerekli" });
  }

  const sonuc = await girisDene({ email: eposta, sifre: parola });
  if (sonuc.hata) return res.status(sonuc.kod || 401).json({ error: sonuc.hata });

  const k = sonuc.kayit;
  // Gerçek plan çerezden değil depodan okunur.
  const gercekPlan = await planOku(k.sub, "free");
  const plan = planGetir(gercekPlan).kod;

  const jeton = sifrele({ sub: k.sub, eposta: k.eposta, ad: k.ad, avatar: null, plan }, sifre);
  cerezAyarla(res, "zenai_oturum", jeton, 30);
  res.json({ ok: true, kullanici: { eposta: k.eposta, ad: k.ad, avatar: null, plan: { kod: plan, ad: planGetir(plan).ad, maxToken: planGetir(plan).maxToken } } });
}
