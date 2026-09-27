const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 860 } });
  p.setDefaultTimeout(5000);
  const err = [];
  p.on("pageerror", (e) => err.push("PE:" + e.message.slice(0, 90)));
  p.on("console", (m) => { if (m.type() === "error") err.push("CE:" + m.text().slice(0, 90)); });
  await p.goto("http://localhost:8899/index.html", { waitUntil: "load" });
  await p.waitForTimeout(2200);
  await p.evaluate(() => document.getElementById("btnObKapat")?.click());
  await p.waitForTimeout(600);
  const O = {};
  O.config = await p.evaluate(() => ({
    yuklendi: !SUNUCU.yuklenik||false, googleAktif: SUNUCU.googleAktif,
    girisYapildi: SUNUCU.girisYapildi, plan: SUNUCU.plan?.kod,
    apiKok: API_KOK,
  }));
  // authAc bağlı mı?
  O.bagli = await p.evaluate(() => typeof document.getElementById("btnAuth").onclick === "function");
  // modal açılıyor mu + google alanı doğru mesaj veriyor mu
  await p.click("#btnAuth");
  await p.waitForTimeout(400);
  O.modal = await p.evaluate(() => {
    const m = document.getElementById("authModal");
    const kap = document.getElementById("girisGoogleKutu");
    return { acik: !m.classList.contains("hidden"), googleYazi: kap.textContent.trim().slice(0, 60) };
  });
  // sahte buton tamamen kalkmış mı
  O.sahteButonYok = await p.evaluate(() => !document.getElementById("girisGoogle"));
  // ücretli plana tıklayınca girişe yönlendiriyor mu (localStorage'a PLAN YAZMAMALI)
  const once = await p.evaluate(() => localStorage.getItem("lb_plan"));
  await p.evaluate(() => { authKapat(); document.getElementById("planlarModal").classList.remove("hidden"); });
  await p.waitForTimeout(400);
  await p.click('.pk-btn[data-plan="gold"]');
  await p.waitForTimeout(600);
  O.planTiklama = await p.evaluate(() => ({
    lbPlan: localStorage.getItem("lb_plan"), modalAcik: !document.getElementById("authModal").classList.contains("hidden"),
  }));
  O.oncePlanDegismedi = (O.planTiklama.lbPlan === once);
  // config endpoint gerçekten yanıt veriyor mu
  O.configEndpoint = await p.evaluate(async () => {
    try { const r = await fetch("/api/config"); const j = await r.json(); return { status: r.status, anahtarlar: Object.keys(j).join(",") }; }
    catch (e) { return { hata: String(e.message) }; }
  });
  O.hatalar = [...new Set(err)];
  console.log(JSON.stringify(O, null, 2));
  await b.close();
})();
