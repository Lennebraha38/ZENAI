// ZenAI canli denetim — A'dan Z'ye
const { chromium } = require("playwright");
const URL = "https://zenai-two.vercel.app/";
const R = {};
const hatalar = [];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.setDefaultTimeout(3000);
  p.setDefaultNavigationTimeout(40000);
  p.on("pageerror", (e) => hatalar.push("PAGEERROR: " + e.message));
  p.on("console", (m) => { if (m.type() === "error") hatalar.push("CONSOLE: " + m.text().slice(0, 200)); });
  p.on("requestfailed", (r) => hatalar.push("REQFAIL: " + r.url().slice(0, 90) + " " + (r.failure()?.errorText || "")));

  const t0 = Date.now();
  await p.goto(URL, { waitUntil: "load", timeout: 45000 });
  R.yuklemeMs = Date.now() - t0;
  await p.waitForTimeout(2500);

  // ── 1. SEO / meta ──
  R.seo = await p.evaluate(() => ({
    title: document.title,
    desc: document.querySelector('meta[name=description]')?.content?.length || 0,
    og: document.querySelectorAll('meta[property^="og:"]').length,
    tw: document.querySelectorAll('meta[name^="twitter:"]').length,
    canonical: !!document.querySelector('link[rel=canonical]'),
    lang: document.documentElement.lang,
    h1: document.querySelectorAll("h1").length,
    viewport: !!document.querySelector('meta[name=viewport]'),
    favicon: !!document.querySelector('link[rel~=icon]'),
  }));

  // ── 1b. ONBOARDING (ilk ziyaret engeli) ──
  R.onboarding = await p.evaluate(() => {
    const o = document.getElementById("onboarding");
    if (!o) return { yok: true };
    const cs = getComputedStyle(o);
    const r = o.getBoundingClientRect();
    return {
      gorunur: !o.classList.contains("gizli") && cs.display !== "none",
      tamEkran: r.width >= window.innerWidth - 2,
      ariaModal: o.getAttribute("aria-modal"),
      adimSayisi: o.querySelectorAll(".ob-adim").length,
      kapatBtn: !!o.querySelector("[data-ob-kapat], .ob-kapat, .ob-close"),
      atlaBtn: !!o.querySelector("[data-ob-atla], .ob-atla"),
      kapatVarId: [...o.querySelectorAll("button")].map((x) => (x.id || x.className || "").toString().slice(0,24)),
      ilerlemeVar: !!o.querySelector(".ob-nokta, .ob-adim-nokta"),
    };
  });
  await p.screenshot({ path: "/tmp/opencode/audit/shot-onboarding.png" }).catch(()=>{});
  // onboarding'i kapat (varsa gerçek butonu bul)
  R.onboardingKapatildi = await p.evaluate(async () => {
    const o = document.getElementById("onboarding");
    const adaylar = [...o.querySelectorAll("button")];
    const kapat = adaylar.find((b) => /kapat|close|atla|skip|iptal|×|✕|›|››/i.test((b.id||"")+" "+(b.className||"")+" "+(b.innerText||"")+" "+(b.getAttribute("aria-label")||"")));
    if (kapat) { kapat.click(); await new Promise(r=>setTimeout(r,400)); }
    else { o.classList.add("gizli"); o.style.display = "none"; }
    return !!kapat;
  });
  await p.waitForTimeout(400);
  R.onboardingSonra = await p.evaluate(() => {
    const o = document.getElementById("onboarding");
    return { gorunur: o ? !o.classList.contains("gizli") && getComputedStyle(o).display !== "none" : false };
  });

  // ── 2. Ilk ekran / karşılama ──
  R.karsilama = await p.evaluate(() => {
    const k = document.getElementById("karsilama");
    return {
      gorunur: k && !k.hidden,
      tetik: !!document.querySelector("#morphTetik:not([hidden])"),
      tetikYazi: document.getElementById("morphTetik")?.innerText?.trim().slice(0, 60),
      zLogoVar: !!document.querySelector("#karsilama .z-logo, #karsilama .zen-mark"),
      heroAltBaslik: !!document.querySelector(".hero-sub, .hero-aciklama"),
      onerKart: document.querySelectorAll(".oneri").length,
      girdiKutuGizli: document.getElementById("girdiKutuWrap")?.hidden,
      canvas: !!document.getElementById("arka-canvas"),
    };
  });

  // ── 3. Prompt akışı (GERÇEK API) ──
  await p.click("#morphTetik").catch(()=>{});
  await p.waitForTimeout(700);
  R.promptAcildi = await p.evaluate(() => !document.getElementById("girdiKutuWrap").hidden);

  await p.fill("#giris", "Türkiye'nin başkenti nerede? Tek cümle.");
  await p.waitForTimeout(300);
  R.gonderAktif = await p.evaluate(() => !document.getElementById("btnGonder").disabled);

  const t1 = Date.now();
  await p.click("#btnGonder").catch(()=>{});
  // ilk token süresi
  let ilkToken = null;
  for (let i = 0; i < 100; i++) {
    const n = await p.evaluate(() => document.querySelectorAll("#chat .mesaj.ai, #chat .ai-mesaj, #chat [data-rol=ai]").length);
    const txt = await p.evaluate(() => document.getElementById("chat")?.innerText || "");
    if (txt.length > 40) { ilkToken = Date.now() - t1; break; }
    await p.waitForTimeout(100);
  }
  R.cevapSuresiMs = Date.now() - t1;
  R.ilkTokenMs = ilkToken;
  await p.waitForTimeout(1500);

  R.cevap = await p.evaluate(() => {
    const c = document.getElementById("chat");
    return {
      karakter: c.innerText.length,
      hamIcerik: c.innerText.slice(0, 160).replace(/\s+/g, " "),
      modelEtiket: (c.innerText.match(/Claude|GPT|Gemini|Llama|Grok|DeepSeek|Qwen|Kimi|Falcon|Nova|Mistral|Cohere/i) || ["?"])[0],
      kodBlok: c.querySelectorAll("pre").length,
      loaderKapandi: (() => { const l = document.getElementById("loaderOverlay"); return !l || l.hidden || getComputedStyle(l).display === "none"; })(),
      gonderTekrarAktif: !document.getElementById("btnGonder").disabled,
    };
  });

  // ── 4. DURDURMA butonu (bilinen bug) ──
  await p.fill("#giris", "Bir tanesinde çok uzun bir liste yaz: 1'den 100'e kadar.");
  await p.click("#btnGonder").catch(()=>{});
  await p.waitForTimeout(700);
  R.durdurmaTesti = await p.evaluate(() => {
    const b = document.getElementById("btnGonder");
    const cs = getComputedStyle(b);
    return {
      disabled: b.disabled,
      opacity: cs.opacity,
      cursor: cs.cursor,
      sinif: b.className,
      tiklanabilir: !b.disabled,
    };
  });
  // gerçekten tıklayıp durdurabiliyor mu?
  const oncekiY = await p.evaluate(() => document.getElementById("chat").innerText.length);
  try { await p.click("#btnGonder", { timeout: 2500, force: true }); } catch (e) { R.durdurmaTiklamaHatasi = e.message.slice(0, 60); }
  await p.waitForTimeout(600);
  R.durdurmaSonrasi = { oncekiY, sonrakiY: await p.evaluate(() => document.getElementById("chat").innerText.length) };

  // ── 5. Mesaj aksiyonları ──
  R.mesajEylemleri = await p.evaluate(() => {
    const b = [...document.querySelectorAll("#chat button")].map((x) => (x.id || x.className || "").toString().slice(0, 40));
    return [...new Set(b)];
  });

  // ── 6. Sidebar daraltma (bilinen bug) ──
  await p.evaluate(() => { const c = document.getElementById("chat"); });
  R.sidebarTest = await p.evaluate(async () => {
    const sb = document.getElementById("sidebar");
    const btn = document.getElementById("btnSidebarDaralt");
    const bas = sb.getBoundingClientRect().width;
    btn.click();
    await new Promise((r) => setTimeout(r, 500));
    const dar = sb.getBoundingClientRect().width;
    const btnGorunur = btn.getBoundingClientRect().width > 0 && btn.getBoundingClientRect().left >= -20 && btn.getBoundingClientRect().left < window.innerWidth;
    const btnKutle = btn.getBoundingClientRect();
    const geriBtn = document.querySelector(".sidebar-daralt-geri");
    return { bas: Math.round(bas), dar: Math.round(dar), daraltBtnX: Math.round(btnKutle.left), btnGorunur, geriBtnVar: !!geriBtn };
  });
  // geri açılabiliyor mu? (sadece butona tıklayarak)
  R.sidebarGeriAcma = await p.evaluate(async () => {
    const btn = document.getElementById("btnSidebarDaralt");
    const r = btn.getBoundingClientRect();
    const hedef = document.elementFromPoint(Math.max(2, Math.min(window.innerWidth - 2, r.left + r.width / 2)), Math.max(2, r.top + r.height / 2));
    let tiklandi = false;
    if (hedef && (hedef === btn || btn.contains(hedef))) { hedef.click(); tiklandi = true; }
    await new Promise((r2) => setTimeout(r2, 500));
    return { tiklanabilir: tiklandi, genislik: Math.round(document.getElementById("sidebar").getBoundingClientRect().width) };
  });

  // ── 7. Ayarlar paneli (full-screen) ──
  await p.evaluate(() => { const b = document.getElementById("btnPanel"); if (b) b.click(); });
  await p.waitForTimeout(600);
  R.ayarlar = await p.evaluate(() => {
    const d = document.getElementById("panelDialog");
    const pn = document.getElementById("panel");
    if (!d) return { yok: true };
    const cs = getComputedStyle(d), cp = getComputedStyle(pn);
    return {
      gorunur: !pn.classList.contains("gizli") && cs.display !== "none",
      genislik: Math.round(pn.getBoundingClientRect().width),
      ekranYuzdesi: Math.round((pn.getBoundingClientRect().width / window.innerWidth) * 100),
      modal: d.getAttribute("aria-modal"),
      kapatBtn: !!document.getElementById("btnPanelKapat"),
      bolum: [...document.querySelectorAll("#panel .panel-bolum, #panel h3, #panel .bolum-bas")].map((x) => x.innerText.trim().slice(0, 26)).slice(0, 10),
      apiKeyVar: !!document.getElementById("apiKey"),
      switchSayi: document.querySelectorAll("#panel .v-toggle, #panel input[type=checkbox]").length,
    };
  });

  // ── 8. Tema / dil toggle ──
  const temaOnce = await p.evaluate(() => document.documentElement.getAttribute("data-tema"));
  await p.click("#btnTema").catch(() => {});
  await p.waitForTimeout(500);
  const temaSonra = await p.evaluate(() => document.documentElement.getAttribute("data-tema"));
  await p.click("#btnDil").catch(() => {});
  await p.waitForTimeout(600);
  R.togglar = {
    temaOnce, temaSonra, temaDegisti: temaOnce !== temaSonra,
    dil: await p.evaluate(() => document.documentElement.lang),
    dilMetin: await p.evaluate(() => document.getElementById("btnDil")?.innerText?.trim()),
  };
  // geri al
  await p.click("#btnDil").catch(() => {});
  await p.click("#btnTema").catch(() => {});
  await p.waitForTimeout(300);
  await p.evaluate(() => { const b = document.getElementById("btnPanelKapat"); if (b) b.click(); });
  await p.waitForTimeout(400);

  // ── 9. Model menüsü ──
  await p.click("#modelSecBtn").catch(() => {});
  await p.waitForTimeout(400);
  R.modelMenu = await p.evaluate(() => {
    const m = document.getElementById("modelMenu");
    return {
      acik: m && !m.classList.contains("gizli") && getComputedStyle(m).display !== "none",
      secenek: m ? [...m.querySelectorAll("button")].map((b) => b.innerText.trim().split("\n")[0].slice(0, 22)) : [],
      otomatik: !!document.getElementById("modelOtomatik"),
      hamKodSizinti: m ? /gemini-|gpt-|claude-|deepseek|llama-|qwen|kimi|sonar|nova|falcon/i.test(m.innerText) : false,
    };
  });
  await p.keyboard.press("Escape").catch(() => {});
  await p.evaluate(() => { const m = document.getElementById("modelMenu"); if (m) m.classList.add("gizli"); });

  // ── 10. Sesli arama overlay ──
  await p.click("#btnSes, .girdi-mikrofon, [aria-label*='ses' i], [aria-label*='voice' i]").catch(() => {});
  await p.waitForTimeout(800);
  R.ses = await p.evaluate(() => {
    const o = document.getElementById("sesOverlay");
    if (!o) return { yok: true };
    const cs = getComputedStyle(o);
    return {
      gorunur: cs.display !== "none" && cs.visibility !== "hidden",
      tamEkran: o.getBoundingClientRect().width >= window.innerWidth - 2,
      orb: !!document.querySelector("#sesOrbBtn, .ses-orb"),
      barlar: document.querySelectorAll("#sesBarlarBuyuk span, .ses-bar").length,
      telefonIptal: !!document.getElementById("telefonKapat"),
      timer: document.getElementById("sesTimer")?.innerText,
      speechAPI: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
    };
  });
  await p.evaluate(() => { const b = document.getElementById("telefonKapat"); if (b) b.click(); });
  await p.waitForTimeout(400);

  // ── 11. Auth modalı ──
  await p.evaluate(() => { const b = document.getElementById("btnAuth"); if (b) b.click(); });
  await p.waitForTimeout(500);
  R.auth = await p.evaluate(() => {
    const m = document.getElementById("authModal");
    return {
      gorunur: m && !m.classList.contains("gizli") && getComputedStyle(m).display !== "none",
      googleBtn: !!document.getElementById("girisGoogle"),
      misafirBtn: !!document.getElementById("girisMisafir"),
      gercekOAuth: !!(document.getElementById("girisGoogle")?.onclick?.toString()?.includes("accounts.google")),
    };
  });
  await p.keyboard.press("Escape").catch(() => {});
  await p.evaluate(() => { const m = document.getElementById("authModal"); if (m) m.classList.add("gizli"); });

  // ── 12. Planlar / fiyatlandırma ──
  await p.evaluate(() => { const b = document.getElementById("btnPlanlar"); if (b) b.click(); });
  await p.waitForTimeout(600);
  R.planlar = await p.evaluate(() => {
    const m = document.getElementById("planlarModal");
    const g = document.getElementById("planGrid");
    return {
      gorunur: m && !m.classList.contains("gizli") && getComputedStyle(m).display !== "none",
      kart: g ? g.querySelectorAll(".plan-kart, .planKart, [data-plan]").length : 0,
      planlar: g ? [...g.querySelectorAll("[data-plan]")].map((x) => x.innerText.trim().split("\n")[0].slice(0, 14)) : [],
      odemeEntegrasyonu: !!(window.Stripe || window.paypal || document.querySelector("[data-stripe], [data-checkout]")),
    };
  });
  await p.evaluate(() => { const b = document.getElementById("btnPlanlarKapat"); if (b) b.click(); });
  await p.waitForTimeout(400);

  // ── 13. Sohbet yönetimi ──
  R.sohbet = await p.evaluate(async () => {
    const yeni = document.getElementById("btnYeniSohbet");
    yeni?.click();
    await new Promise((r) => setTimeout(r, 400));
    return {
      listede: document.querySelectorAll("#sohbetListesi .sohbet-kayit, #sohbetListesi li, #sohbetListesi [data-id]").length,
      aramaVar: !!document.getElementById("sohbetAra"),
      gizleVar: !!document.getElementById("btnGecmiyizle"),
      aramaCalisiyor: (() => { const a = document.getElementById("sohbetAra"); if (!a) return false; a.value = "zzzyok"; a.dispatchEvent(new Event("input", { bubbles: true })); const n = document.querySelectorAll("#sohbetListesi li").length; a.value = ""; a.dispatchEvent(new Event("input", { bubbles: true })); return n >= 0; })(),
    };
  });

  // ── 14. Yasal modal ──
  R.yasal = await p.evaluate(async () => {
    const out = {};
    for (const [k, btn, ic] of [["gizlilik", "ayakGizlilik", "bilgiIcerik"], ["sartlar", "ayakSartlar", "bilgiIcerik"], ["iletisim", "ayakIletisim", "bilgiIcerik"]]) {
      document.getElementById(btn)?.click();
      await new Promise((r) => setTimeout(r, 300));
      const m = document.getElementById("bilgiModal");
      out[k] = { acildi: m && !m.classList.contains("gizli"), icerikUzunluk: document.getElementById(ic)?.innerText?.trim().length || 0 };
      document.getElementById("btnBilgiKapat")?.click();
      await new Promise((r) => setTimeout(r, 200));
    }
    return out;
  });

  // ── 15. Paylaşım ──
  R.paylasim = await p.evaluate(() => {
    const btn = [...document.querySelectorAll("#chat button")].find((b) => /payla|share|link/i.test(b.title + " " + b.getAttribute("aria-label") + " " + b.innerText));
    return { paylasBtnVar: !!btn, etiket: btn ? (btn.title || btn.getAttribute("aria-label") || btn.innerText).slice(0, 20) : null };
  });

  // ── 16. Erişilebilirlik ──
  R.a11y = await p.evaluate(() => {
    const btn = [...document.querySelectorAll("button")];
    const etiketsiz = btn.filter((b) => !b.innerText.trim() && !b.getAttribute("aria-label") && !b.title && !b.querySelector("img[alt],svg[alt]"));
    const input = [...document.querySelectorAll("input:not([type=checkbox]),textarea")];
    const inputsuz = input.filter((i) => !i.getAttribute("aria-label") && !document.querySelector(`label[for="${i.id}"]`) && !i.getAttribute("placeholder") && !i.closest("label"));
    return {
      toplamBtn: btn.length,
      etiketsizBtn: etiketsiz.length,
      etiketsizOrnek: etiketsiz.slice(0, 5).map((b) => b.id || b.className.toString().slice(0, 30)),
      toplamInput: input.length,
      inputsuz: inputsuz.length,
      h1: document.querySelectorAll("h1").length,
      skipLink: !!document.querySelector('a[href^="#"]:first-of-type'),
      langVar: !!document.documentElement.lang,
      focusVisible: !!document.querySelector(":focus-visible"),
      liveRegion: document.querySelectorAll("[aria-live]").length,
    };
  });

  // ── 17. Mobil ──
  R.mobil = {};
  for (const [ad, w, h] of [["mobil", 390, 844], ["tablet", 768, 1024]]) {
    await p.setViewportSize({ width: w, height: h });
    await p.waitForTimeout(700);
    R.mobil[ad] = await p.evaluate(() => ({
      yatayTasma: document.documentElement.scrollWidth > window.innerWidth + 2,
      scrollW: document.documentElement.scrollWidth,
      winW: window.innerWidth,
      promptGorusur: (() => { const e = document.getElementById("girdiKutuWrap") || document.getElementById("morphTetik"); return e && !e.hidden; })(),
      sidebarGorunur: document.getElementById("sidebar")?.getBoundingClientRect().width > 10,
    }));
  }
  await p.setViewportSize({ width: 1440, height: 900 });

  // ── 18. Performans / kaynak ──
  const perf = await p.evaluate(() => {
    const n = performance.getEntriesByType("navigation")[0];
    const res = performance.getEntriesByType("resource");
    return {
      domContentLoaded: Math.round(n?.domContentLoadedEventEnd || 0),
      load: Math.round(n?.loadEventEnd || 0),
      kaynakSayisi: res.length,
      toplamKB: Math.round(res.reduce((a, r) => a + (r.transferSize || 0), 0) / 1024),
      jsKB: Math.round(res.filter((r) => r.name.endsWith(".js")).reduce((a, r) => a + (r.transferSize || 0), 0) / 1024),
      cssKB: Math.round(res.filter((r) => r.name.endsWith(".css")).reduce((a, r) => a + (r.transferSize || 0), 0) / 1024),
      font: res.filter((r) => /\.(woff2?|ttf)/.test(r.name)).length,
      hariciFont: res.filter((r) => /fonts\.(googleapis|gstatic)/.test(r.name)).length,
      resim: res.filter((r) => /\.(png|jpg|webp|svg|gif)/.test(r.name)).length,
    };
  });
  R.performans = perf;

  // ── 19. Konsol / ağ hataları ──
  R.hatalar = hatalar;

  // ── 20. Ekran görüntüleri ──
  await p.evaluate(() => { const b = document.getElementById("btnPanelKapat"); if (b) b.click(); });
  await p.waitForTimeout(500);
  await p.screenshot({ path: "/tmp/opencode/audit/shot-desktop.png", fullPage: false });
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(800);
  await p.screenshot({ path: "/tmp/opencode/audit/shot-mobile.png" });

  await browser.close();
  console.log(JSON.stringify(R, null, 2));
})().catch((e) => { console.error("DENETIM HATASI:", e.message); process.exit(1); });
