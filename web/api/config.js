// İstemciye açık yapılandırma. Gizli anahtar ASLA dönülmez.
import { corsUygula, PLANLAR, oturumOku, planGetir } from "./_lib/auth.js";
import { planOku, depoVar } from "./_lib/store.js";

export default async function handler(req, res) {
  if (corsUygula(req, res)) return;
  const oturum = oturumOku(req);
  // Gerçek plan çerezdekinden üstündür (yalnızca webhook yazar).
  const kod = await planOku(oturum?.sub, oturum?.plan || "free");
  const plan = planGetir(kod);
  res.json({
    // Google opsiyonel: hesap sistemi kendi başına çalışır.
    hesapAktif: depoVar,
    googleClientId: process.env.GOOGLE_CLIENT_ID || "",
    googleAktif: !!process.env.GOOGLE_CLIENT_ID,
    odemeAktif: !!process.env.STRIPE_SECRET_KEY,
    depoVar,
    girisYapildi: !!oturum,
    // kullanici.plan, üst düzey "plan" ile AYNI şekilde nesnedir. Daha önce
    // yalnızca adı (string) dönüyordu; istemci bunu SUNUCU.plan'a yazınca
    // plan.kod undefined kalıyor ve ücretli kullanıcı kendine Free görünüyordu.
    kullanici: oturum
      ? { eposta: oturum.eposta, ad: oturum.ad, avatar: oturum.avatar,
          plan: { kod, ad: plan.ad, maxToken: plan.maxToken } }
      : null,
    plan: { kod, ad: plan.ad, maxToken: plan.maxToken },
    planlar: Object.entries(PLANLAR).map(([k, p]) => ({
      kod: k, ad: p.ad, maxToken: p.maxToken, ozellik: p.ozellik,
    })),
  });
}
