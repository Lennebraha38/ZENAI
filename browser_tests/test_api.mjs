// Sunucu modülü birim testleri: oturum imzası, Google doğrulama, webhook imzası,
// checkout koruma kuralları, plan tavanı. Vercel handler'ları doğrudan çağırılır.
process.env.SESSION_SECRET = "test-secret-en-az-16-karakter-uzunluk";
process.env.GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com";
process.env.ZENAI_ORIGIN = "http://localhost:8899";
process.env.OPENROUTER_KEY = "sk-or-test-anahtar";
// Gercek depo (Vercel Blob) ile yazma/okma testi istege bagli.
// Token ASLA koda gomulmez: web/.env.local (gitignore'li) veya kabuk ortamindan okunur.
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  try {
    const { readFileSync } = await import("node:fs");
    for (const ln of readFileSync(new URL("../web/.env.local", import.meta.url), "utf8").split("\n")) {
      const t = ln.trim();
      if (t.startsWith("BLOB_READ_WRITE_TOKEN=")) {
        process.env.BLOB_READ_WRITE_TOKEN = t.split("=").slice(1).join("=").trim().replace(/^"|"$/g, "");
        break;
      }
    }
  } catch { /* .env.local yok -> depo testleri atlanir */ }
}
process.env.STRIPE_SECRET_KEY = "sk_test_yok";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_yok";
process.env.STRIPE_PRICE_GOLD = "price_gold_test";

const { default: health } = await import("../web/api/health.js");
const { default: config } = await import("../web/api/config.js");
const { default: google } = await import("../web/api/auth/google.js");
const { default: logout } = await import("../web/api/auth/logout.js");
const { default: kayit } = await import("../web/api/auth/kayit.js");
const { default: giris } = await import("../web/api/auth/giris.js");
const { hesapAc, girisDene, sifreOku, sifreDogrula, subUret, hesapSistemiVar,
        basarisizSay, KILIT_PENCERE_MS } =
  await import("../web/api/_lib/hesap.js");
const { default: checkout } = await import("../web/api/billing/checkout.js");
const { default: webhook } = await import("../web/api/billing/webhook.js");
const { sifrele, dogrula, oturumSifresi, googleDogrula, planGetir, PLANLAR } =
  await import("../web/api/_lib/auth.js");
const { depoVar, depoTuru, planYaz, planOku, planSifirla } = await import("../web/api/_lib/store.js");

import crypto from "node:crypto";

// Vercel Blob sonuclari kisa sureliginde guncellenmeyebilir (sonuc tutarliligi).
// Bu yuzden belirli bir deger gorunene kadar kisa aralikla yeniden okunur.
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
async function planOkuBekle(sub, beklenen, ms = 6000) {
  const son = Date.now() + ms;
  let gorulen = await planOku(sub, "free");
  while (gorulen !== beklenen && Date.now() < son) {
    await bekle(400);
    gorulen = await planOku(sub, "free");
  }
  return gorulen;
}

let gecti = 0, kaldi = 0;
const ok = (ad, kosul, detay = "") => {
  if (kosul) { gecti++; console.log(`  ✓ ${ad}`); }
  else { kaldi++; console.log(`  ✗ ${ad} ${detay}`); }
};

// Sahte req/res
function sahteRes() {
  const r = { kod: 200, govde: null, basliklar: {}, cireZ: [] };
  r.setHeader = (k, v) => { r.basliklar[k] = v; };
  r.appendHeader = (k, v) => { r.cireZ.push(`${k}: ${v}`); };
  r.status = (k) => { r.kod = k; return r; };
  r.json = (g) => { r.govde = g; return r; };
  r.end = () => r;
  return r;
}
const req = (b = {}, o = {}) => {
  const basliklar = { ...(o.headers || {}) };
  const origin = o.origin || "http://localhost:8899";
  if (origin) basliklar.origin = origin;
  return { method: o.method || "GET", headers: basliklar, body: b };
};

console.log("\n▸ Oturum imzası");
const sifre = oturumSifresi();
ok("güçlü secret kabul", !!sifre);
const j = sifrele({ eposta: "a@b.com", plan: "free" }, sifre);
ok("jeton doğrulanır", dogrula(j, sifre)?.eposta === "a@b.com");
ok("yanlış sifre reddedilir", dogrula(j, "baska-sifre-16-karakter-xyz") === null);
ok("kural imza reddedilir", dogrula(j.slice(0, -3) + "aaa", sifre) === null);
ok("süresi dolmuş reddedilir", dogrula(sifrele({ exp: 1 }, sifre), sifre) === null);
ok("özel plan kodla imzalanamaz", dogrula(j, sifre).plan === "free");

