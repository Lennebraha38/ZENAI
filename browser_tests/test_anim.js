const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.setDefaultTimeout(5000);
  const err = [];
  p.on("pageerror", (e) => err.push("PE: " + e.message.slice(0,100)));
  await p.goto(process.argv[2] || "http://localhost:8899/index.html", { waitUntil: "load" });
  await p.waitForTimeout(2000);
  await p.evaluate(() => document.getElementById("btnObKapat")?.click());
  await p.waitForTimeout(600);
  const O = {};
  O.yapi = await p.evaluate(() => {
    const a = document.getElementById("aiAnim");
    if (!a) return { yok: true };
    const mesh = a.querySelector(".ai-mesh");
    const cs = getComputedStyle(mesh);
    return {
      var: true,
      mesh: !!mesh, nokta: !!a.querySelector(".ai-nokta"),
      grain: !!a.querySelector(".ai-grain"), vinyet: !!a.querySelector(".ai-vinyet"),
      eskiBlobKaldi: a.querySelectorAll(".ai-blob").length,
      animasyon: cs.animationName, sure: cs.animationDuration, filtre: cs.filter.slice(0, 20),
      katman: getComputedStyle(a).zIndex,
    };
  });
  // animasyon gercekten ilerliyor mu (transform degisiyor mu)
  const t1 = await p.evaluate(() => getComputedStyle(document.querySelector(".ai-mesh")).transform);
  await p.waitForTimeout(1400);
  const t2 = await p.evaluate(() => getComputedStyle(document.querySelector(".ai-mesh")).transform);
  O.animasyonIlerliyor = t1 !== t2;
  O.parallax = await p.evaluate(async () => {
    const a = document.getElementById("aiAnim");
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 1300, clientY: 800, bubbles: true }));
    await new Promise(r => setTimeout(r, 500));
    return a.style.transform;
  });
  O.camYuzey = await p.evaluate(() => {
    const t = document.getElementById("morphTetik");
    const cs = getComputedStyle(t, "::before");
    return { blur: cs.backdropFilter || cs.webkitBackdropFilter, border: cs.borderTopColor, bg: cs.backgroundImage.slice(0, 44) };
  });
  O.temaAydinlik = await p.evaluate(async () => {
    document.getElementById("btnTema").click();
    await new Promise(r => setTimeout(r, 600));
    return { tema: document.documentElement.getAttribute("data-tema"), meshFiltre: getComputedStyle(document.querySelector(".ai-mesh")).filter.slice(0,20), grain: getComputedStyle(document.querySelector(".ai-grain")).opacity };
  });
  O.hatalar = [...new Set(err)];
  console.log(JSON.stringify(O, null, 2));
  await b.close();
})();
