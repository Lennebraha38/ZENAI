const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.setDefaultTimeout(8000);
  const err = [];
  p.on("pageerror", (e) => err.push("PE: " + e.message.slice(0,110)));
  await p.goto("https://zenai-two.vercel.app/", { waitUntil: "load" });
  await p.waitForTimeout(2200);
  await p.evaluate(() => document.getElementById("btnObKapat")?.click());
  await p.waitForTimeout(500);
  await p.click("#morphTetik"); await p.waitForTimeout(700);
  await p.fill("#giris", "2+2 kaç? Sadece sayı yaz.");
  const t0 = Date.now();
  await p.click("#btnGonder");
  for (let i = 0; i < 120; i++) {
    const t = await p.evaluate(() => document.getElementById("chat")?.innerText || "");
    if (t.includes("NEX") || /\d\s*\n/.test(t) || t.length > 90) break;
    await p.waitForTimeout(150);
  }
  await p.waitForTimeout(2500);
  const O = { sureMs: Date.now() - t0 };
  O.chat = await p.evaluate(() => {
    const t = document.getElementById("chat").innerText.replace(/\s+/g, " ");
    return { metin: t.slice(0, 220), hamKodSizinti: /NEX-N2\.5|n2\.5-mini|nex-agi/i.test(t) };
  });
  O.hatalar = [...new Set(err)];
  await b.close();
  console.log(JSON.stringify(O, null, 2));
})();