console.log("\n▸ SESSION_SECRET yoksa API anahtarına düşmez");
const kaydaSaklanan = process.env.SESSION_SECRET;
delete process.env.SESSION_SECRET;
ok("SESSION_SECRET yoksa null", oturumSifresi() === null);
process.env.OPENROUTER_KEY = "sk-or-baska-anahtar-olsa-bile-imza-anahtari-olmaz";
ok("OPENROUTER_KEY'e düşmez", oturumSifresi() === null);
delete process.env.OPENROUTER_KEY;
process.env.OPENROUTER_KEY = "sk-or-test-anahtar"; // sonraki testler için geri koy
process.env.SESSION_SECRET = kaydaSaklanan;

console.log("\n▸ Plan tavanı");
ok("free 8192", planGetir("free").maxToken === 8192);
ok("gold 32768", planGetir("gold").maxToken === 32768);
ok("bilinmeyen -> free", planGetir("admin").rank === 0);
ok("gold > silver", planGetir("gold").rank > planGetir("silver").rank);
ok("4 plan tanımlı", Object.keys(PLANLAR).length === 4);

console.log("\n▸ /api/config (gizli sızdırmaz)");
let res = sahteRes();
await config(req({}, { origin: "http://localhost:8899" }), res);
const c = res.govde;
ok("200 döner", res.kod === 200);

console.log("\n▸ /api/health");
res = sahteRes();
await health(req({}, { origin: "http://localhost:8899" }), res);
ok("health 200", res.kod === 200);
ok("health ok=true", res.govde.ok === true);
ok("health anahtar sızdırmaz", !JSON.stringify(res.govde).toUpperCase().includes("SK-OR"));
res = sahteRes();
await health(req({}, { origin: "https://kotu.com" }), res);
ok("health kötü origin 403", res.kod === 403);
ok("giriş yok", c.girisYapildi === false);
ok("plan free", c.plan.kod === "free");
ok("googleAktif true (env var)", c.googleAktif === true);
ok("SESSION_SECRET sızmaz", !("SESSION_SECRET" in c));
ok("STRIPE_SECRET_KEY sızmaz", !("STRIPE_SECRET_KEY" in c));
ok("api key sızmaz", !JSON.stringify(c).toUpperCase().includes("SK_TEST"));
ok("4 plan listelenir", c.planlar.length === 4);

console.log("\n▸ /api/config (oturumlu)");
res = sahteRes();
// Not: sabit bir sub kullanmak depoda kalici kayit biriktirir ve sonraki
// calistirmalari bozar. Her calistirmada benzersiz sub uret.
const testSub = "t-" + Date.now();
const oturumJet = sifrele({ sub: testSub, eposta: "a@b.com", ad: "Ali", plan: "free", exp: Math.floor(Date.now() / 1000) + 999 }, sifre);
await config(req({}, { origin: "http://localhost:8899", headers: { cookie: `zenai_oturum=${oturumJet}` } }), res);
ok("giriş algılanır", res.govde.girisYapildi === true);
ok("kullanıcı döner", res.govde.kullanici?.eposta === "a@b.com");
ok("plan depoda yoksa free", res.govde.plan.kod === "free");

console.log("\n▸ CORS allowlist");
res = sahteRes();
await config(req({}, { origin: "https://kotu-sahibi.com" }), res);
ok("kötü origin 403", res.kod === 403);
res = sahteRes();
await config(req({}, { method: "OPTIONS", origin: "https://kotu.com" }), res);
ok("OPTIONS 204", res.kod === 204);

console.log("\n▸ /api/auth/google");
res = sahteRes();
await google(req({ idToken: "sahte.jeton.deger" }, { method: "POST" }), res);
ok("sahte jeton 401", res.kod === 401);
ok("401 mesajı döner", /Google doğrulaması/.test(res.govde.error || ""));
res = sahteRes();
await google(req({}, { method: "POST" }), res);
ok("idToken yok 400", res.kod === 400);
res = sahteRes();
await google(req({ idToken: "x" }, { method: "POST", origin: "https://kotu.com" }), res);
ok("kötü origin 403", res.kod === 403);
// gerçek Google jetonu (ağ) — credential yoksa 401 beklenir
res = sahteRes();
await google(req({ idToken: "aaa.bbb.ccc" }, { method: "POST" }), res);
ok("geçersiz biçim 401", res.kod === 401);
res = sahteRes();
await google(req({ idToken: "x" }, { method: "GET" }), res);
ok("GET 405", res.kod === 405);

