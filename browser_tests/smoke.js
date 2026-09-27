const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const err = [];
  p.on("pageerror", (e) => err.push("PE: " + e.message.slice(0, 130)));
  p.on("console", (m) => { if (m.type() === "error" && !/favicon|501/.test(m.text())) err.push("C: " + m.text().slice(0, 130)); });
  await p.goto("http://localhost:8899/index.html", { waitUntil: "load" });
  await p.waitForTimeout(2200);
  await p.evaluate(() => document.getElementById("btnObKapat")?.click());
  await p.waitForTimeout(400);
  const O = { hatalar: [...new Set(err)] };
  // her butona tikla, sonucu gor
  const sonuc = await p.evaluate(async () => {
    const out = [];
    const hedefler = [
      ["btnYeniSohbet", "yeni sohbet"], ["btnDosya", "gorsel ekle"], ["pillAra", "mod ara"],
      ["pillDusun", "mod dusun"], ["pillKanvas", "mod kanvas"], ["btnModelSecBtn", "model menu"],
      ["modelSecBtn", "model menu 2"], ["btnPanel", "ayarlar"], ["btnPlanlar", "planlar"],
      ["btnAuth", "auth"], ["btnTema", "tema"], ["btnDil", "dil"], ["btnObBasla", "onboard"],
    ];
    for (const [id, ad] of hedefler) {
      const e = document.getElementById(id);
      if (!e) { out.push(ad + ": YOK"); continue; }
      try { e.click(); await new Promise(r => setTimeout(r, 250)); out.push(ad + ": ok"); }
      catch (err) { out.push(ad + ": HATA " + err.message.slice(0, 30)); }
    }
    // temizle
    document.querySelectorAll(".modal, #panelDialog, #modelMenu").forEach(m => m.classList.add("hidden"));
    return out;
  });
  O.butonlar = sonuc;
  O.modelAdlar = await p.evaluate(() => {
    const L = window.LB; return { var: !!L };
  });
  O.hatalar2 = [...new Set(err)];
  console.log(JSON.stringify(O, null, 2));
  await b.close();
})();
