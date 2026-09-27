// Oturumu sil (çerez temizle).
import { corsUygula, cerezAyarla } from "../_lib/auth.js";

export default function handler(req, res) {
  if (corsUygula(req, res)) return;
  cerezAyarla(res, "zenai_oturum", "", -1);
  res.json({ ok: true });
}
