const { chromium } = require("playwright");
const URL = "https://zenai-two.vercel.app/";
const D = {};
const hatalar = [];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.setDefaultTimeout(3000);
  p.on("pageerror", (e) => hatalar.push("PAGEERROR: " + e.message));
  p.on("console", (m) => { if (m.type() === "error") hatalar.push("CONSOLE: " + m.text().slice(0, 160)); });
  p.on("response", (r) => { if (r.status() >= 400) hatalar.push("HTTP" + r.status() + " " + r.url().replace(URL, "")); });

  await p.goto(URL, { waitUntil: "load" });
  await p.waitForTimeout(2000);
  await p.evaluate(() => { const x = document.getElementById("btnObKapat"); if (x) x.click(); });
  await p.waitForTimeout(500);

  // 1) HANGI ELEMENT NULL? — stack trace
  const errTrace = [];
  p.on("pageerror", (e) => errTrace.push((e.stack || e.message).split("\n").slice(0, 5).join(" <- ")));
  await p.evaluate(() => { const x = document.getElementById("btnDil"); if (x) x.click(); });
  await p.waitForTimeout(700);
  D.dilSonrasi = await p.evaluate(() => ({ lang: document.documentElement.lang }));
  D.stackTrace = errTrace.slice(-4);

  // 2) TEMA toggle gercekten ne yapiyor?
  D.tema = await p.evaluate(async () => {
    const once = document.documentElement.getAttribute("data-tema");
    const btn = document.getElementById("btnTema");
    const ic = btn.innerHTML.replace(/\s+/g, " ").slice(0, 120);
    btn.click();
    await new Promise((r) => setTimeout(r, 500));
    return { once, sonra: document.documentElement.getAttribute("data-tema"), butonIcerik: ic, ariaChecked: btn.getAttribute("aria-checked"), dataTema: btn.getAttribute("data-tema") };
  });

  // 3) DIL toggle
  D.dil = await p.evaluate(async () => {
    const b1 = document.getElementById("btnDil");
    const o1 = document.documentElement.lang;
    b1.click(); await new Promise((r) => setTimeout(r, 500));
    return { once: o1, sonra: document.documentElement.lang, butonIcerik: b1.innerHTML.replace(/\s+/g, " ").slice(0, 80) };
  });
  await p.evaluate(() => { const x = document.getElementById("btnDil"); if (x) x.click(); });
  await p.waitForTimeout(400);

  // 4) YASAL modal icerigi
  D.yasal = await p.evaluate(async () => {
    const out = {};
    for (const [k, id] of [["gizlilik", "ayakGizlilik"], ["sartlar", "ayakSartlar"], ["iletisim", "ayakIletisim"]]) {
      document.getElementById(id)?.click();
      await new Promise((r) => setTimeout(r, 400));
      out[k] = {
        baslik: document.getElementById("bilgiBaslik")?.innerText?.trim(),
        icerik: document.getElementById("bilgiIcerik")?.innerHTML?.trim()?.slice(0, 80),
        uzunluk: document.getElementById("bilgiIcerik")?.innerText?.trim()?.length || 0,
      };
      document.getElementById("btnBilgiKapat")?.click();
      await new Promise((r) => setTimeout(r, 250));
    }
    return out;
  });

  // 5) SES overlay tetikleyicisi
  D.ses = await p.evaluate(async () => {
    const cand = [...document.querySelectorAll("button, [role=button]")].filter((x) => {
      const s = (x.id || "") + " " + (x.className || "") + " " + (x.getAttribute("aria-label") || "") + " " + (x.title || "");
      return /ses|mikrofon|mic|voice|konus/i.test(s);
    }).map((x) => ({ id: x.id, cls: (x.className || "").toString().slice(0, 30), aria: x.getAttribute("aria-label"), gorunur: x.getBoundingClientRect().width > 0 }));
    return { aday: cand, overlayVar: !!document.getElementById("sesOverlay") };
  });
  // gercekten tikla
  D.sesTiklama = await p.evaluate(async () => {
    const btn = document.getElementById("btnSes") || [...document.querySelectorAll("button")].find((x) => /mic|mikrofon|voice/i.test((x.id || "") + (x.className || "") + (x.getAttribute("aria-label") || "")));
    if (!btn) return { bulunamadi: true };
    btn.click();
    await new Promise((r) => setTimeout(r, 900));
    const o = document.getElementById("sesOverlay");
    return { tiklandi: btn.id || btn.className, gorunur: o ? !o.classList.contains("gizli") && getComputedStyle(o).display !== "none" : false, display: o ? getComputedStyle(o).display : null, sinif: o ? o.className : null };
  });
  await p.evaluate(() => { const x = document.getElementById("telefonKapat"); if (x) x.click(); });
  await p.waitForTimeout(300);

  // 6) MOBIL: prompt gercekten gorunur mu?
  D.mobil = {};
  for (const [ad, w, h] of [["390", 390, 844], ["768", 768, 1024]]) {
    await p.setViewportSize({ width: w, height: h });
    await p.waitForTimeout(900);
    D.mobil[ad] = await p.evaluate(() => {
      const wrap = document.getElementById("girdiKutuWrap");
      const tet = document.getElementById("morphTetik");
      const sb = document.getElementById("sidebar");
      const g = document.getElementById("giris");
      return {
        tetikGorunur: tet ? !tet.hidden && tet.getBoundingClientRect().height > 0 : false,
        tetikY: Math.round((tet ? tet.getBoundingClientRect().top : -1)),
        girdiKutu: wrap ? !wrap.hidden : false,
        girdiGorunur: g ? g.getBoundingClientRect().height > 0 : false,
        sidebarGenislik: Math.round(sb?.getBoundingClientRect().width || 0),
        hamburger: !!document.querySelector("#btnMenu, .hamburger, [aria-label*='menu' i], [aria-label*='menü' i]"),
        tasma: document.documentElement.scrollWidth > window.innerWidth + 2,
        ustBarYukseklik: Math.round(document.getElementById("ustBar")?.getBoundingClientRect().height || 0),
      };
    });
  }
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.waitForTimeout(500);

  // 7) MODEL ADLARI
  D.modeller = await p.evaluate(() => {
    const m = document.getElementById("modelMenu");
    return [...m.querySelectorAll("button")].map((x) => ({ txt: x.innerText.replace(/\s+/g, " ").trim().slice(0, 40), data: x.dataset.model || null, secili: x.getAttribute("aria-selected") }));
  });
  D.routeEtiket = await p.evaluate(() => {
    const c = document.getElementById("chat");
    const s = [...c.querySelectorAll("*")].map((x) => x.innerText).find((t) => t && /ROUTE/.test(t) && t.length < 80);
    return s || null;
  });

  // 8) PAYLAS butonu
  D.paylas = await p.evaluate(() => [...document.querySelectorAll("#chat .eylem-btn, #chat button")].map((x) => ({ id: x.id, cls: (x.className || "").toString(), t: x.innerText.trim().slice(0, 14), title: x.title || null, aria: x.getAttribute("aria-label") })).slice(0, 10));

  // 9) gecmi gizle butonu id gercek ne?
  D.gecmiBtn = await p.evaluate(() => [...document.querySelectorAll("#sidebar button, #ustBar button")].map((x) => x.id).filter(Boolean));

  D.hatalar = [...new Set(hatalar)];
  await b.close();
  console.log(JSON.stringify(D, null, 2));
})().catch((e) => { console.error("HATA:", e.message); process.exit(1); });