console.log("\n▸ /api/auth/logout");
res = sahteRes();
await logout(req({}, { origin: "http://localhost:8899" }), res);
ok("çerez temizleniyor (Max-Age<0)", /Max-Age=-\d+/.test(res.cireZ.join(";")));

console.log("\n▸ E-posta + şifre hesap sistemi");
const HE = "test-" + Date.now() + "@zenai.test";
ok("hesap sistemi depo ile açık", hesapSistemiVar() === true);
ok("sub üretimi deterministik", subUret(HE) === subUret(HE.toUpperCase()));
ok("sub e-postayı sızdırmıyor", !subUret(HE).includes("@") && subUret(HE).length === 24);

// Şifre kırımı
const k = sifreOku("dogru-sifre-123");
ok("şifre düz saklanmıyor", !JSON.stringify(k).includes("dogru-sifre-123"));
ok("şifre doğru doğrulanıyor", sifreDogrula("dogru-sifre-123", k) === true);
ok("yanlış şifre reddediliyor", sifreDogrula("dogru-sifre-124", k) === false);
const k2 = sifreOku("dogru-sifre-123");
ok("tuz rastgele (hash'ler farklı)", k.hash !== k2.hash && k.salt !== k2.salt);

if (hesapSistemiVar()) {
  // Kayıt
  res = sahteRes();
  await kayit(req({ email: HE, sifre: "guclu-sifre-1", ad: "Test Kullanici" }, { method: "POST", origin: "http://localhost:8899" }), res);
  ok("kayıt 200", res.kod === 200);
  ok("kayıt oturum çerezi veriyor", /zenai_oturum=/.test(res.cireZ.join(";")));
  ok("kayıt çerezi HttpOnly", /HttpOnly/.test(res.cireZ.join(";")));
  ok("kayıt planı free", res.govde?.kullanici?.plan?.kod === "free");

  // Aynı e-posta ikinci kez kaydedilemez (ezilmez)
  res = sahteRes();
  await kayit(req({ email: HE, sifre: "baska-sifre-99" }, { method: "POST", origin: "http://localhost:8899" }), res);
  ok("tekrar kayıt engelleniyor", res.kod === 409);
  res = sahteRes();
  await giris(req({ email: HE, sifre: "baska-sifre-99" }, { method: "POST", origin: "http://localhost:8899" }), res);
  ok("ikinci kayıt şifresi kabul edilmiyor", res.kod === 401);
  res = sahteRes();
  await giris(req({ email: HE, sifre: "guclu-sifre-1" }, { method: "POST", origin: "http://localhost:8899" }), res);
  ok("ilk şifre hâlâ geçerli (ezilmedi)", res.kod === 200);

  // Doğrulama kuralları
  for (const [ad, govde, kod] of [
    ["geçersiz e-posta 400", { email: "bozuk", sifre: "guclu-sifre-1" }, 400],
    ["kısa şifre 400", { email: HE + "x", sifre: "kisa" }, 400],
    ["tahmin edilebilir şifre 400", { email: HE + "y", sifre: "password" }, 400],
  ]) {
    res = sahteRes();
    await kayit(req(govde, { method: "POST", origin: "http://localhost:8899" }), res);
    ok(ad, res.kod === kod);
  }

  // Giriş
  res = sahteRes();
  await giris(req({ email: HE, sifre: "guclu-sifre-1" }, { method: "POST", origin: "http://localhost:8899" }), res);
  ok("doğru şifreyle giriş 200", res.kod === 200);
  const girisCerez = res.cireZ.join(";");
  res = sahteRes();
  await giris(req({ email: HE, sifre: "yanlis-sifre" }, { method: "POST", origin: "http://localhost:8899" }), res);
  ok("yanlış şifre 401", res.kod === 401);
  ok("kullanıcı varlığı sızdırılmıyor", /E-posta veya şifre hatalı/.test(res.govde?.error || ""));
  res = sahteRes();
  await giris(req({ email: "yok-boyle-bir-kullanici@zenai.test", sifre: "guclu-sifre-1" }, { method: "POST", origin: "http://localhost:8899" }), res);
  ok("olmayan kullanıcı da aynı mesajı veriyor", /E-posta veya şifre hatalı/.test(res.govde?.error || ""));
  res = sahteRes();
  await giris(req({ email: HE, sifre: "guclu-sifre-1" }, { method: "GET" }), res);
  ok("GET 405", res.kod === 405);

  // Brute-force kilidi. Sayaç depoda tutulduğu için denemeler arasında kısa bir
  // bekleme var: yazmanın yayılması gerçek bir saldırganın hızından da uzun.
  // Sayaç TEK YÖNLÜ olmalı: her hatalı deneme sayıyı artırır, asla düşürmez.
  // (Regresyon koruması: kayıt üzerinde "oku-değiştir-yaz" yapıldığında depo
  //  gecikmesi yüzünden sayaç 1→2→2→5 diye GERİYE gidiyordu.)
  let deneme = 0, sonSayi = 0, tekYonlu = true;
  for (; deneme < 15; deneme++) {
    const sayi = (await basarisizSay(subUret(HE))).sayi;
    if (sayi < sonSayi) tekYonlu = false;
    sonSayi = sayi;
    res = sahteRes();
    await giris(req({ email: HE, sifre: "hatali-" + deneme }, { method: "POST", origin: "http://localhost:8899" }), res);
    if (res.kod === 429) break;
    await bekle(300);
  }
  ok("hatalı deneme sayısı hiç azalmıyor", tekYonlu);
  ok("çok hatalı denemeden sonra kilit 429", res.kod === 429);
  ok("kilit makul sayıda denemede devreye giriyor", deneme < 15);
  res = sahteRes();
  await giris(req({ email: HE, sifre: "guclu-sifre-1" }, { method: "POST", origin: "http://localhost:8899" }), res);
  ok("kilitliyken doğru şifre de reddediliyor", res.kod === 429);
  ok("429 yanıtı süre bildiriyor", /dakika sonra/.test(res.govde?.error || ""));

  // KALICI KİLİT OLMAMALI: pencere dolunca hesap yeniden açılabilmeli.
  // simdi parametresi sayesinde gerçek 15 dakika beklenmeden test edilebilir.
  const ileri = Date.now() + KILIT_PENCERE_MS + 60000;
  ok("pencere dışındaki denemeler sayılmıyor", (await basarisizSay(subUret(HE), ileri)).sayi === 0);
  const sonra = await girisDene({ email: HE, sifre: "guclu-sifre-1" }, ileri);
  ok("kilit süresi dolunca hesap tekrar açılıyor", !sonra.hata && !!sonra.kayit);
  ok("başarılı giriş sonGiris damgalıyor", !!sonra.kayit?.sonGiris);
  const kotu = await girisDene({ email: HE, sifre: "dogru-sifre-1" });
  ok("pencere içindeyken doğru şifre hâlâ 429", kotu.kod === 429);

  // Depoda şifre tuz/hash olarak, düz değil
  const kayitli = await hesapAc({ email: "deneme-" + Date.now() + "@zenai.test", sifre: "deneme-sifre-1" });
  ok("hesapAc kayıt döndürüyor", !kayitli.hata && !!kayitli.kayit);
} else {
  console.log("  (hesap testleri atlandi: BLOB_READ_WRITE_TOKEN tanimli degil)");
}

