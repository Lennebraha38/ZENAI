// Kayıt: e-posta + şifre ile yeni hesap açar ve oturum çerezi verir.
// Şifre düz saklanmaz (scrypt). Daha önce alınmış bir e-posta ezilmez.
import { corsUygula, sifrele, cerezAyarla, oturumSifresi, planGetir } from "../_lib/auth.js";
import {
  hesapAc, hesapSistemiVar, SIFRE_MIN, epostaNormalize,
  kayitSiniri, kayitDenemeIsle,
} from "../_lib/hesap.js";

const EPOSTA_DESEN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const ipAl = (req) =>
  String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "?";

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

  const { email, sifre: parola, ad } = req.body || {};
  const eposta = epostaNormalize(email);

  if (!EPOSTA_DESEN.test(eposta) || eposta.length > 190) {
    return res.status(400).json({ error: "Geçerli bir e-posta gir" });
  }
  if (typeof parola !== "string" || parola.length < SIFRE_MIN || parola.length > 200) {
    return res.status(400).json({ error: `Şifre en az ${SIFRE_MIN} karakter olmalı` });
  }
  // Yaygın, tahmin edilebilir şifreleri reddet.
  if (/^(12345678|password|qwertyui|11111111|iloveyou|admin123|parola123)$/i.test(parola)) {
    return res.status(400).json({ error: "Bu şifre çok tahmin edilebilir, başka bir tane seç" });
  }

  // Kaba kuvvet / spam koruması. Girişta var, kayıtta yoktu: script ile
  // sınırsız hesap açılabiliyordu (depoda sınırsız büyüme) ve 409 yanıtları
  // hangi e-postaların kayıtlı olduğunu saymaya yarıyordu.
  const ip = ipAl(req);
  const sinir = await kayitSiniri(eposta, ip);
  if (sinir) {
    await kayitDenemeIsle(eposta, ip);
    return res.status(sinir.kod).json({ error: sinir.hata });
  }

  const sonuc = await hesapAc({ email: eposta, sifre: parola, ad });
  await kayitDenemeIsle(eposta, ip);
  if (sonuc.hata) return res.status(409).json({ error: sonuc.hata });

  const k = sonuc.kayit;
  const jeton = sifrele(
    { sub: k.sub, eposta: k.eposta, ad: k.ad, avatar: null, plan: "free" },
    sifre
  );
  cerezAyarla(res, "zenai_oturum", jeton, 30);
  const p = planGetir("free");
  res.json({ ok: true, kullanici: { eposta: k.eposta, ad: k.ad, avatar: null, plan: { kod: "free", ad: p.ad, maxToken: p.maxToken } } });
}
