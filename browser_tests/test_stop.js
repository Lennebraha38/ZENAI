const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 860 } });
  p.setDefaultTimeout(8000);
  const err = [];
  p.on("pageerror", (e) => err.push("PE:" + e.message.slice(0, 90)));
  p.on("dialog", async (d) => { O_dialog = d.message().slice(0, 80); await d.dismiss(); });
  let O_dialog = null;
  const HEDEF = process.argv[2] || "http://localhost:8899/index.html";
  await p.goto(HEDEF, { waitUntil: "load" });
  await p.waitForTimeout(2500);
  await p.evaluate(() => document.getElementById("btnObKapat")?.click());
  await p.waitForTimeout(600);
  const O = {};
  // Girdi alanini ac ve bir soru yaz (ilk acilista kapalidir, morph ile acilir)
  await p.evaluate(() => document.getElementById("morphTetik")?.click());
  await p.waitForTimeout(900);
  O.morphAcilis = await p.evaluate(() => ({
    kutu: !document.getElementById("girdiKutuWrap")?.hasAttribute("hidden"),
    girisGorunur: !!document.getElementById("giris")?.offsetParent,
  }));
  await p.fill("#giris", "Bana uzun bir deneme yaz, en az 300 kelime olsun.");
  await p.waitForTimeout(400);
  O.gonderBtn = await p.evaluate(() => {
    const b = document.getElementById("btnGonder");
    return { sinif: b.className, disabled: b.disabled, dolu: b.classList.contains("dolu") };
  });
  // gonder + kisa sure bekle, boylesen 'gonderiliyor' olmali
  await p.evaluate(() => document.getElementById("btnGonder").click());
  await p.waitForTimeout(1200);
  O.akisSirasinda = await p.evaluate(() => {
    const b = document.getElementById("btnGonder");
    return { sinif: b.className, gonderiliyor: b.classList.contains("gonderiliyor"), disabled: b.disabled };
  });
  // STOP: ayni butona tekrar bas
  await p.evaluate(() => document.getElementById("btnGonder").click());
  await p.waitForTimeout(1500);
  O.stopAni = await p.evaluate(() => {
    const b = document.getElementById("btnGonder");
    return {
      gonderiliyor: b.classList.contains("gonderiliyor"),
      disabled: b.disabled,
      stopIkonGorunur: getComputedStyle(b.querySelector(".ikon-stop")).display !== "none",
      butonYazisi: b.getAttribute("aria-label"),
    };
  });
  O.stopSonrasi = await p.evaluate(() => {
    const b = document.getElementById("btnGonder");
    return {
      gonderiliyor: b.classList.contains("gonderiliyor"),
      denetleyici: !!akisDenetleyici,
      sinyal: akisDenetleyici ? akisDenetleyici.signal.aborted : null,
      tekrarAkis: typeof tekrarAkis !== "undefined" ? tekrarAkis : null,
    };
  });
  // butonun tekrar kullanilabilir olup olmadigi
  await p.fill("#giris", "test");
  await p.waitForTimeout(300);
  O.yenidenKullanilir = await p.evaluate(() => !document.getElementById("btnGonder").disabled);
  O.dialog = O_dialog;
  O.hatalar = [...new Set(err)];
  console.log(JSON.stringify(O, null, 2));
  await b.close();
})();
