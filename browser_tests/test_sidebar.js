const { chromium } = require("playwright");
const URL = process.argv[2] || "http://localhost:8899/index.html";
const R = {};
const hatalar = [];
const w = async (p, ms = 450) => p.waitForTimeout(ms);
const gen = (p) => p.evaluate(() => ({
  sb: Math.round(document.getElementById("sidebar").getBoundingClientRect().width),
  sbGorunur: getComputedStyle(document.getElementById("sidebar")).display !== "none" && document.getElementById("sidebar").getBoundingClientRect().width > 10,
  gosterBtn: getComputedStyle(document.getElementById("btnSidebarGoster")).display !== "none",
  gosterX: Math.round(document.getElementById("btnSidebarGoster").getBoundingClientRect().left),
  daralmis: document.getElementById("sidebar").classList.contains("daralmis"),
  darali: document.getElementById("app").classList.contains("sidebar-darali"),
  mobilAcik: document.getElementById("app").classList.contains("sidebar-mobil-acik"),
  ls: localStorage.getItem("lb_sidebar_daral"),
  perde: (() => { const e = document.getElementById("sidebarPerde"); return e ? !e.hidden : null; })(),
  ariaD: document.getElementById("btnSidebarDaralt").getAttribute("aria-expanded"),
  ariaG: document.getElementById("btnSidebarGoster").getAttribute("aria-expanded"),
}));

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.setDefaultTimeout(4000);
  p.on("pageerror", (e) => hatalar.push("PE: " + e.message.slice(0, 110)));
  p.on("console", (m) => { if (m.type() === "error" && !m.text().includes("favicon")) hatalar.push("C: " + m.text().slice(0, 110)); });

  await p.goto(URL, { waitUntil: "load" });
  await w(p, 1500);
  await p.evaluate(() => document.getElementById("btnObKapat")?.click());
  await w(p);

  // 1) başlangıç
  R["1_baslangic"] = await gen(p);

  // 2) daralt
  await p.click("#btnSidebarDaralt"); await w(p, 600);
  R["2_daraltildi"] = await gen(p);

  // 3) GÖSTER butonu ile geri aç
  await p.click("#btnSidebarGoster"); await w(p, 600);
  R["3_geri_acildi"] = await gen(p);

  // 4) tekrar daralt + reload → kalıcılık + geri açılabilirlik
  await p.click("#btnSidebarDaralt"); await w(p, 500);
  await p.reload({ waitUntil: "load" }); await w(p, 1500);
  await p.evaluate(() => document.getElementById("btnObKapat")?.click()); await w(p);
  R["4_reload_darali"] = await gen(p);
  await p.click("#btnSidebarGoster"); await w(p, 600);
  R["4_reload_sonrasi_acildi"] = await gen(p);

  // 5) ayarlar anahtarı: kapat → gizle, göster butonu belirsin
  await p.evaluate(() => document.getElementById("btnPanel")?.click()); await w(p, 500);
  await p.evaluate(() => { const c = document.getElementById("swSidebar"); c.checked = false; c.dispatchEvent(new Event("change", { bubbles: true })); }); await w(p, 600);
  R["5_swSidebar_kapali"] = await gen(p);
  await p.evaluate(() => { const c = document.getElementById("swSidebar"); c.checked = true; c.dispatchEvent(new Event("change", { bubbles: true })); }); await w(p, 600);
  R["5_swSidebar_acik"] = await gen(p);
  await p.evaluate(() => document.getElementById("btnPanelKapat")?.click()); await w(p);

  // 6) MOBİL
  await p.setViewportSize({ width: 390, height: 844 }); await w(p, 900);
  R["6_mobil_baslangic"] = await gen(p);
  await p.click("#btnSidebarGoster"); await w(p, 700);
  R["6_mobil_acik"] = await gen(p);
  await p.evaluate(() => document.getElementById("sidebarPerde").click()); await w(p, 600);
  R["6_mobil_perde_ile_kapandi"] = await gen(p);
  await p.click("#btnSidebarGoster"); await w(p, 600);
  await p.keyboard.press("Escape"); await w(p, 600);
  R["6_mobil_escape_ile_kapandi"] = await gen(p);

  R.hatalar = [...new Set(hatalar)];
  await b.close();
  console.log(JSON.stringify(R, null, 2));
})().catch((e) => { console.error("TEST HATASI:", e.message); process.exit(1); });
