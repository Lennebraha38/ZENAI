const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const tr = [];
  p.on("pageerror", (e) => tr.push((e.stack || e.message)));
  p.on("console", (m) => { if (m.type()==="error") tr.push("C:"+m.text().slice(0,120)); });
  await p.goto("https://zenai-two.vercel.app/", { waitUntil: "load" });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById("btnObKapat")?.click());
  await p.waitForTimeout(500);
  // dil toggle + tema toggle + yasal modal + panel hepsini tetikle
  for (const id of ["btnDil","btnTema","btnDil","btnTema","ayakGizlilik","btnBilgiKapat","btnPanel","btnPanelKapat"]) {
    await p.evaluate((i) => document.getElementById(i)?.click(), id);
    await p.waitForTimeout(350);
  }
  console.log("=== IZLER (" + tr.length + ") ===");
  tr.forEach((t,i)=>console.log("\n["+i+"] "+t.split("\n").slice(0,6).join("\n")));
  await b.close();
})();
