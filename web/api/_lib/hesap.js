// Kullanıcı hesapları — Vercel Blob üzerinde e-posta + şifre girişi.
//
// Google OAuth'a bağımlı olmayan kimlik katmanı. Veriler aynı private Blob
// store'da tutulur (sunucusuz ortamda bellek kalıcı değildir).
//
// GÜVENLİK NOTLARI
// - Şifre asla düz saklanmaz: scrypt + rastgele 16 baytlık tuz.
// - Kullanıcı numarası (sub), e-postanın SHA-256 özetinden türetilir: e-posta
//   hiçbir dosya adında görünmez ama aynı e-posta hep aynı sub'u verir. Bu,
//   oturum jetonu ile depo anahtarı arasında deterministik bağ kurar.
// - Oturum jetonundaki plan ALDATICIDIR olabilir (30 günlük çerez). Gerçek plan
//   her istekte depodan okunur (bkz. store.js -> planOku).

import crypto from "node:crypto";
import { BLOB_OKUNUR, yolOku, yolYaz, yolEkle, yolListele } from "./blob.js";

export const hesapSistemiVar = () => BLOB_OKUNUR;
export const SIFRE_MIN = 8;
const KAYIT_SN = 8; // bu kadar hatalı denemeden sonra kısa süre kilitlenir
export const KILIT_PENCERE_MS = 15 * 60 * 1000;

export function subUret(email) {
  return crypto.createHash("sha256").update(epostaNormalize(email)).digest("hex").slice(0, 24);
}

export function epostaNormalize(email) {
  return String(email || "").trim().toLowerCase();
}

// scrypt parametreleri. N=16384 varsayılanın 16 katı: bir tane lambda'da
// kaba kuvvet denemesini pahalılaştırırken sunucusuz işlem süresini de
// makul tutar.
const SCRYPT = { N: 16384, r: 8, p: 1 };

// crypto.scrypt'in geri çağırma imzası (hata, turetilmis) — SIRA ÖNEMLİ.
// Ters yazılırsa türetilmiş anahtar (bir Buffer) hata sanılır ve reddedilir.
const scryptAsync = (sifre, tuz) =>
  new Promise((coz, reddet) => {
    crypto.scrypt(String(sifre), tuz, 64, SCRYPT, (hata, turetilmis) =>
      hata ? reddet(hata) : coz(turetilmis)
    );
  });

export async function sifreOku(sifre) {
  const tuz = crypto.randomBytes(16);
  // ASYNC: scryptSync ~60-100ms sürüyor ve node'un olay döngüsünü tamamen
  // bloke ediyor; aynı anda başka bir istek bekleyemiyor.
  const turetilmis = await scryptAsync(String(sifre), tuz);
  return { hash: turetilmis.toString("base64"), salt: tuz.toString("base64") };
}

export async function sifreDogrula(sifre, kayit) {
  if (!kayit?.hash || !kayit?.salt) return false;
  let turetilmis;
  try {
    turetilmis = await scryptAsync(String(sifre), Buffer.from(kayit.salt, "base64"));
  } catch {
    return false;
  }
  const beklenen = Buffer.from(kayit.hash, "base64");
  if (beklenen.length !== turetilmis.length) return false;
  return crypto.timingSafeEqual(beklenen, turetilmis);
}

const yol = (sub) => `user/${sub}.json`;

// Hatalı giriş denemelerinin tutulduğu ön ek (her deneme ayrı bir anahtar).
const basarisizYol = (sub) => `user/${sub}/basarisiz`;

// Son KILIT_PENCERE_MS içindeki hatalı deneme sayısı.
export async function basarisizSay(sub, simdi = Date.now()) {
  const kirp = simdi - KILIT_PENCERE_MS;
  const kayitlar = await yolListele(basarisizYol(sub) + "/");
  const icerde = kayitlar.filter((k) => k.zaman > kirp).map((k) => k.zaman);
  return {
    sayi: icerde.length,
    enYeni: icerde.length ? Math.max(...icerde) : 0,
  };
}

export async function kullaniciOkuByEmail(email) {
  return yolOku(yol(subUret(email)));
}

export async function kullaniciOkuBySub(sub) {
  return yolOku(yol(sub));
}

// Yeni hesap açar. Daha önce varsa kayıt EZİLMEZ.
export async function hesapAc({ email, sifre, ad }) {
  const eposta = epostaNormalize(email);
  const sub = subUret(eposta);
  if (await yolOku(yol(sub))) return { hata: "Bu e-posta zaten kayıtlı" };
  const { hash, salt } = await sifreOku(sifre);
  const kayit = {
    sub,
    eposta,
    ad: String(ad || "").trim().slice(0, 60) || eposta.split("@")[0],
    hash,
    salt,
    plan: "free",
    olusturma: new Date().toISOString(),
    sonGiris: new Date().toISOString(),
  };
  try {
    await yolYaz(yol(sub), kayit);
  } catch {
    return { hata: "Hesap kaydedilemedi, biraz sonra tekrar dene" };
  }
  return { kayit };
}

// Giriş denemesi. Hatalı denemeler SAYILIR; KAYIT_SN'a ulaşınca hesap
// KILIT_PENCERE_MS boyunca kilitlenir.
//
// SAYAC NEREDE TUTULUYOR?
// Kullanıcı kaydının içinde değil. Deneme sayısı, her hatalı giriş için AYRI bir
// anahtara yazılır (user/<sub>/basarisiz/<zaman>-<rastgele>) ve pencere içindekiler
// listelenerek sayılır. Sebep: depo gecikmeli çalışıyor, "oku → değiştir → yaz"
// döngüsünde yazmalar birbirini ezip sayaç geriye gidiyordu. Append-only sayaç
// yalnızca ileri gider, çakışma olamaz.
//
// KALICI KİLİT OLUR MU? Hayır: kayıtlar hiç silinmez ama pencere dışına düştüğü
// için sayılmaz. 15 dakika sonra hesap kendiliğinden yeniden açılır.
export async function girisDene({ email, sifre }, simdi = Date.now()) {
  const sub = subUret(email);
  const kayit = await yolOku(yol(sub));
  if (!kayit) {
    // Kullanıcı var mı yok mu bilgisini sızdırma.
    return { hata: "E-posta veya şifre hatalı", kod: 401 };
  }

  const hatalar = await basarisizSay(sub, simdi);
  if (hatalar.sayi >= KAYIT_SN) {
    const kalanDk = Math.max(1, Math.ceil((hatalar.enYeni + KILIT_PENCERE_MS - simdi) / 60000));
    return {
      hata: `Çok fazla hatalı deneme. ${kalanDk} dakika sonra tekrar dene.`,
      kod: 429,
    };
  }

  if (!(await sifreDogrula(sifre, kayit))) {
    try {
      await yolEkle(`${basarisizYol(sub)}/${simdi}`, { z: simdi });
    } catch (e) {
      // Sayaç yazılamadıysa kilit devreye giremez; sessizce geçmiyoruz ki
      // depo kesintisi fark edilsin. Yanıt yine 401: kullanıcı varlığını sızdırma.
      console.error("[hesap] hatalı deneme kaydedilemedi:", e?.message);
    }
    return { hata: "E-posta veya şifre hatalı", kod: 401 };
  }

  kayit.sonGiris = new Date(simdi).toISOString();
  try {
    await yolYaz(yol(sub), kayit);
  } catch (e) {
    console.error("[hesap] son giriş yazılamadı:", e?.message);
  }
  return { kayit };
}
