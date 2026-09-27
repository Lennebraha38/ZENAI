// ZenAI web GUI — Playwright doğrulama testi
// Kullanım: NODE_PATH=$(npm root -g) node web/web_gui_test.js
const { chromium } = require("playwright");

(async () => {
  const hatalar = [];
  const browser = await chromium.launch();
  const sayfa = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  sayfa.on("pageerror", (e) => hatalar.push("PAGEERROR: " + e.message));
  // Benign dosya protokolü hatalarını (file:// api/chat) görmezden gel
  sayfa.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("file://")) hatalar.push("CONSOLE: " + m.text());
  });

  await sayfa.goto("file://" + __dirname.replace(/\\/g, "/") + "/index.html", { waitUntil: "load", timeout: 20000 });
  await sayfa.waitForTimeout(800);

  const sonuc = {};
  sonuc.baslik = await sayfa.title();
  sonuc.oneriler = await sayfa.locator(".oneri").count();
  sonuc.sidebar = await sayfa.locator("#sidebar").isVisible().catch(() => false);

  // Panel aç
  await sayfa.locator("#btnPanel").click();
  await sayfa.waitForTimeout(300);
  sonuc.skillSayi = await sayfa.locator(".skill-kayit").count();

  // Skill ekleme
  await sayfa.locator("#btnSkillEkle").click();
  await sayfa.locator("#skillAd").fill("Hukukçu");
  await sayfa.locator("#skillIcerik").fill("Sen titiz bir hukukçusun, yasal dili sadeleştir.");
  await sayfa.locator("#btnSkillKaydet").click();
  await sayfa.waitForTimeout(300);
  sonuc.skillEklendi = await sayfa.locator(".skill-kayit", { hasText: "Hukukçu" }).count();

  // MCP modal
  await sayfa.locator("#btnMcpEkle").click();
  sonuc.mcpModal = await sayfa.locator("#mcpModal:not(.hidden)").count();
  await sayfa.evaluate(() => document.getElementById("mcpModal").classList.add("hidden"));

  // Markdown + konu tespiti
  const md = await sayfa.evaluate(() => {
    const el = document.createElement("div");
    window.LB.mdYazdir(el, "# Başlık\n\n- a\n- b\n\n```python\nprint('x')\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |");
    return { h1: !!el.querySelector("h1"), ul: !!el.querySelector("ul"), pre: !!el.querySelector("pre code"), table: !!el.querySelector("table") };
  });
  sonuc.markdown = md;
  sonuc.konu = await sayfa.evaluate(() => ["Python kodu yaz", "2+2 kaç", "hikaye yaz", "DNA nedir"].map((s) => window.LB.konuBul(s)));

  console.log(JSON.stringify(sonuc, null, 2));
  console.log("HATALAR:", hatalar.length ? hatalar : "yok");

  // Doğrulamalar
  const ok = sonuc.oneriler === 6 && sonuc.skillSayi === 4 && sonuc.skillEklendi === 1 &&
    sonuc.mcpModal === 1 && md.h1 && md.ul && md.pre && md.table &&
    JSON.stringify(sonuc.konu) === JSON.stringify(["kod", "matematik", "yaratici", "bilim"]) && hatalar.length === 0;
  await browser.close();
  console.log(ok ? "SONUC: GECTI" : "SONUC: BASARISIZ");
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error("TEST HATASI:", e.message); process.exit(1); });