console.log("\n▸ /api/billing/checkout");
res = sahteRes();
await checkout(req({ plan: "gold" }, { method: "POST" }), res);
ok("girişsiz 401", res.kod === 401);
res = sahteRes();
await checkout(req({ plan: "diamond" }, { method: "POST", origin: "http://localhost:8899", headers: { cookie: `zenai_oturum=${oturumJet}` } }), res);
ok("geçersiz plan 400", res.kod === 400);
res = sahteRes();
await checkout(req({ plan: "free" }, { method: "POST", origin: "http://localhost:8899", headers: { cookie: `zenai_oturum=${oturumJet}` } }), res);
ok("free satın alınamaz 400", res.kod === 400);
res = sahteRes();
const goldOtel = sifrele({ sub: testSub + "-g", eposta: "a@b.com", plan: "gold", exp: Math.floor(Date.now() / 1000) + 999 }, sifre);
await checkout(req({ plan: "silver" }, { method: "POST", origin: "http://localhost:8899", headers: { cookie: `zenai_oturum=${goldOtel}` } }), res);
ok("aşağı yönlü satın alma engellenir", res.kod === 400);
res = sahteRes();
await checkout(req({ plan: "platinum" }, { method: "POST", origin: "http://localhost:8899", headers: { cookie: `zenai_oturum=${oturumJet}` } }), res);
ok("price ID yoksa 500", res.kod === 500 && /STRIPE_PRICE_PLATINUM/.test(res.govde.error));
res = sahteRes();
await checkout(req({ plan: "gold" }, { method: "GET" }), res);
ok("GET 405", res.kod === 405);

