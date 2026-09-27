const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const err = [];
  p.on("pageerror", (e) => err.push("PE:" + e.message.slice(0,120)));
  p.on("console", (m) => { if (m.type()==="error" && !/favicon/.test(m.text())) err.push("C:"+m.text().slice(0,120)); });
  await p.goto("http://localhost:8899/index.html", { waitUntil: "load" });
  await p.waitForTimeout(1800);
  const O = { hatalar: [...new Set(err)] };
  O.onboardAcik = await p.evaluate(() => !document.getElementById("onboarding").classList.contains("hidden"));
  await p.evaluate(() => document.getElementById("btnObKapat")?.click());
  await p.waitForTimeout(500);
  O.onboardSonra = await p.evaluate(() => !document.getElementById("onboarding").classList.contains("hidden"));
  O.daraltTikla = await p.evaluate(async () => {
    const btn = document.getElementById("btnSidebarDaralt");
    const r = btn.getBoundingClientRect();
    const uzerinde = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
    return { btnVar: !!btn, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width)], uzerindeki: uzerinde ? (uzerinde.id || uzerinde.className.toString().slice(0,30)) : null, engel: uzerinde !== btn && !btn.contains(uzerinde) };
  });
  await p.click("#btnSidebarDaralt").catch(e => O.tiklamaHatasi = e.message.slice(0,50));
  await p.waitForTimeout(700);
  O.daraltSonrasi = await p.evaluate(() => {
    const cs = getComputedStyle(document.getElementById("btnSidebarGoster"));
    return {
      sidebarW: Math.round(document.getElementById("sidebar").getBoundingClientRect().width),
      daralmis: document.getElementById("sidebar").classList.contains("daralmis"),
      appDarali: document.getElementById("app").classList.contains("sidebar-darali"),
      gosterDisplay: cs.display,
      gosterVis: cs.display !== "none" && cs.visibility !== "hidden",
      appClass: document.getElementById("app").className,
      ls: localStorage.getItem("lb_sidebar_daral"),
    };
  });
  O.hatalar2 = [...new Set(err)];
  console.log(JSON.stringify(O, null, 2));
  await b.close();
})();
