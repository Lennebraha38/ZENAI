// Sağlık kontrolü: sağlayıcıyı çağırmadan, yapılandırmanın yerinde olup
// olmadığını bildirir. (Eski istemci kontrolü /api/chat'e sahte istek atıyor,
// bu da 500 dönüyor ve gerçek bir API çağrısı israf ediyordu.)
import { corsUygula, oturumSifresi } from "./_lib/auth.js";
import { depoVar } from "./_lib/store.js";

export default function handler(req, res) {
  if (corsUygula(req, res)) return;
  const keyVar = !!process.env.OPENROUTER_KEY;
  res.json({
    ok: keyVar,
    surum: 2,
    model: keyVar,
    google: !!process.env.GOOGLE_CLIENT_ID,
    session: !!oturumSifresi(),
    hesap: depoVar,
    odeme: !!process.env.STRIPE_SECRET_KEY,
    depo: depoVar,
  });
}