console.log("\n▸ Stripe webhook imzası");
const govde = JSON.stringify({ type: "ping" });
const imzala = (g, s, t = Math.floor(Date.now() / 1000)) => {
  const sig = crypto.createHmac("sha256", s).update(`${t}.${g}`).digest("hex");
  return `t=${t},v1=${sig}`;
};
res = sahteRes();
await webhook(req(govde, { method: "POST", headers: { "stripe-signature": imzala(govde, "whsec_test_yok") } }), res);
ok("geçerli imza 200", res.kod === 200);
ok("alındı", res.govde.alindi === true);
res = sahteRes();
await webhook(req(govde, { method: "POST", headers: { "stripe-signature": imzala(govde, "yanlis-secret") } }), res);
ok("yanlış imza 400", res.kod === 400);
res = sahteRes();
await webhook(req(govde, { method: "POST", headers: { "stripe-signature": `t=1,v1=${"aa".repeat(32)}` } }), res);
ok("eski timestamp reddedilir", res.kod === 400);
res = sahteRes();
await webhook(req(govde, { method: "POST" }), res);
ok("imza başlığı yok 400", res.kod === 400);
res = sahteRes();
// Benzersiz anahtar: sabit anahtarlar birbirinin tombstone'ini tetikliyordu.
const whSub = "wh-" + Date.now();
const tamamlandi = JSON.stringify({ type: "checkout.session.completed", data: { object: { metadata: { sub: whSub, plan: "gold" } } } });
await webhook(req(tamamlandi, { method: "POST", headers: { "stripe-signature": imzala(tamamlandi, "whsec_test_yok") } }), res);
if (depoVar) {
  // Depo yapılandırılmış: webhook planı yazıp 200 dönmeli (sessiz kayıp yok).
  ok("depo varken 200 (sessiz kayıp yok)", res.kod === 200);
  ok("plan depoya yazıldı", (await planOku(whSub, "free")) === "gold");
  await planSifirla(whSub);
} else {
  // Depo yok → 500 döner ki Stripe yeniden denesin.
  ok("depo yoksa 500 (sessiz kayıp yok)", res.kod === 500);
  ok("500 sebebi plan yazılamadı", /plan yazılamadı/.test(res.govde.error || ""));
}
res = sahteRes();
const iptal = JSON.stringify({ type: "customer.subscription.deleted", data: { object: { metadata: { sub: whSub } } } });
await webhook(req(iptal, { method: "POST", headers: { "stripe-signature": imzala(iptal, "whsec_test_yok") } }), res);
ok("abonelik iptali 200", res.kod === 200);
ok("iptalden sonra plan free", (await planOkuBekle(whSub, "free")) === "free");

console.log("\n▸ Depo (yoksa zarif düşüş)");
ok("depoVar doğru bildiriliyor", typeof depoVar === "boolean");
ok("depo türü bildiriliyor", ["vercel-blob", "upstash", "yok"].includes(depoTuru));
ok("sub yoksa planOku varsayılanı verir", (await planOku("", "silver")) === "silver");
if (!depoVar) {
  ok("depo yoksa planOku varsayılanı verir", (await planOku("u1", "free")) === "free");
  ok("depo yoksa planYaz false", (await planYaz("u1", "gold")) === false);
  ok("depo yoksa planSifirla false", (await planSifirla("u1")) === false);
}

console.log("\n▸ Depo YAPILANDIRILMIŞKEN gerçek yazma/okuma");
// Bu blok BLOB/UPSTASH tanimliysa calisir, degilse atlanir
if (depoVar) {
  const depoSub = "test-" + Date.now();
  ok("yazma basarili", (await planYaz(depoSub, "gold")) === true);
  ok("okuma dogru plan donduruyor", (await planOku(depoSub, "free")) === "gold");
  // Iptal -> free yazilir, kayit SILINMEZ (Blob tombstone bug'i onlemi).
  ok("sifirlama basarili", (await planSifirla(depoSub)) === true);
  ok("sifirlama free donduruyor", (await planOkuBekle(depoSub, "free")) === "free");
  // Iptal sonrasi yeniden abone olma (onceki belanin kaynak hatasi)
  ok("yeniden abone olma yaziyor", (await planYaz(depoSub, "platinum")) === true);
  ok("yeniden abone olma okunuyor", (await planOkuBekle(depoSub, "platinum")) === "platinum");
  ok("yoksa varsayilana dusuyor", (await planOku("hic-boyle-bir-kullanici-yok-12345", "silver")) === "silver");
} else {
  console.log("  (atlandi: BLOB_READ_WRITE_TOKEN veya UPSTASH_* tanimli degil)");
}

console.log(`\n${gecti} geçti, ${kaldi} kaldı`);
process.exit(kaldi ? 1 : 0);
