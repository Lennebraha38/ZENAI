const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.setDefaultTimeout(4000);
  const err = [];
  p.on("pageerror", (e) => err.push("PE: " + e.message.slice(0,100)));
  await p.goto(process.argv[2] || "http://localhost:8899/index.html", { waitUntil: "load" });
  await p.waitForTimeout(2000);
  await p.evaluate(() => document.getElementById("btnObKapat")?.click());
  await p.waitForTimeout(400);
  const O = {};
  O.buCihazdaKaldi = await p.evaluate(() => !!document.getElementById("btnProfil"));
  for (const [k, id] of [["gizlilik","ayakGizlilik"],["sartlar","ayakSartlar"],["iletisim","ayakIletisim"]]) {
    await p.evaluate((i) => document.getElementById(i)?.click(), id);
    await p.waitForTimeout(450);
    O[k] = await p.evaluate(() => ({
      baslik: document.getElementById("bilgiBaslik")?.textContent?.trim(),
      uzunluk: document.getElementById("bilgiIcerik")?.textContent?.trim().length || 0,
      acik: !document.getElementById("bilgiModal")?.classList.contains("hidden"),
      ilkMetin: document.getElementById("bilgiIcerik")?.textContent?.trim().slice(0, 70),
    }));
    await p.evaluate(() => document.getElementById("btnBilgiKapat")?.click());
    await p.waitForTimeout(300);
  }
  // kapatma da calisiyor mu
  await p.evaluate(() => document.getElementById("ayakSartlar")?.click());
  await p.waitForTimeout(350);
  O.kapatmaOnce = await p.evaluate(() => !document.getElementById("bilgiModal").classList.contains("hidden"));
  await p.evaluate(() => document.getElementById("btnBilgiKapat")?.click());
  await p.waitForTimeout(350);
  O.kapatmaSonrasi = await p.evaluate(() => !document.getElementById("bilgiModal").classList.contains("hidden"));
  O.hatalar = [...new Set(err)];
  console.log(JSON.stringify(O, null, 2));
  await b.close();
})();
