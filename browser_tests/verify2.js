const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.setDefaultTimeout(3000);
  const err = [];
  p.on("pageerror", (e) => err.push("PE:" + e.message.slice(0,70)));
  await p.goto("https://zenai-two.vercel.app/", { waitUntil: "load" });
  await p.waitForTimeout(2200);
  await p.evaluate(() => document.getElementById("btnObKapat")?.click());
  await p.waitForTimeout(400);
  const O = {};
  const acikMi = (id) => p.evaluate((i) => {
    const e = document.getElementById(i); if (!e) return "yok";
    return !e.classList.contains("hidden") && getComputedStyle(e).display !== "none";
  }, id);

  for (const [k, btn, modal] of [["gizlilik","ayakGizlilik","bilgiModal"],["sartlar","ayakSartlar","bilgiModal"],["iletisim","ayakIletisim","bilgiModal"],["auth","btnAuth","authModal"],["planlar","btnPlanlar","planlarModal"],["ayarlar","btnPanel","panelDialog"],["mcp","btnMcpEkle","mcpModal"],["skill","btnSkillEkle","skillModal"]]) {
    const o = await acikMi(modal);
    if (o) { await p.evaluate((m) => { const e=document.getElementById(m); e.classList.add("hidden"); }, modal); await p.waitForTimeout(200); }
    await p.evaluate((i) => document.getElementById(i)?.click(), btn);
    await p.waitForTimeout(600);
    O[k] = { modal, oncekiAcik: o, tiklandiSonrasiAcik: await acikMi(modal) };
    await p.evaluate((m) => document.getElementById(m)?.classList.add("hidden"), modal);
    await p.waitForTimeout(200);
  }
  // onboarding gercekten kapaniyor mu + tekrar gorunur mu
  O.onboardTekrar = await p.evaluate(() => { const o=document.getElementById("onboarding"); return { hidden: o.classList.contains("hidden"), display: getComputedStyle(o).display }; });
  O.err = [...new Set(err)];
  console.log(JSON.stringify(O, null, 2));
  await b.close();
})();
