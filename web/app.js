/* ═══════════════════════════════════════════════════════════
   ZenAI Web — Gemini/Claude seviyesi arayüz
   Özellikler: konu→model yönlendirme, Akıl Motoru, Skills ekleme,
   MCP bağlama (JSON-RPC over HTTP rölesi), AI Meclisi, streaming,
   web arama + site okuma, sohbet geçmişi, konuşma listesi.
   ═══════════════════════════════════════════════════════════ */
const OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";
const CORS_YON = "https://api.allorigins.win/raw?url=";
const $ = (id) => document.getElementById(id);

// ── Model görünen adları ─────────────────────────────
// Kullanıcıya ham sağlayıcı model kodları değil, marka adları gösterilir.
// Dahilde (istek/aktarım) gerçek model kodu korunur.
const MODEL_AD = {
  "dots-studio/dots-3-note-preview:free": "Dots-3",
  "nvidia/nemotron-3-ultra-550b-a55b:free": "Nemotron 3",
  "poolside/laguna-s-2.1:free": "Poolside Laguna",
  "cohere/north-mini-code:free": "Cohere North Code",
};
function modelAdi(model) {
  return MODEL_AD[model] || String(model).split("/").pop().split(":")[0];
}
// Marka rozetinden gerçek model koduna dönüş (meclis seçimi vb.)
const ADAN_MODEL = {};
for (const [kod, ad] of Object.entries(MODEL_AD)) ADAN_MODEL[ad.toLowerCase().replace(/\s+/g, "-")] = kod;
function modelKod(marka) {
  if (String(marka).includes("/")) return marka;
  const anahtar = String(marka).toLowerCase().replace(/\s+/g, "-");
  return ADAN_MODEL[anahtar] || marka;
}

// ── Dil / tema / i18n ────────────────────────────────
const L = {
  tr: {
    yenikonus: "Yeni sohbet", gecmisi_gizle: "Geçmişi gizle", ayarlar: "Ayarlar ve Yetenekler", bu_cihazda: "Bu cihazda",
    model_secin: "Model seçin", model_secimi: "Model seçimi",
    model_otomatik: "Otomatik", model_otomatik_aciklama: "Konuya göre akıllı yönlendirme",
    model_manual_aciklama: "Bu modeli her cevapta kullan",
    gir_ph: "ZenAI'ye bir şey sor…",
    gir_ph_ara: "Web'de araştır…", gir_ph_dusun: "Derin düşün…", gir_ph_kanvas: "Kanvas'ta oluştur…",
    gorsel_ekle: "Görsel ekle", gorsel_buyuk: "Görsel çok büyük (en fazla 10MB).",
    ara: "Ara", dusun: "Düşün", kanvas: "Kanvas",
    morph_tetik: "Ne sormak istersin?",
    auth_baslik: "ZenAI'ye giriş yap", auth_alt: "Sohbetlerini kaydet, senkronize et ve tüm cihazlarında kullan.",
    auth_google: "Google ile devam et", auth_misafir: "Misafir olarak devam",
    auth_not: "Giriş yapmadan da kullanabilirsin — sohbetler yalnız bu cihazda saklanır.",
    giris_yap: "Giriş yap", gorsel_uretiliyor: "Görsel oluşturuluyor…",
    ses_dinle: "Konuşabilirsin…",
    planlar_btn: "Planlar ve fiyatlar", plan_yeni: "YENİ",
    planlar_baslik: "Planını seç", planlar_alt: "Dilediğin an yükselt veya düşür. İptal her zaman ücretsiz.",
    plan_populer: "POPÜLER", plan_mevvcut: "Mevcut planın",
    plan_sec_sablon: "{plan} seç",
    free_1: "Günlük 50 mesaj", free_2: "Otomatik model yönlendirme", free_3: "Web araması + site okuma", free_4: "3 skill",
    silver_1: "Günlük 500 mesaj", silver_2: "Tüm modeller serbest", silver_3: "Akıl Motoru + 10 skill", silver_4: "Sesli mesaj (5 dk/gün)",
    gold_1: "Sınırsız mesaj", gold_2: "AI Meclisi (4 model)", gold_3: "Sınırsız skill + MCP", gold_4: "Öncelikli hız (2×)",
    platinum_1: "Her şey + erken erişim", platinum_2: "Sınırsız sesli mesaj", platinum_3: "API erişimi (5 anahtar)", platinum_4: "7/24 öncelikli destek",
    ob_baslik: "ZenAI'ye hoş geldin", ob_basla: "Sormaya başla",
    ob_1_b: "Sor, olsun.", ob_1: "Ortadaki butona bas, prompt açılır. Gemini/Claude tarzı akış hemen başlar.",
    ob_2_b: "Ara · Düşün · Kanvas.", ob_2: "Prompt çubuğundaki pill'lerle mod seç: web araştırma, derin düşünme veya kod üretimi.",
    ob_3_b: "Skills + MCP.", ob_3: "Ayarlar'dan yetenek (skill) ekle, uzak MCP sunucularını bağla — aletler cevaba dahil olur.",
    ob_4_b: "Ses + model.", ob_4: "Mikrofona bas: tam ekran sesli arama. Model seçici ile otomatik yönlendirme veya sabit model.",
    not_yanilgi: "ZenAI hatalı bilgi verebilir. Önemli bilgileri doğrulayın.",
    dosya_ekle: "Dosya ekle", araclar: "Araçlar: web arama + site okuma + Akıl Motoru",
    gonder: "Gönder", sohbeti_temizle: "Sohbeti temizle", kaynak_ac: "Yetenekler ve bağlantılar",
    panel_baslik: "Yetenekler ve Bağlantılar", kenar_cubuk: "Kenar çubuğu", kenar_goster: "Kenar çubuğu göster",
    akil_route: "Akıl yönlendirme (konu→model)", kisa_yol: "Kısayol: Enter yerine Ctrl+Enter",
    mod: "Mod", sobhet_modu: "Sohbet", akil_motoru: "Akıl Motoru", meclis_modu: "AI Meclisi", meclis_modelleri: "Meclis modelleri",
    araclar_baslik: "Araçlar", web_aramasi: "Web araması", site_okuma: "Site okuma",
    skills_baslik: "Skills (Yetenekler)", skill_ekle: "＋ Ekle",
    skill_ac: "Seçili skill, cevap üretirken sistem talimatınıza eklenir.",
    mcp_baslik: "MCP Bağlantıları", mcp_bagla: "＋ Bağla",
    mcp_ac: "Uzak MCP sunucularını JSON-RPC over HTTP ile bağlayın. Bağlı aletler sohbetinize eklenir.",
    gelistirici: "Geliştirici", apikey_ph: "Sağlayıcı API key (gerekirse)",
    apikey_ac: "Key yalnız bu tarayıcı oturumunda tutulur, disk'e yazılmaz; cevaplar doğrudan sağlayıcıya gönderilir. Sunucu rölesi aktifse key gerekmez.",
    yeni_skill: "Yeni Skill", skill_ad_ph: "Skill adı (örn: Web Uzmanı)",
    skill_icerik_ph: "Sistem talimatı… Örn: 'Sen tecrübeli bir web geliştiricisisin. HTML, CSS, JS önerileri ver.'",
    kaydet: "Kaydet", mcp_sunucu: "MCP Sunucusu Bağla", mcp_ad_ph: "Sunucu adı (örn: Veritabanı)",
    mcp_uc_ph: "Uç noktası (örn: https://sunucu.com/mcp)", mcp_ac2: "Bağlandığında sunucudan alet (tool) listesi çekilir ve sohbete eklenir.",
    bagla_ve_listele: "Bağla ve aletleri listele", kapat: "Kapat",
    arama_ph: "Sohbetlerde ara…", sohbet_yok: "Henüz sohbet yok.", no_bulgu: "Eşleşen sohbet yok.",
    son_sohbetler: "Son sohbetler",
    sil: "Sil", duzenle: "Yeniden adlandır", disa_aktar: "Dışa aktar",
    kopyala: "Kopyala", yeniden_uret: "↻ Yeniden üret", hata: "Hata", dusunuyor: "düşünüyor…",
    tekrar_dene: "Tekrar dene", hata_detay: "Teknik detay",
    paylas: "Paylaş", paylas_kopyalandi: "kopyalandı", paylasilan_yuklendi: "Paylaşılan sohbet yüklendi ✓",
    hata_genel: "Bir şeyler ters gitti. Lütfen tekrar deneyin.",
    hata_auth: "API key geçersiz görünüyor. Ayarlar → Geliştirici bölümünden key'inizi kontrol edin.",
    hata_limit: "Hız limitine takıldınız (429). Biraz bekleyip tekrar deneyin.",
    hata_kredi: "Sağlayıcı kredisi bitti (402). OpenRouter hesabınızı kontrol edin.",
    hata_ag: "Ağ hatası — internet bağlantınızı kontrol edin.",
    meclis_sec: "Meclis için en az 2 model seç.", sec_mesaj: "Mesaj",
    dil_degistir: "Dil değiştir", tema_degistir: "Tema değiştir",
    gizlilik: "Gizlilik", sartlar: "Şartlar", iletisim: "İletişim",
    gizlilik_baslik: "Gizlilik Politikası",
    gizlilik_icerik: "<p>ZenAI kendi sunucusunda sohbet içeriği veya girdinizi saklamaz. Girdiler, cevap üretimi için sağlayıcıya iletilir.</p><p>Sohbetleriniz yalnız bu cihazda (tarayıcı yerel deposunda) tutulur; tarayıcı verilerini temizlediğinizde silinir.</p><p>API key'iniz sunucumuza gönderilmez, yalnız içinde bulunduğunuz oturumda doğrudan sağlayıcıya iletilir.</p>",
    sartlar_baslik: "Kullanım Şartları",
    sartlar_icerik: "<p>ZenAI bir yapay zekâ asistanıdır; ürettiği bilgiler hatalı veya güncel olmayabilir. Önemli kararlarınızda doğrulama yapın.</p><p>Yasadışı içerik üretimi, telifli materyalin izinsiz kullanımı ve kötüye kullanım yasaktır.</p><p>Hizmet, veri'de aksama durumunda kesintisizlik garantisi vermez.</p>",
    iletisim_baslik: "İletişim",
    iletisim_icerik: "<p>Geri bildirim, hata bildirimi veya işbirliği için bize ulaşabilirsiniz.</p><p><strong>GitHub:</strong> github.com/Lennebraha38/ZENAI</p><p><strong>Domain:</strong> zenai-two.vercel.app</p>",
  },
  en: {
    yenikonus: "New chat", gecmisi_gizle: "Hide history", ayarlar: "Settings & Skills", bu_cihazda: "On this device",
    model_secin: "Select model", model_secimi: "Model selection",
    model_otomatik: "Auto", model_otomatik_aciklama: "Smart routing by topic",
    model_manual_aciklama: "Use this model for every answer",
    gir_ph: "Ask ZenAI anything…",
    gir_ph_ara: "Search the web…", gir_ph_dusun: "Think deeply…", gir_ph_kanvas: "Create on canvas…",
    gorsel_ekle: "Attach image", gorsel_buyuk: "Image too large (max 10MB).",
    ara: "Search", dusun: "Think", kanvas: "Canvas",
    morph_tetik: "What would you like to ask?",
    auth_baslik: "Sign in to ZenAI", auth_alt: "Save your chats, sync them and use ZenAI on all your devices.",
    auth_google: "Continue with Google", auth_misafir: "Continue as guest",
    auth_not: "You can use ZenAI without signing in — chats are stored only on this device.",
    giris_yap: "Sign in", gorsel_uretiliyor: "Generating image…",
    ses_dinle: "You can speak now…",
    planlar_btn: "Plans & pricing", plan_yeni: "NEW",
    planlar_baslik: "Choose your plan", planlar_alt: "Upgrade or downgrade anytime. Canceling is always free.",
    plan_populer: "POPULAR", plan_mevvcut: "Your current plan",
    plan_sec_sablon: "Choose {plan}",
    free_1: "50 messages per day", free_2: "Automatic model routing", free_3: "Web search + site reading", free_4: "3 skills",
    silver_1: "500 messages per day", silver_2: "All models unlocked", silver_3: "Reasoning Engine + 10 skills", silver_4: "Voice messages (5 min/day)",
    gold_1: "Unlimited messages", gold_2: "AI Council (4 models)", gold_3: "Unlimited skills + MCP", gold_4: "Priority speed (2×)",
    platinum_1: "Everything + early access", platinum_2: "Unlimited voice messages", platinum_3: "API access (5 keys)", platinum_4: "24/7 priority support",
    ob_baslik: "Welcome to ZenAI", ob_basla: "Start asking",
    ob_1_b: "Ask away.", ob_1: "Hit the center button to open the prompt. Gemini/Claude-style streaming starts instantly.",
    ob_2_b: "Search · Think · Canvas.", ob_2: "Pick a mode with the prompt pills: web research, deep thinking or code generation.",
    ob_3_b: "Skills + MCP.", ob_3: "Add skills in Settings, connect remote MCP servers — tools join your answers.",
    ob_4_b: "Voice + model.", ob_4: "Tap the mic for full-screen voice search. Use the model picker for auto routing or a fixed model.",
    not_yanilgi: "ZenAI may produce inaccurate information. Verify important details.",
    dosya_ekle: "Attach file", araclar: "Tools: web search + site reading + Reasoning Engine",
    gonder: "Send", sohbeti_temizle: "Clear chat", kaynak_ac: "Skills & connections",
    panel_baslik: "Skills & Connections", kenar_cubuk: "Sidebar", kenar_goster: "Show sidebar",
    akil_route: "Reasoning routing (topic→model)", kisa_yol: "Shortcut: use Ctrl+Enter instead of Enter",
    mod: "Mode", sobhet_modu: "Chat", akil_motoru: "Reasoning Engine", meclis_modu: "AI Council", meclis_modelleri: "Council models",
    araclar_baslik: "Tools", web_aramasi: "Web search", site_okuma: "Site reading",
    skills_baslik: "Skills", skill_ekle: "＋ Add",
    skill_ac: "The selected skill is added to the system instructions while generating.",
    mcp_baslik: "MCP Connections", mcp_bagla: "＋ Connect",
    mcp_ac: "Connect remote MCP servers over JSON-RPC over HTTP. Connected tools join your chat.",
    gelistirici: "Developer", apikey_ph: "Provider API key (if needed)",
    apikey_ac: "The key is held only for this browser session (never written to disk) and is sent straight to the provider. Not needed when the server relay is active.",
    yeni_skill: "New Skill", skill_ad_ph: "Skill name (e.g. Web Expert)",
    skill_icerik_ph: "System instruction… E.g. 'You are an experienced web developer. Give HTML, CSS, JS advice.'",
    kaydet: "Save", mcp_sunucu: "Connect MCP Server", mcp_ad_ph: "Server name (e.g. Database)",
    mcp_uc_ph: "Endpoint (e.g. https://server.com/mcp)", mcp_ac2: "On connect, the tool list is fetched from the server and added to the chat.",
    bagla_ve_listele: "Connect & list tools", kapat: "Close",
    arama_ph: "Search chats…", sohbet_yok: "No chats yet.", no_bulgu: "No matching chats.",
    son_sohbetler: "Recent chats",
    sil: "Delete", duzenle: "Rename", disa_aktar: "Export",
    kopyala: "Copy", yeniden_uret: "↻ Regenerate", hata: "Error", dusunuyor: "thinking…",
    tekrar_dene: "Try again", hata_detay: "Technical details",
    paylas: "Share", paylas_kopyalandi: "copied", paylasilan_yuklendi: "Shared chat loaded ✓",
    hata_genel: "Something went wrong. Please try again.",
    hata_auth: "Your API key seems invalid. Check it under Settings → Developer.",
    hata_limit: "Rate limit hit (429). Wait a moment and try again.",
    hata_kredi: "Provider credit exhausted (402). Check your OpenRouter account.",
    hata_ag: "Network error — check your internet connection.",
    meclis_sec: "Select at least 2 models for the council.", sec_mesaj: "Message",
    dil_degistir: "Change language", tema_degistir: "Toggle theme",
    gizlilik: "Privacy", sartlar: "Terms", iletisim: "Contact",
    gizlilik_baslik: "Privacy Policy",
    gizlilik_icerik: "<p>ZenAI does not store your chat content or input on its own server. Inputs are forwarded to the provider to generate answers.</p><p>Your chats are kept only on this device (browser local storage); they are erased when you clear browser data.</p><p>Your API key is never sent to our server; during the session it is sent directly to the provider.</p>",
    sartlar_baslik: "Terms of Use",
    sartlar_icerik: "<p>ZenAI is an AI assistant; information it produces may be inaccurate or stale. Verify before making important decisions.</p><p>Generating illegal content, unauthorized use of copyrighted material and abuse are prohibited.</p><p>The service does not guarantee uninterrupted availability.</p>",
    iletisim_baslik: "Contact",
    iletisim_icerik: "<p>Reach out for feedback, bug reports or collaboration.</p><p><strong>GitHub:</strong> github.com/Lennebraha38/ZENAI</p><p><strong>Site:</strong> zenai-two.vercel.app</p>",
  },
};
let dil = localStorage.getItem("lb_dil") || "tr";
let tema = localStorage.getItem("lb_tema") || "koyu";
function t(k) { return (L[dil] && L[dil][k] !== undefined) ? L[dil][k] : (L.tr[k] !== undefined ? L.tr[k] : k); }
function uygulaI18n() {
  document.documentElement.lang = dil === "en" ? "en" : "tr";
  document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => (el.placeholder = t(el.dataset.i18nPh)));
  document.querySelectorAll("[data-i18n-ar]").forEach((el) => (el.setAttribute("aria-label", t(el.dataset.i18nAr))));
  document.querySelectorAll("[data-i18n-tit]").forEach((el) => (el.title = t(el.dataset.i18nTit)));
  const meta = $("metaTema");
  if (meta) meta.setAttribute("content", tema === "aydinlik" ? "#f4f6fb" : "#04060c");
}
function temaAt(yeni) {
  tema = yeni || tema;
  localStorage.setItem("lb_tema", tema);
  document.documentElement.dataset.tema = tema;
  const tg = $("btnTema");
  if (tg) tg.setAttribute("aria-checked", tema === "aydinlik" ? "true" : "false");
  uygulaI18n();
}
function dilAt(yeni) {
  dil = yeni || (dil === "tr" ? "en" : "tr");
  localStorage.setItem("lb_dil", dil);
  uygulaI18n();
  modelPiliCiz();
  skillListesiCiz();
  mcpListesiCiz();
  sohbetListesiCiz();
  modCipsCiz();
}

// ── Durum ─────────────────────────────────────────────
let mod = "tek";
let gecmis = [];
let sunucuModu = null;
let aktifSohbet = null;
let kullanicilar = 1;
let mcpSk = new Map();        // key name -> (durdum + tools listesi)
let tekrarAkis = false;

// ── Konu → Model yönlendirme (agentv2/model_routing.py ile aynı) ──
const KONU_MODELLERI = {
  kod:       ["cohere/north-mini-code:free", 65536],
  matematik: ["nvidia/nemotron-3-ultra-550b-a55b:free", 65536],
  mantik:    ["nvidia/nemotron-3-ultra-550b-a55b:free", 65536],
  bilim:     ["dots-studio/dots-3-note-preview:free", 48000],
  tarih:     ["dots-studio/dots-3-note-preview:free", 48000],
  dil:       ["dots-studio/dots-3-note-preview:free", 24000],
  yaratici:  ["dots-studio/dots-3-note-preview:free", 40000],
  kultur:    ["dots-studio/dots-3-note-preview:free", 24000],
  pratik:    ["dots-studio/dots-3-note-preview:free", 16000],
  teknoloji: ["dots-studio/dots-3-note-preview:free", 48000],
};
const KONU_YONTEM = {
  matematik: "Problemi parçala, adım adım çöz (adımları yaz). Son adımda sonucu **büyük ve net** yaz.",
  mantik: "Önermeleri ayır, kısa zincirlerle çöz, her adımı gerekçelendir.",
  kod: "Önce ne istendiğini analiz et. Kodu sözdizimi + mantık uyumlu yaz. Çalıştırılabilir örnek ver.",
  dil: "Cümleyi parçala, kuralı hatırla, örnekle pekiştir.",
  bilim: "Temel prensibi hatırla, sonra detaylandır, sonra kısa örnek ver.",
  tarih: "Dönemi hatırla, neden-sonuç zincirini kur.",
  yaratici: "Temayı kur (kim/neden/hangi ortam), sonra ton ve kategori.",
  kultur: "Bilgiyi hatırla, pratik cevap al, örnekle aç.",
  pratik: "Kısa, net, uygulanabilir. Üç adımlı cevap.",
  teknoloji: "Önce temel prensip, sonra nasıl çalıştığı, sonra neden önemli.",
};

const KONU_ANAHTAR = [
  ["kod", /\b(?:python|kod|sql|regex|fonksiyon|siralama|algoritma|javascript|react)\b/i],
  ["matematik", /\b(?:matematik|toplam|pi\b|asal|olasilik|acilar|carpım|denklem|hesapla|kactir|kacar)\b|\d+\s*[\+\-×÷*\/]\s*\d/i],
  ["mantik", /\b(?:mantik|onerme|bilmece|sudoku|kuzgun|deduksiyon)\b/i],
  ["bilim", /\b(?:bilim|fizik|kimya|dna|kuantum|foton|bio)\b/i],
  ["tarih", /\b(?:tarih|osmanli|ronesans|savas|cumhuriyet|imper)\b/i],
  ["yaratici", /\b(?:hikaye|masal|logo|manifesto|hikaye yaz|resim|slogan)\b/i],
  ["kultur", /\b(?:kahve|istanbul|sehir|bayrak|maskot|kultur)\b/i],
  ["teknoloji", /\b(?:teknoloji|context|veritabani|blockchain|gpu|yapay zeka|urun)\b/i],
];

function konuBul(soru) {
  for (const [k, re] of KONU_ANAHTAR) if (re.test(soru)) return k;
  return "pratik";
}

// ── Depolama helpers ──────────────────────────────────
const depo = {
  get(k, d) { try { return JSON.parse(localStorage.getItem("lb_" + k) || "null") ?? d; } catch (e) { return d; } },
  set(k, v) { localStorage.setItem("lb_" + k, JSON.stringify(v)); },
};

// ── Skills ────────────────────────────────────────────
let skills = depo.get("skills", [
  { ad: "Araştırmacı", ikon: "🔎", icerik: "Sen metodik bir araştırmacısın. Konuyu alt başlıklara ayır, güncel bilgiye dayalı kanıtlar sun, kaynaklardan bahset. Bulguları özetiyle kapat." },
  { ad: "Kod Uzmanı", ikon: "👨‍💻", icerik: "Sen kıdemli bir yazılım mühendisisin. İstediğin kodu önce analiz et, çalışan bir örnek ver, hata risklerini kısaca belirt. Kod bloklarını ``` ile işaretle." },
  { ad: "Matematikçi", ikon: "📐", icerik: "Sen titiz bir matematikçisin. Her adımı göster, mantığını açıkla, sonucu net ver." },
  { ad: "Yaratıcı Yazar", ikon: "✍️", icerik: "Sen hikâye anlatıcısısın. Canlı betimleme, gerçekçi diyalog ve akıcı kurgu kur. Amaç okuyucuyu içine çekmek." },
]);
let aktifSkilller = depo.get("aktifSkilller", []);

function skillKaydet() {
  depo.set("skills", skills);
  depo.set("aktifSkilller", aktifSkilller);
  skillListesiCiz();
}

function skillListesiCiz() {
  const kutu = $("skillListesi");
  if (!kutu) return;
  kutu.innerHTML = skills.length === 0
    ? '<p class="panel-aciklama">' + t("skills_baslik") + ' — "＋ Ekle"' + "</p>"
    : "";
  skills.forEach((s, i) => {
    const open = aktifSkilller.includes(i);
    const div = document.createElement("div");
    div.className = "skill-kayit" + (open ? " open" : "");
    div.innerHTML = `<span class="skill-ikon">${s.ikon}</span><span class="skill-ad">${s.ad}</span>
      <span class="mcp-durum ${open ? "bagli" : "kapali"}" style="border:none;padding:0">${open ? "on" : "off"}</span>
      <button class="skill-kaldir" title="${t("sil")}" aria-label="${t("sil")}">✕</button>`;
    div.querySelector(".skill-ad").onclick = () => {
      if (aktifSkilller.includes(i)) aktifSkilller = aktifSkilller.filter((x) => x !== i);
      else aktifSkilller.push(i);
      skillKaydet();
    };
    div.querySelector(".skill-kaldir").onclick = (e) => {
      e.stopPropagation();
      skills.splice(i, 1);
      aktifSkilller = aktifSkilller.map((x) => (x > i ? x - 1 : x)).filter((x, j) => x !== -1);
      skillKaydet();
    };
    kutu.appendChild(div);
  });
}

function skillIcerikleri() {
  return aktifSkilller
    .map((i) => skills[i])
    .filter(Boolean)
    .map((s) => `[SKILL:${s.ad}] ${s.icerik}`);
}

// ── MCP ───────────────────────────────────────────────
let mcpListesi = depo.get("mcpListesi", []);

async function mcpIstem(action, body) {
  // Sunucu rölesi /api/mcp varsa oradan, yoksa CORS köprüsü dene.
  const denemeler = [
    window.location.origin + "/api/mcp",
    null,
  ];
  const ilk = denemeler[0];
  try {
    const r = await fetch(ilk, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...body }) });
    if (r.ok) return await r.json();
    return { hata: "HTTP " + r.status };
  } catch (e) {
    return { hata: "Röle yok: " + e.message };
  }
}

async function mcpAletleriGetir(girdi) {
  const sonuc = await mcpIstem("tools", { uc: girdi.uc, proto: girdi.proto || "http" });
  if (sonuc.hata) return { durum: "hata", mesaj: sonuc.hata, aletler: [] };
  const aletler = (sonuc.tools || []).map((t) => ({
    ad: t.name, aciklama: t.description || "", parametre: (t.inputSchema && t.inputSchema.properties) || {},
  }));
  return { durum: "bagli", mesaj: aletler.length + " alet bağlandı", aletler };
}

async function mcpYenile(girdi) {
  const sonuc = await mcpAletleriGetir(girdi);
  girdi.durum = sonuc.durum;
  girdi.mesaj = sonuc.mesaj;
  girdi.aletler = sonuc.aletler;
  mcpKaydet();
  mcpListesiCiz();
}

function mcpKaydet() {
  depo.set("mcpListesi", mcpListesi);
  depo.set("mcpSk", Object.fromEntries([...mcpSk].map(([k, v]) => [k, v])));
  mcpListesiCiz();
}

function mcpListesiCiz() {
  const kutu = $("mcpListesi");
  if (!kutu) return;
  kutu.innerHTML = mcpListesi.length === 0
    ? '<p class="panel-aciklama">Henüz bağlantı yok. Veritabanı, dosya sistemi, haber kaynağı gibi alet körükleri (MCP) ekleyin.</p>'
    : "";
  mcpListesi.forEach((m) => {
    const durumBelirteci = m.durum || "kapali";
    const div = document.createElement("div");
    div.className = "mcp-kayit";
    div.innerHTML = `<span style="flex:1">
        <div style="font-size:14px;color:var(--yazi)">${m.ad}</div>
        <div style="font-size:11px;color:var(--yazi-3)">${m.uc || ""}</div>
      </span>
      <span class="mcp-durum ${durumBelirteci}" id="mcpDurum_${m.uid}">${durumBelirteci === "bagli" ? "● bağlı" : durumBelirteci === "hata" ? "! hata" : "○ kapalı"}</span>
      <button class="mcp-kaldir" title="${t("sil")}" aria-label="${t("sil")}">✕</button>`;
    div.querySelector(".mcp-kaldir").onclick = () => {
      mcpListesi = mcpListesi.filter((x) => x.uid !== m.uid);
      mcpKaydet();
    };
    kutu.appendChild(div);
  });
}

function mcpAktif() {
  return mcpListesi.filter((m) => m.durum === "bagli" && (m.aletler && m.aletler.length));
}

function mcpAletDokumu() {
  const aktif = mcpAktif();
  if (!aktif.length) return "";
  return aktif.flatMap((m) => m.aletler.map((a) => {
    const prm = Object.keys(a.parametre || {}).map((k) => `${k} (${a.parametre[k].type || "?"}): ${a.parametre[k].description || ""}`).join("; ");
    return `- ${a.ad}${prm ? " → " + prm : ""}\n  ${a.aciklama || ""}`;
  })).join("\n");
}

async function mcpAletCagir(m, aletAdi, argumanlar) {
  const sonuc = await mcpIstem("call", { uc: m.uc, proto: m.proto || "http", alet: aletAdi, argumanlar });
  if (sonuc.hata) return "Hata: " + sonuc.hata;
  const c = (sonuc.content || []);
  const metn = c.map((x) => x.text || JSON.stringify(x) || "").join(" ");
  const yapili = sonuc.isError ? null : (c.find((x) => x.type === "text")?.text || metn);
  return yapili || "Alet boş döndü";
}

// ── Canlı enerji arka planı (canvas) ────────────────────
function arkaBaslat() {
  const cv = $("arka-canvas");
  if (!cv) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const ctx = cv.getContext("2d");
  let genis = 0, yuksek = 0;
  const noktalar = Array.from({ length: 54 }, () => ({
    x: Math.random(), y: Math.random(),
    vx: (Math.random() - 0.5) * 0.00032, vy: (Math.random() - 0.5) * 0.00032,
    r: 0.6 + Math.random() * 1.5,
    t: Math.random() * 6.28,
  }));
  let fare = { x: 0.5, y: 0.5 };
  window.addEventListener("pointermove", (e) => {
    fare.x = e.clientX / Math.max(1, window.innerWidth);
    fare.y = e.clientY / Math.max(1, window.innerHeight);
  }, { passive: true });

  const boyutla = () => {
    genis = cv.width = window.innerWidth;
    yuksek = cv.height = window.innerHeight;
  };
  boyutla();
  window.addEventListener("resize", boyutla);

  function ciz() {
    ctx.clearRect(0, 0, genis, yuksek);
    const px = (fare.x - 0.5) * 26, py = (fare.y - 0.5) * 18;
    const ceyrekX = (x) => (x * genis + px + genis) % genis;
    for (const n of noktalar) {
      n.x += n.vx; n.y += n.vy;
      if (n.x < 0 || n.x > 1) n.vx *= -1;
      if (n.y < 0 || n.y > 1) n.vy *= -1;
      const kx = ceyrekX(n.x), ky = n.y * yuksek + py;
      const gibi = 0.35 + 0.65 * Math.abs(Math.sin(n.t += 0.008));
      const g = ctx.createRadialGradient(kx, ky, 0, kx, ky, n.r * 7);
      g.addColorStop(0, `rgba(62,230,216,${0.45 * gibi})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(kx, ky, n.r * 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(214,240,255,${0.32 * gibi})`;
      ctx.beginPath(); ctx.arc(kx, ky, n.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.lineWidth = 0.6;
    for (let i = 0; i < noktalar.length; i++) {
      for (let j = i + 1; j < noktalar.length; j++) {
        const a = noktalar[i], b = noktalar[j];
        const dx = (a.x - b.x) * genis, dy = (a.y - b.y) * yuksek;
        const d = Math.hypot(dx, dy);
        if (d < 120) {
          ctx.strokeStyle = `rgba(126,144,255,${0.20 * (1 - d / 120)})`;
          ctx.beginPath();
          ctx.moveTo(ceyrekX(a.x), a.y * yuksek + py);
          ctx.lineTo(ceyrekX(b.x), b.y * yuksek + py);
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(ciz);
  }
  ciz();
}

// ── Düşünme orbu (thinking-orbs port) ────────────────
// Küçük canvas animasyonu: "composing" durumu — dönen, nabız atan yumuşak küre.
// reduced-motion tercihinde statik gradyan.show.
const ORB_DURUM = {
  working:   { ciz: 7, boy: 0.30, hiz: 0.9,  renk: [[96,165,250],[129,140,248]] },
  searching: { ciz: 6, boy: 0.34, hiz: 1.25, renk: [[56,189,248],[34,211,238]] },
  solving:  { ciz: 8, boy: 0.26, hiz: 1.0,  renk: [[167,139,250],[217,70,239]] },
  composing:{ ciz: 6, boy: 0.32, hiz: 0.75, renk: [[126,180,255],[183,154,255]] },
  listening:{ ciz: 5, boy: 0.38, hiz: 0.6,  renk: [[52,211,153],[45,212,191]] },
  shaping:   { ciz: 7, boy: 0.28, hiz: 1.1,  renk: [[251,146,60],[244,114,182]] },
};
function dusunmeOrb(el, durumAd, boyut = 44) {
  if (!el) return null;
  const d = ORB_DURUM[durumAd] || ORB_DURUM.composing;
  const azHareket = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cv = document.createElement("canvas");
  cv.width = boyut * (window.devicePixelRatio > 1 ? 2 : 1);
  cv.height = cv.width;
  cv.style.width = boyut + "px";
  cv.style.height = boyut + "px";
  el.replaceChildren(cv);
  const ctx = cv.getContext("2d");
  const W = cv.width, R = W / 2;
  const rnd = () => Math.random() * Math.PI * 2;
  const noktalar = Array.from({ length: d.ciz }, () => ({ a: rnd(), r: 0, f: 0.6 + Math.random() * 0.8, faz: rnd() }));
  let durdur = false, t0 = performance.now();

  if (azHareket) {
    // statik kare: yumuşak gradyan küre
    const g = ctx.createRadialGradient(R, R, 0, R, R, R);
    g.addColorStop(0, "rgba(" + d.renk[0].join(",") + ",.85)");
    g.addColorStop(1, "rgba(" + d.renk[1].join(",") + ",.25)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(R, R, R * .82, 0, 6.29); ctx.fill();
    return () => {};
  }

  function kare(now) {
    if (durdur) return;
    const t = (now - t0) / 1000 * d.hiz;
    ctx.clearRect(0, 0, W, W);
    // çekirdek: yumuşak nabız
    const cek = 0.55 + 0.1 * Math.sin(t * 2.2);
    const g = ctx.createRadialGradient(R, R, 0, R, R, R * cek);
    g.addColorStop(0, "rgba(" + d.renk[0].join(",") + ",.55)");
    g.addColorStop(0.7, "rgba(" + d.renk[1].join(",") + ",.28)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(R, R, R * cek, 0, 6.29); ctx.fill();
    // yörünge noktaları
    noktalar.forEach((n, i) => {
      const aci = n.a + t * 1.4 * n.f;
      const yaricap = R * (0.55 + 0.3 * Math.sin(t * 1.7 + n.faz)) * (0.7 + 0.3 * n.f);
      const x = R + Math.cos(aci) * yaricap, y = R + Math.sin(aci * 0.9 + n.faz) * yaricap * 0.85;
      const rc = R * d.boy * (0.5 + 0.5 * Math.abs(Math.sin(t * 2 + i)));
      const gg = ctx.createRadialGradient(x, y, 0, x, y, rc * 3);
      gg.addColorStop(0, "rgba(" + d.renk[0].join(",") + ",.75)");
      gg.addColorStop(1, "rgba(" + d.renk[1].join(",") + ",0)");
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(x, y, rc * 3, 0, 6.29); ctx.fill();
    });
    requestAnimationFrame(kare);
  }
  requestAnimationFrame(kare);
  return () => { durdur = true; };
}

// ── Üst düzey yardımcılar ─────────────────────────────
function durum(goster, metin) {
  const el = $("durum");
  if (!el) return;
  if (goster) { el.classList.remove("hidden"); el.textContent = metin; }
  else el.classList.add("hidden");
}

async function sunucuKontrol() {
  try {
    const r = await fetch(window.location.origin + "/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "ping", messages: [] }) });
    sunucuModu = true;
    return true;
  } catch (e) { sunucuModu = false; return false; }
}

function gecerliKey() { return $("apiKey").value.trim(); }
function gecerliMaxTok() { return 16384; }

function mesajEkle(role, icerik, meta) {
  const chat = $("chat");
  chat.classList.remove("bos-merkez");
  const karsilama = $("karsilama");
  if (karsilama && !karsilama.hidden) {
    karsilama.hidden = true;
    const tetik = $("morphTetik");
    if (tetik) { tetik.hidden = false; tetik.classList.remove("kapan"); }
  }
  const wrap = document.createElement("div");
  wrap.className = "msg-yuzde " + role;
  const ikon = role === "user" ? "S" : (meta && meta.meclis ? "M" : "Z");
  wrap.innerHTML = `<div class="avatar ${role}">${ikon}</div>
    <div class="msg-govde">
      <div class="msg-kim">${role === "user" ? "Sen" : meta && meta.ad ? meta.ad : "ZenAI"}</div>
      <div class="msg-icerik"></div>
      <div class="msg-eylem"></div>
    </div>`;
  chat.appendChild(wrap);
  const govde = wrap.querySelector(".msg-icerik");
  if (role === "user") govde.textContent = icerik;
  if (meta && meta.sinyal) {
    const s = document.createElement("span");
    s.className = "msg-sinyal";
    s.innerHTML = "<i></i> route " + kaçis(meta.sinyal);
    wrap.querySelector(".msg-govde").insertBefore(s, wrap.querySelector(".msg-kim").nextSibling);
  }
  if (meta && meta.skilller) {
    meta.skilller.forEach((s) => {
      const tag = document.createElement("span");
      tag.className = "tag-skill";
      tag.textContent = s;
      govde.insertAdjacentElement("beforebegin", tag);
    });
  }
  chat.scrollTop = chat.scrollHeight;
  return wrap;
}

// ── Markdown ──────────────────────────────────────────
function kaçis(metin) {
  return metin.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
// Hafif syntax highlighting — string/yorum/anahtar kelime/sayı renklendirme
function kodBoya(kod) {
  const esc = kaçis(kod);
  return esc
    .replace(/(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)/g, '<span class="sy-yorum">$1</span>')
    .replace(/(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;|"[^"\n]*"|'[^'\n]*'|`[^`]*`)/g, '<span class="sy-str">$1</span>')
    .replace(/\b(const|let|var|function|return|if|else|for|while|class|new|import|from|export|async|await|try|catch|def|print|self|None|True|False|null|undefined|true|false|public|private|void|int|str|list|dict|SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|CREATE|TABLE)\b/g, '<span class="sy-kw">$1</span>')
    .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="sy-sayi">$1</span>');
}
function mdYazdir(el, md) {
  let html = kaçis(md);
  // kod blokları koru
  const kodBloklari = [];
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, kod) => {
    kodBloklari.push({ lang, kod });
    return `\u0000${kodBloklari.length - 1}\u0000`;
  });

  // satır bazında dönüştür
  const satirlar = html.split("\n");
  let cikti = [];
  let listeTipi = null; // "ul" | "ol" | null
  let tabloAcik = false;

  const satirIci = (s) => s
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

  for (const satir of satirlar) {
    const s = satir.trim();
    if (!s) { if (listeTipi) { listeTipi = null; } if (tabloAcik) { cikti.push("</table>"); tabloAcik = false; } continue; }

    const kodYer = s.match(/^\u0000(\d+)\u0000$/);
    if (kodYer) {
      if (listeTipi) { cikti.push("</" + listeTipi + ">"); listeTipi = null; }
      const b = kodBloklari[+kodYer[1]];
      cikti.push(`<div class="kod-kopten-wrap"><div class="kod-ust"><span class="kod-dil">${kaçis(b.lang || "kod")}</span></div><pre><code>${kodBoya(b.kod)}</code></pre><button class="kod-kopyala eylem-btn">${t("kopyala")}</button></div>`);
      continue;
    }

    let m;
    if ((m = s.match(/^(#{1,3})\s+(.*)$/))) {
      if (listeTipi) { cikti.push("</" + listeTipi + ">"); listeTipi = null; }
      const lvl = m[1].length;
      cikti.push(`<h${lvl}>${satirIci(m[2])}</h${lvl}>`);
    } else if (/^---$/.test(s)) {
      cikti.push("<hr/>");
    } else if ((m = s.match(/^&gt;\s?(.*)$/))) {
      cikti.push(`<blockquote><p>${satirIci(m[1])}</p></blockquote>`);
    } else if ((m = s.match(/^\s*[-*•]\s+(.*)$/))) {
      if (listeTipi !== "ul") { if (listeTipi) cikti.push("</" + listeTipi + ">"); cikti.push("<ul>"); listeTipi = "ul"; }
      cikti.push(`<li>${satirIci(m[1])}</li>`);
    } else if ((m = s.match(/^\s*\d+\.\s+(.*)$/))) {
      if (listeTipi !== "ol") { if (listeTipi) cikti.push("</" + listeTipi + ">"); cikti.push("<ol>"); listeTipi = "ol"; }
      cikti.push(`<li>${satirIci(m[1])}</li>`);
    } else if (/^\|.+\|$/.test(s)) {
      if (listeTipi) { cikti.push("</" + listeTipi + ">"); listeTipi = null; }
      const hucreler = s.slice(1, -1).split("|").map((c) => c.trim());
      if (hucreler.every((c) => /^:?-+:?$/.test(c))) { continue; } // ayraç satırı
      if (!tabloAcik) { cikti.push("<table><thead><tr>" + hucreler.map((c) => "<th>" + satirIci(c) + "</th>").join("") + "</tr></thead><tbody>"); tabloAcik = true; }
      else cikti.push("<tr>" + hucreler.map((c) => "<td>" + satirIci(c) + "</td>").join("") + "</tr>");
    } else {
      if (listeTipi) { cikti.push("</" + listeTipi + ">"); listeTipi = null; }
      cikti.push(`<p>${satirIci(s)}</p>`);
    }
  }
  if (listeTipi) cikti.push("</" + listeTipi + ">");
  if (tabloAcik) cikti.push("</tbody></table>");

  el.innerHTML = cikti.join("\n");

  // kod kopyala butonlarını bağla
  el.querySelectorAll(".kod-kopyala").forEach((btn) => {
    btn.addEventListener("click", () => {
      const kod = btn.parentElement.querySelector("code").textContent;
      navigator.clipboard.writeText(kod).catch(() => {});
    });
  });
}

// ── Sohbet yönetimi ───────────────────────────────────
function sohbetKaydet() {
  const list = depo.get("sohbetler", []);
  if (!aktifSohbet) return;
  const kayit = list.find((x) => x.id === aktifSohbet);
  if (!kayit) return;
  kayit.mesajlar = gecmis;
  const ilk = gecmis.find((m) => m.role === "user");
  if (ilk) kayit.baslik = ilk.content.slice(0, 40);
}
function sohbetListesiCiz() {
  const kutu = $("sohbetListesi");
  if (!kutu) return;
  const term = (($("sohbetAra") && $("sohbetAra").value) || "").trim().toLowerCase();
  const list = depo.get("sohbetler", []).filter((s) => !term || (s.baslik || "").toLowerCase().includes(term));
  kutu.innerHTML = "";
  if (list.length === 0) {
    kutu.innerHTML = `<p class="panel-aciklama" style="text-align:center;padding:22px 6px">${t(term ? "no_bulgu" : "sohbet_yok")}</p>`;
    return;
  }
  const grup = document.createElement("div");
  grup.className = "sohbet-grup-baslik";
  grup.textContent = t("son_sohbetler");
  kutu.appendChild(grup);
  list.forEach((s) => {
    const div = document.createElement("div");
    div.className = "sohbet-kayit" + (s.id === aktifSohbet ? " aktif" : "");
    div.innerHTML = `<span class="baslik" title="${t("duzenle")}">${kaçis(s.baslik || "")}</span>
      <span class="islemler">
        <button class="iy" aria-label="${t("duzenle")}" title="${t("duzenle")}">✎</button>
        <button class="ds" aria-label="${t("disa_aktar")}" title="${t("disa_aktar")}">⇩</button>
        <button class="sil" aria-label="${t("sil")}" title="${t("sil")}">✕</button>
      </span>`;
    div.querySelector(".baslik").addEventListener("click", () => sohbetAc(s.id));
    div.querySelector(".iy").addEventListener("click", (e) => {
      e.stopPropagation();
      const yeni = prompt(t("duzenle"), s.baslik || "");
      if (yeni && yeni.trim()) {
        const liste = depo.get("sohbetler", []);
        const kayit = liste.find((x) => x.id === s.id);
        if (kayit) { kayit.baslik = yeni.trim().slice(0, 60); depo.set("sohbetler", liste); }
        sohbetListesiCiz();
      }
    });
    div.querySelector(".ds").addEventListener("click", (e) => {
      e.stopPropagation();
      const disa = { uygulama: "ZenAI", disaktarma: new Date().toISOString(), sohbet: s };
      const blob = new Blob([JSON.stringify(disa, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "zenai-" + String(s.baslik || "sohbet").slice(0, 32).replace(/[^a-z0-9çğıöşüÇĞİÖŞÜ]+/gi, "_") + ".json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    });
    div.querySelector(".sil").addEventListener("click", (e) => {
      e.stopPropagation();
      const n = depo.get("sohbetler", []).filter((x) => x.id !== s.id);
      depo.set("sohbetler", n);
      if (aktifSohbet === s.id) { aktifSohbet = null; gecmis = []; $("chat").innerHTML = ""; karsilamaGoster(); }
      sohbetListesiCiz();
    });
    kutu.appendChild(div);
  });
}
function sohbetAc(id) {
  const list = depo.get("sohbetler", []);
  const kayit = list.find((x) => x.id === id);
  if (!kayit) return;
  aktifSohbet = id;
  gecmis = kayit.mesajlar || [];
  const chat = $("chat");
  chat.innerHTML = "";
  chat.classList.remove("bos-merkez");
  karsilamaGizle();
  gecmis.forEach((m) => {
    const wrap = mesajEkle(m.role, m.content);
    if (m.role === "ai") mdYazdir(wrap.querySelector(".msg-icerik"), m.content);
    else wrap.querySelector(".msg-icerik").textContent = m.content;
  });
  girdiAcikYap();
  sohbetListesiCiz();
}
function yeniSohbet() {
  sohbetKaydet();
  aktifSohbet = String(Date.now());
  gecmis = [];
  const list = depo.get("sohbetler", []);
  list.unshift({ id: aktifSohbet, baslik: "Yeni sohbet", mesajlar: [] });
  depo.set("sohbetler", list.slice(0, 30));
  $("chat").innerHTML = "";
  $("chat").classList.add("bos-merkez");
  karsilamaGoster();
  sohbetListesiCiz();
}
function karsilamaGizle() {
  const k = $("karsilama");
  if (k) k.hidden = true;
}
function karsilamaGoster() {
  const k = $("karsilama");
  if (!k) return;
  $("chat").innerHTML = "";
  $("chat").classList.add("bos-merkez");
  const tetik = $("morphTetik");
  if (tetik) { tetik.hidden = false; tetik.classList.remove("kapan"); }
  k.hidden = false;
  // girdi kutusunu kapat, morph tekrar tetiklenebilsin
  const wrap = $("girdiKutuWrap");
  if (wrap) { wrap.classList.remove("acik"); wrap.hidden = true; }
}
// Girdi kutusunu morph animasyonuyla aç (sohbet açıldığında sessiz versiyon)
function girdiAcikYap() {
  const wrap = $("girdiKutuWrap");
  if (!wrap || !wrap.hidden) return;
  const tetik = $("morphTetik");
  if (tetik) tetik.hidden = true;
  wrap.hidden = false;
  requestAnimationFrame(() => wrap.classList.add("acik"));
  gonderBtnGuncelle();
}

// ── API ───────────────────────────────────────────────
async function mega(mesajlar, model, key, mt) {
  const meta = { model, messages: mesajlar, temperature: 0.7, max_tokens: mt || gecerliMaxTok() };
  if (sunucuModu !== false) {
    try {
      const r = await fetch(window.location.origin + "/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(meta) });
      const j = await r.json();
      if (r.ok && j.content !== undefined) return j.content;
      if (String(j.error || "").includes("OPENROUTER_KEY")) sunucuModu = false;
    } catch (e) {
      if (sunucuModu === true) throw e;
      sunucuModu = false;
    }
  }
  if (!key) throw new Error("Sunucu rölesi çalışmıyor ve API key girilmedi.");
  const r = await fetch(OPENROUTER, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key }, body: JSON.stringify(meta) });
  if (!r.ok) throw new Error("HTTP " + r.status + ": " + (await r.text()).slice(0, 220));
  return (await r.json()).choices[0].message.content;
}

let akisDenetleyici = null;   // AbortController — üretimi durdurma
async function megaAkis(mesajlar, model, key, mt, onDelta) {
  const meta = { model, messages: mesajlar, temperature: 0.7, max_tokens: mt || gecerliMaxTok(), stream: true };
  const endpoint = sunucuModu !== false ? window.location.origin + "/api/chat" : OPENROUTER;
  const hdrs = sunucuModu !== false ? { "Content-Type": "application/json" } : { "Content-Type": "application/json", "Authorization": "Bearer " + key };
  if (sunucuModu === false && !key) throw new Error("Sunucu rölesi çalışmıyor ve API key girilmedi.");
  akisDenetleyici = new AbortController();
  const r = await fetch(endpoint, { method: "POST", headers: hdrs, body: JSON.stringify(meta), signal: akisDenetleyici.signal });
  if (!r.ok) {
    let msj = "HTTP " + r.status;
    try { msj = (await r.json()).error || msj; } catch (e) { msj = await r.text(); }
    if (sunucuModu !== false && String(msj).includes("OPENROUTER_KEY")) sunucuModu = false;
    throw new Error(String(msj).slice(0, 250));
  }
  if (!r.body) { throw new Error("Tarayıcın streaming desteklemiyor."); }
  const okuyucu = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = "", tam = "";
  try {
    while (true) {
      const { done, value } = await okuyucu.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const satir = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!satir.startsWith("data:")) continue;
        const veri = satir.slice(5).trim();
        if (veri === "[DONE]") continue;
        try {
          const delta = JSON.parse(veri)?.choices?.[0]?.delta?.content || "";
          if (delta) { tam += delta; if (onDelta) onDelta(delta); }
        } catch (e) { }
      }
    }
  } catch (e) {
    if (e.name === "AbortError") return tam;   // durduruldu — şimdiye kadarki akışı döndür
    throw e;
  }
  return tam;
}

// ── Web araçları ──────────────────────────────────────
async function siteCek(url) {
  try {
    const r = await fetch(CORS_YON + encodeURIComponent(url));
    return (await r.text())
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z]+;/g, " ")
      .replace(/\s+/g, " ").trim().slice(0, 3500);
  } catch (e) { return "[Site okunamadı]"; }
}
async function aramaNet(sorgu) {
  try {
    const r = await fetch(CORS_YON + encodeURIComponent("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(sorgu)));
    const html = await r.text();
    return [...html.matchAll(/result__a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g)].slice(0, 5).map((m) => {
      let link = m[1];
      const uddg = link.match(/uddg=([^&]+)/);
      if (uddg) link = decodeURIComponent(uddg[1]);
      return m[2].replace(/<[^>]+>/g, "").trim() + " | " + link;
    }).join("\n") || "[Arama sonucu yok]";
  } catch (e) { return "[Arama hatası]"; }
}
function sorudakiUrl(s) {
  const m = s.match(/\b(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9-]+(?:\.[a-zA-Z]{2,6})+(?:\/[^\s]*)?/);
  return m ? m[0] : null;
}

// ── Ana gönderim akışı ────────────────────────────────
async function sistemPromptu(konu, soyut) {
  const parcalar = [
    "Sen ZenAI'sin — Türkçe bir asistan. Claude, Gemini, ChatGPT veya GPT değilsin; adın sorulursa 'ZenAI' de.",
    "Doğrudan, net ve özlü cevap ver.",
    "KALİTE + UZUNLUK KURALI: Önce tek cümlelik doğrudan cevap. Sonra gerekirse 3-5 kısa madde veya kısa adım akışı. Cevabın uzunluğunu sorunun kapsamına göre ayarla — kullanıcı detay istedadı özet ver, irade yoksa net ve bitmiş ver. Bol tekrar, giriş/bitiş süsü, gereksiz başlık yığını yapma. Çoğu soru 100-250 kelimeyle biter; 400 kelimeyi aşma.",
  ];
  const pill = promptPillAktif();
  if (pill === "ara") {
    parcalar.push("ARAMA MODU: Güncel web verisiyle cevap ver; kaynak linklerini sona kısaca ekle.");
  } else if (pill === "kanvas") {
    parcalar.push("KANVAS MODU: Tam, çalıştırılabilir bir çözüm üret — kod bloklarını ``` ile işaretle, kısa açıklamalarla ver.");
  } else if (pill === "dusun") {
    parcalar.push("DÜŞÜNME MODU: Problemi parçalara ayır, her adımı kısa gerekçele, sonucu net kapat.");
  }
  if (soyut) {
    const y = KONU_YONTEM[konu] || KONU_YONTEM.pratik;
    parcalar.push("YÖNTEM: " + y);
    parcalar.push("AKIŞ: görünür adımları kısa tut; her adımı 1-2 cümleyle ver, sonucu en sonda tek cümleyle kapat.");
  }
  const skillCikarlari = skillIcerikleri();
  if (skillCikarlari.length) parcalar.push("AKTİF SKILLER:\n" + skillCikarlari.map((s) => "• " + s).join("\n"));
  const mcpDokum = mcpAletDokumu();
  if (mcpDokum) {
    parcalar.push("BAGLI MCP ALETLERİ (ihtiyacın olursa kullan):\n" + mcpDokum +
      "\nBir alet çağırmak için satır şu formatta olmalı: TOOL_CALL: aletAdı (parametre=değer, ...)\n" +
      "Sonucu aldıktan sonra nihai cevabını ver.");
  }
  parcalar.push("Cevaplarını **markdown** ile hafifçe biçimlendir (gerekirse başlık, madde, kod bloğu).");
  return parcalar.join("\n\n");
}

async function ajanBaglam(soru, mesajlar, konu) {
  let baglam = "";
  const url = sorudakiUrl(soru);
  if (url && $("toolSite").checked) {
    durum(true, "Site okunuyor: " + url + "…");
    baglam += "\nSİTE: " + await siteCek(url.startsWith("http") ? url : "https://" + url);
  } else if ($("toolArama").checked && aramaGerekliMi(soru, konu)) {
    const q = soru.replace(/\b(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9-]+(?:\.[a-zA-Z]{2,6})+(?:\/[^\s]*)?/g, "").trim();
    if (q && q.split(" ").length >= 3) {
      durum(true, "Web aranıyor: " + q.slice(0, 60) + "…");
      baglam += "\nARAMA: " + await aramaNet(q);
    }
  }
  if (baglam) mesajlar.push({ role: "system", content: "Gerçek web verisi (doğrulanmış):" + baglam });
}

// Sisteme neyi arayıp neyi aramayacağını söyle — web'i körü körüne kullanma.
const ARAMA_TETIK = /(20\d\d|bu\s*yıl|bu\s*ay|geçen\s*hafta|az\s*önce|bugün|dün|yarın|son\s*haber|haberleri|güncel|en\s*son|en\s*yeni|yeni\s*sürüm|son\s*sürüm|sürüm\s*notl|versiyon|çıkış\s*tarihi|çıktı\s*mı|fiyat|fiyatları|ne\s*kadar|kaç\s*para|indirim|kampanya|seçim|maç|skor|galibiyet|hava\s*durumu|açılış\s*saati|kapanış|reçete|yönetmelik|politika|dolar|euro|bitcoin|kaç\s*oldu|en\s*çok\s*(?:satılan|kullanılan|izlenen|okunan)|sıralaması|raporu)\b/i;
const ARAMA_ENGEL = /\b(hikaye|masal|şiir|roman|mektup|şarkı|slogan|senaryo|yaz\b|yazmamı|yazmak|tasarla|tasarlamak|hayal\s*et|öner\b|önerir|önerisi|tavsiye\b|fikir|fikrini|sence|senin\s*görüşün|bence|gibi\s*hissed|hissettir|yorumla?|tarif\s*ver|plan\s*hazırla|ne\s*yarap|\bisten\b)\b/i;
const ARAMA_KONU_ENGEL = { kod: 1, matematik: 1, mantik: 1, yaratici: 1 };

function aramaGerekliMi(soru, konu) {
  const s = soru.toLowerCase();
  if (!s || s.trim().split(/\s+/).length < 3) return false;   // kısa mesele mastır: arama yok
  if (ARAMA_ENGEL.test(s)) return false;                       // üretim/kişisel istek: arama yok
  if (ARAMA_TETIK.test(s)) return true;                        // güncel/haber/fiyat: ara
  if (ARAMA_KONU_ENGEL[konu]) return false;                    // kod/matematik/mantık/yaratıcı: ara
  if (/(nedir|ne\s*demek|kimdir|ne\s*işe\s*yarar|nasıl\s*çalışır|nasıl\s*yapılır|nasıl\s*(?:ölçerim|açarım|kurarım|düzeltebilirim|alabilirim|yazarım)|açıkla|açıklaması|kısaca|neresi)\s*[.?!]?\s*$/i.test(s)) return false;
  return true;
}

// MCP alet çağrısı — model `TOOL_CALL:` satırı çıkarırsa çalıştır, sonucu geri besle.
async function mcpIsle(soru, cevap, mesajlar, model) {
  const satir = cevap.split("\n").find((l) => l.trim().startsWith("TOOL_CALL:"));
  if (!satir) return cevap;
  const m = satir.match(/TOOL_CALL:\s*(\w+)\s*\((.*?)\)/s);
  if (!m) return cevap;
  const aletAd = m[1], prm = m[2];
  const argumanlar = {};
  prm.split(/\s*,\s*/).forEach((kv) => { const [k, v] = kv.split("=").map((x) => x.trim().replace(/^["']|["']$/g, "")); if (k) argumanlar[k] = v; });
  for (const svr of mcpAktif()) {
    const alet = svr.aletler.find((a) => a.ad === aletAd);
    if (!alet) continue;
    durum(true, "MCP alet çağrılıyor: " + aletAd + "…");
    const sonuc = await mcpAletCagir(svr, aletAd, argumanlar);
    durum(true, "Alet sonucu işleniyor…");
    mesajlar.push({ role: "user", content: sonuc.slice(0, 3000) });
    const devam = await mega(mesajlar, model, gecerliKey(), gecerliMaxTok());
    return devam;
  }
  return cevap;
}

async function gonder() {
  const soru = $("giris").value.trim();
  const key = gecerliKey();
  if ((!soru && !gorselDosya) || tekrarAkis) return;
  if (!key) {
    if (sunucuModu === null) await sunucuKontrol();
    if (sunucuModu === false) { alert("Sunucu rölesi yok ve API key girilmedi."); return; }
  }
  // Görsel ekliyse metne işaretle (multi-model görsel desteği ileride; şimdilik not olarak)
  const gorselNot = gorselDosya ? "\n[Görsel eklendi: " + gorselDosya.name + "]" : "";
  const tamSoru = soru + gorselNot;
  $("giris").value = "";
  otomatikBoyut();
  gorselTemizle();
  gonderBtnGuncelle();
  // Karşılama ekranındaysa girdi kutusunu aç
  girdiAcikYap();
  $("btnGonder").disabled = true;
  tekrarAkis = true;

  const konu = konuBul(tamSoru);
  if ($("swRoute") && $("swRoute").checked) modelPiliCiz(konu);

  // Pill modları: ara → web aramayı zorla; dusun → Akıl Motoru; kanvas → kod üretim modu
  const girdiPill = promptPillAktif();
  if (girdiPill === "ara") {
    $("toolArama").checked = true;
    $("toolSite").checked = true;
  }
  const soyut = mod === "akil" || girdiPill === "dusun" || girdiPill === "kanvas";

  try {
    if (mod === "meclis") return await meclisTuru(tamSoru, key), (tekrarAkis = false, $("btnGonder").disabled = false);
    // Tek / Akıl Motoru
    const aktifSkillerBu = aktifSkilller.map((i) => skills[i]).filter(Boolean);
    const wrap = mesajEkle("user", tamSoru);
    const [model, mt] = konuModel(modelSecili(), konu, tamSoru);
    const sistemi = await sistemPromptu(konu, soyut);
    const mesajlar = [
      { role: "system", content: sistemi },
      ...gecmis.slice(-14),
      { role: "user", content: tamSoru },
    ];
    await ajanBaglam(tamSoru, mesajlar, konu);

    durum(true, (soyut ? t("akil_motoru") : "ZenAI") + " — " + konu + " → " + modelAdi(model) + " " + t("dusunuyor"));
    const sinyalKonu = konu + " → " + modelAdi(model);
    const aiWrap = mesajEkle("ai", "", { skilller: aktifSkillerBu.map((s) => s.ikon + " " + s.ad), sinyal: sinyalKonu });
    const govde = aiWrap.querySelector(".msg-icerik");
    document.body.classList.add("calisiyor");

    // Tam ekran loader: AI cevabı sindirirken göster, ilk token gelince kapan.
    loaderAc();
    // Görsel üretimi istendiyse shimmer kartı da göster
    if (/görsel|resim|image|illustration|çiz(im)?|logo\s+(tasarla|yap|üret)/i.test(tamSoru)) gorselUretimGoster(true);
    const loaderKapatFn = () => { loaderKapat(); };
    let tam = "", renderT = null;
    const tazeCiz = () => {
      if (!tam) return;
      const g = document.createElement("div");
      mdYazdir(g, tam);
      const imlec = document.createElement("span");
      imlec.className = "imlec";
      g.appendChild(imlec);
      govde.querySelectorAll(".yaziyor, .dusunme-rozet").forEach((e) => e.remove());
      govde.replaceChildren(g);
      // markdown sonrası tekrar hizalı kalsın
      const c = $("chat");
      if (c.scrollHeight - c.scrollTop - c.clientHeight < 240) c.scrollTop = c.scrollHeight;
    };
    const kuyruk = () => {
      if (renderT) return;
      renderT = setTimeout(() => { renderT = null; tazeCiz(); }, 110);
    };
    const update = (p) => {
      tam += p;
      loaderKapatFn();
      clearTimeout(renderT); renderT = null;
      tazeCiz();
    };

    let cevap = await megaAkis(mesajlar, model, key, mt, update);
    if (!cevap) { govde.textContent = "(boş cevap)"; }
    else {
      const once = cevap;
      cevap = await mcpIsle(tamSoru, cevap, mesajlar, model);
      if (cevap !== once) { govde.replaceChildren(); mdYazdir(govde, cevap); }
      gecmis.push({ role: "user", content: tamSoru });
      gecmis.push({ role: "assistant", content: cevap });
      gecmis = gecmis.slice(-30);
      sohbetKaydet();
      sohbetListesiCiz();
      // token tahmini + maliyet (kabaca 4 karakter = 1 token)
      tokenSay(soru, cevap, model);
    }
    // kayan imleç: cevabın bittiğini güzelce göster
    const bitisImleci = document.createElement("span");
    bitisImleci.className = "imlec-bitirdi";
    bitisImleci.textContent = "▍";
    govde.appendChild(bitisImleci);
    setTimeout(() => bitisImleci.remove(), 1400);
    govdeEylemleri(aiWrap, govde);
  } catch (e) {
    const aiWrapHata = mesajEkle("ai");
    const govde = aiWrapHata.querySelector(".msg-icerik");
    govde.classList.add("hata-kutu");
    const kod = /HTTP (\d+)/.exec(e.message)?.[1] || "";
    let aciklama = t("hata_genel");
    if (kod === "401" || /invalid|auth/i.test(e.message)) aciklama = t("hata_auth");
    else if (kod === "429" || /rate|limit/i.test(e.message)) aciklama = t("hata_limit");
    else if (kod === "402" || /credit|quota/i.test(e.message)) aciklama = t("hata_kredi");
    else if (/network|fetch|failed/i.test(e.message)) aciklama = t("hata_ag");
    govde.innerHTML = "";
    const usts = document.createElement("div");
    usts.className = "hata-baslik";
    usts.textContent = "⚠ " + t("hata");
    const msjEl = document.createElement("div");
    msjEl.className = "hata-metin";
    msjEl.textContent = aciklama;
    const detayEl = document.createElement("details");
    detayEl.className = "hata-detay";
    detayEl.innerHTML = "<summary>" + t("hata_detay") + "</summary><pre>" + kaçis(e.message) + "</pre>";
    const tekrarBtn = document.createElement("button");
    tekrarBtn.className = "eylem-btn hata-tekrar";
    tekrarBtn.textContent = "↻ " + t("tekrar_dene");
    tekrarBtn.onclick = () => {
      $("giris").value = gecmis.filter((m) => m.role === "user").slice(-1)[0]?.content || $("giris").value;
      gonder();
    };
    govde.appendChild(usts); govde.appendChild(msjEl); govde.appendChild(detayEl); govde.appendChild(tekrarBtn);
  } finally {
    document.body.classList.remove("calisiyor");
    loaderKapat();
    gorselUretimGoster(false);
    durum(false);
    tekrarAkis = false;
    $("btnGonder").disabled = false;
    gonderBtnGuncelle();
    $("giris").focus();
  }
}

async function meclisTuru(soru, key) {
  const secilen = [...document.querySelectorAll('#meclisModelSec input:checked')].map((i) => modelKod(i.value));
  if (secilen.length < 2) { alert(t("meclis_sec")); return; }
  mesajEkle("user", soru);
  const wrap = document.createElement("div");
  wrap.className = "meclis-wrap";
  wrap.innerHTML = `<div class="meclis-baslik">⚖ AI Meclisi</div><div class="meclis-grid"></div>`;
  $("chat").appendChild(wrap);
  const grid = wrap.querySelector(".meclis-grid");
  const sozler = await Promise.all(secilen.map(async (model) => {
    const kart = document.createElement("div");
    kart.className = "meclis-card";
    kart.innerHTML = `<h4>⚛ ${modelAdi(model)}</h4><div class="content">…</div>`;
    grid.appendChild(kart);
    const icerik = kart.querySelector(".content");
    try {
      const yanit = await mega([{ role: "system", content: "Sen ZenAI meclisinin bir üyesisin. Türkçe, net cevap ver." }, { role: "user", content: soru }], model, key);
      icerik.textContent = yanit;
      return { model, yanit };
    } catch (e) { icerik.textContent = "Hata: " + e.message; return { model, yanit: null }; }
  }));
  const gecerliler = sozler.filter((s) => s.yanit);
  if (gecerliler.length >= 2) {
    durum(true, "Meclis en iyi cevabı seçiyor…");
    const liste = sozler.map((s, i) => `--- ÜYE${i + 1} (${modelAdi(s.model)}) ---\n${s.yanit}`).join("\n\n");
    try {
      const gerekce = await mega([
        { role: "system", content: "Sen AI meclisinin hakimisin. Cevapları oku, en iyisini seç, 1-2 cümle gerekçe ver. Format: 'ÜYE3 kazandı: <gerekçe>'" },
        { role: "user", content: "Soru: " + soru + "\n\n" + liste },
      ], "dots-studio/dots-3-note-preview:free", key);
      const m = gerekce.match(/ÜYE(\d+)/);
      const kazananIdx = m ? parseInt(m[1]) - 1 : 0;
      if (kazananIdx >= 0 && kazananIdx < sozler.length) {
        const kart = grid.querySelectorAll(".meclis-card")[kazananIdx];
        const el = document.createElement("div");
        el.className = "kazanan";
        el.textContent = "🏆 " + gerekce.trim().slice(0, 400);
        kart.appendChild(el);
        kart.style.borderColor = "#6ee7b7";
      }
    } catch (e) { mesajEkle("ai", "Meclis kararı alınamadı: " + e.message); }
    durum(false);
  }
}

// ── Model seçimi ──────────────────────────────────────
function konuModel(secili, konu, soru) {
  const sinir = (m) => [m[0], Math.min(m[1], 16384)];
  const hizli = ["nvidia/nemotron-3-ultra-550b-a55b:free", 4096];
  // Kısa/sohbet meseleleri („8x8“, „ismin ne“): anında cevap için hızlı model.
  const sonSoru = (soru != null ? String(soru) : (gecmis.length ? gecmis[gecmis.length - 1]?.icerik : "") || "").trim();
  const kisaMi = sonSoru && (sonSoru.split(/\s+/).length <= 7 || /^[0-9xX*/=+\-., ]+$/.test(sonSoru));
  if (kisaMi && secili === "auto") return hizli;
  // Otomatik: konu yönlendirme aktifse konuya göre, değilse varsayılan model.
  if (secili === "auto") {
    if ($("swRoute") && $("swRoute").checked && KONU_MODELLERI[konu]) return sinir(KONU_MODELLERI[konu]);
    return sinir(["dots-studio/dots-3-note-preview:free", 48000]);
  }
  const sabit = {
    "dots-studio/dots-3-note-preview:free": sinir(["dots-studio/dots-3-note-preview:free", 48000]),
    "nvidia/nemotron-3-ultra-550b-a55b:free": sinir(["nvidia/nemotron-3-ultra-550b-a55b:free", 65536]),
    "poolside/laguna-s-2.1:free": sinir(["poolside/laguna-s-2.1:free", 32768]),
  };
  return sabit[secili] || sinir(["dots-studio/dots-3-note-preview:free", 48000]);
}
function modelSecili() {
  return localStorage.getItem("lb_model") || "auto";
}
function modelPiliCiz(konu) {
  // Artık model seçimi prompt çubuğunda; sadece seçili adı güncelle.
  const secim = modelSecili();
  const adEl = $("modelSecAd");
  if (!adEl) return;
  if (secim === "auto") {
    adEl.textContent = t("model_otomatik");
  } else {
    adEl.textContent = modelAdi(secim);
  }
  modelMenuIsaretle(secim);
}
function modelMenuIsaretle(secim) {
  document.querySelectorAll(".model-menu-oge").forEach((o) => {
    const deger = o.dataset.model || "auto";
    o.setAttribute("aria-selected", deger === secim ? "true" : "false");
  });
}
function modelMenuDoldur() {
  const menu = $("modelMenu");
  if (!menu) return;
  // mevcut modelleri (Otomatik hariç) menuye ekle
  Object.keys(MODEL_AD).forEach((kod) => {
    const o = document.createElement("button");
    o.type = "button";
    o.className = "model-menu-oge";
    o.dataset.model = kod;
    o.setAttribute("role", "option");
    o.innerHTML = `<span class="mm-ikon">◆</span><span class="mm-govde"><strong>${kaçis(modelAdi(kod))}</strong><small>${t("model_manual_aciklama")}</small></span><span class="mm-check" aria-hidden="true">✓</span>`;
    o.addEventListener("click", () => {
      localStorage.setItem("lb_model", kod);
      modelPiliCiz();
      modelMenuKapat();
    });
    menu.appendChild(o);
  });
  modelMenuIsaretle(modelSecili());
}
function modelMenuKapat() {
  const menu = $("modelMenu"), btn = $("modelSecBtn");
  if (menu) menu.classList.add("hidden");
  if (btn) btn.setAttribute("aria-expanded", "false");
}

// ── Girdi boyutlandırma ───────────────────────────────
const girisEl = $("giris");
function otomatikBoyut() {
  girisEl.style.height = "auto";
  girisEl.style.height = Math.min(girisEl.scrollHeight, 160) + "px";
}
girisEl.addEventListener("input", otomatikBoyut);

// ── UI başlatma ───────────────────────────────────────
let begeniDurum = new Map();   // mesaj index → 1 | -1
function govdeEylemleri(wrap, govde) {
  const eylem = wrap.querySelector(".msg-eylem");
  const cop = document.createElement("button");
  cop.className = "eylem-btn"; cop.textContent = t("kopyala");
  cop.onclick = async () => { try { await navigator.clipboard.writeText(govde.textContent.trim()); cop.textContent = "✓"; setTimeout(() => (cop.textContent = t("kopyala")), 1200); } catch (e) { } };
  const yenile = document.createElement("button");
  yenile.className = "eylem-btn"; yenile.textContent = t("yeniden_uret");
  yenile.onclick = () => { $("giris").value = gecmis.filter((m) => m.role === "user").slice(-1)[0]?.content || ""; gonder(); };
  // paylaş
  const paylas = document.createElement("button");
  paylas.className = "eylem-btn";
  paylas.textContent = t("paylas");
  paylas.onclick = () => {
    const sohbet = { uygulama: "ZenAI", mesajlar: gecmis.slice(-16) };
    const kod = btoa(unescape(encodeURIComponent(JSON.stringify(sohbet)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const url = location.origin + location.pathname + "#s=" + kod;
    navigator.clipboard.writeText(url).then(() => {
      paylas.textContent = "✓ " + t("paylas_kopyalandi");
      setTimeout(() => (paylas.textContent = t("paylas")), 1600);
    }).catch(() => { location.hash = "s=" + kod; });
  };
  // beğen / beğenme
  const idx = [...document.querySelectorAll(".msg-yuzde.ai")].indexOf(wrap);
  const bgn = document.createElement("button");
  bgn.className = "eylem-btn bgn";
  const guncelleBgn = () => { bgn.textContent = begeniDurum.get(idx) === 1 ? "👍" : "👍🏻"; bgn.classList.toggle("secili", begeniDurum.get(idx) === 1); };
  guncelleBgn();
  bgn.onclick = () => { begeniDurum.set(idx, begeniDurum.get(idx) === 1 ? 0 : 1); guncelleBgn(); };
  const bgnme = document.createElement("button");
  bgnme.className = "eylem-btn bgn";
  const guncelleBgnme = () => { bgnme.textContent = begeniDurum.get(idx) === -1 ? "👎" : "👎🏻"; bgnme.classList.toggle("secili", begeniDurum.get(idx) === -1); };
  guncelleBgnme();
  bgnme.onclick = () => { begeniDurum.set(idx, begeniDurum.get(idx) === -1 ? 0 : -1); guncelleBgnme(); };
  eylem.appendChild(cop); eylem.appendChild(yenile); eylem.appendChild(paylas); eylem.appendChild(bgn); eylem.appendChild(bgnme);
}

// ── Token / maliyet takibi ───────────────────────────
const MODEL_FIYAT = {   // $ / 1M token (giriş+çıkış ort.) — ücretsiz tier olduğu için 0, referans için piyasa ort.
  "dots-studio/dots-3-note-preview:free": 0,
  "nvidia/nemotron-3-ultra-550b-a55b:free": 0,
  "poolside/laguna-s-2.1:free": 0,
  "cohere/north-mini-code:free": 0,
};
function tokenSay(soru, cevap, model) {
  const girisTok = Math.ceil((soru.length + (sistemPromptu ? 200 : 0)) / 4);
  const cikisTok = Math.ceil(cevap.length / 4);
  const toplam = girisTok + cikisTok;
  const kayit = depo.get("tokenler", { toplam: 0, istek: 0 });
  kayit.toplam += toplam;
  kayit.istek += 1;
  depo.set("tokenler", kayit);
  tokenGostergeYaz(toplam, cikisTok);
}
function tokenGostergeYaz(eklenen, cikis) {
  let el = $("tokenGosterge");
  if (!el) {
    el = document.createElement("span");
    el.id = "tokenGosterge";
    el.className = "token-gosterge";
    const cips = $("modCips");
    if (cips) cips.parentElement.appendChild(el); else $("girdi-alt").appendChild(el);
  }
  const k = depo.get("tokenler", { toplam: 0, istek: 0 });
  el.textContent = "⚡ " + k.toplam.toLocaleString() + " tok · " + k.istek + " istek";
  el.title = "Bu oturumda: +" + (eklenen || 0) + " (çıktı " + (cikis || 0) + ") · toplam " + k.toplam.toLocaleString() + " token";
}

function panelAcik() { return !$("panelDialog").classList.contains("hidden"); }
function panelToggle() {
  const p = $("panelDialog");
  if (!p) return;
  const acik = p.classList.contains("hidden");
  p.classList.toggle("hidden", !acik);
  if (acik) { skillListesiCiz(); mcpListesiCiz(); }
}
function planlariIsaretle() {
  const plan = localStorage.getItem("lb_plan") || "free";
  document.querySelectorAll(".plan-kart").forEach((k) => {
    const b = k.querySelector(".pk-btn");
    if (!b) return;
    const ad = k.dataset.plan;
    if (ad === plan) {
      b.classList.add("mevcut"); b.disabled = true;
      b.textContent = t("plan_mevvcut");
    } else {
      b.classList.remove("mevcut"); b.disabled = false;
      b.textContent = t("plan_sec_sablon").replace("{plan}", ad[0].toUpperCase() + ad.slice(1));
    }
  });
}

function modCipsCiz() {
  const kutu = $("modCips");
  if (!kutu) return;
  const { arama, site, skill, mcp } = {
    arama: $("toolArama").checked, site: $("toolSite").checked,
    skill: aktifSkilller.length, mcp: mcpAktif().length,
  };
  const parcalar = [];
  if (arama) parcalar.push('<span class="mod-cip acik">🌐 web arama</span>');
  if (site) parcalar.push('<span class="mod-cip">🔗 site okuma</span>');
  if (skill > 0) parcalar.push(`<span class="mod-cip acik">🎯 ${skill} skill</span>`);
  if (mcp > 0) parcalar.push(`<span class="mod-cip acik">🔌 ${mcp} MCP</span>`);
  if (mod === "akil") parcalar.push('<span class="mod-cip acik">🧠 Akıl Motoru</span>');
  if (mod === "meclis") parcalar.push('<span class="mod-cip acik">⚖ Meclis</span>');
  kutu.innerHTML = parcalar.join(" ");
}

// Model seçici (prompt çubuğu içi, input-bar estetiği)
$("modelSecBtn").onclick = (e) => {
  e.stopPropagation();
  const menu = $("modelMenu"), btn = $("modelSecBtn");
  const acik = !menu.classList.contains("hidden");
  if (acik) { modelMenuKapat(); return; }
  menu.classList.remove("hidden");
  btn.setAttribute("aria-expanded", "true");
};
document.addEventListener("click", (e) => {
  const wrap = $("modelSeciciWrap");
  if (wrap && !wrap.contains(e.target)) modelMenuKapat();
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") modelMenuKapat(); });

// ── Prompt kutusu: pill modları, görsel, ses ──────────
let promptMod = null;          // null | "ara" | "dusun" | "kanvas"
let gorselDosya = null;        // seçilen görsel File
let gorselOniz = null;         // dataURL önizleme

function promptPillAktif() { return promptMod; }

function promptPillGuncelle() {
  ["pillAra", "pillDusun", "pillKanvas"].forEach((id) => {
    const b = $(id);
    if (!b) return;
    b.classList.toggle("aktif", b.dataset.mod === promptMod);
  });
  const g = $("giris");
  if (!g) return;
  g.placeholder = promptMod === "ara" ? t("gir_ph_ara")
    : promptMod === "dusun" ? t("gir_ph_dusun")
    : promptMod === "kanvas" ? t("gir_ph_kanvas")
    : t("gir_ph");
  otomatikBoyut();
}

function gorselGoster() {
  const kutu = $("gorselOnizleme");
  if (!kutu) return;
  if (!gorselOniz) { kutu.hidden = true; kutu.replaceChildren(); return; }
  kutu.hidden = false;
  kutu.innerHTML = "";
  const k = document.createElement("div");
  k.className = "gorsel-kart";
  const img = document.createElement("img");
  img.src = gorselOniz;
  img.alt = gorselDosya ? gorselDosya.name : "görsel";
  img.addEventListener("click", () => window.open(gorselOniz, "_blank"));
  const sil = document.createElement("button");
  sil.className = "gorsel-sil";
  sil.setAttribute("aria-label", t("sil"));
  sil.textContent = "✕";
  sil.addEventListener("click", (e) => { e.stopPropagation(); gorselTemizle(); });
  k.appendChild(img); k.appendChild(sil);
  kutu.appendChild(k);
}
function gorselTemizle() {
  gorselDosya = null; gorselOniz = null;
  const gi = $("gorselGirdi");
  if (gi) gi.value = "";
  gorselGoster();
}
function gorselIsle(dosya) {
  if (!dosya) return;
  if (!dosya.type.startsWith("image/")) return;
  if (dosya.size > 10 * 1024 * 1024) { alert(t("gorsel_buyuk")); return; }
  gorselDosya = dosya;
  const fr = new FileReader();
  fr.onload = (e) => { gorselOniz = e.target.result; gorselGoster(); };
  fr.readAsDataURL(dosya);
}

function gonderBtnGuncelle() {
  const b = $("btnGonder");
  if (!b) return;
  const icerikVar = ($("giris").value.trim() !== "") || !!gorselDosya;
  b.classList.toggle("dolu", icerikVar && !tekrarAkis);
  b.classList.toggle("gonderiliyor", tekrarAkis);
}

// ── Tam ekran ses kayıt (ai-voice-input) ─────────────
let sesOvSaniye = 0, sesOvTimer = null;
function sesOvBarlariCiz() {
  const kutu = $("sesBarlarBuyuk");
  if (!kutu) return;
  kutu.innerHTML = "";
  for (let i = 0; i < 48; i++) {
    const b = document.createElement("i");
    b.style.height = (20 + Math.random() * 80) + "%";
    b.style.animationDelay = (i * 0.05) + "s";
    kutu.appendChild(b);
  }
}
function sesOverlayAc() {
  const ov = $("sesOverlay");
  if (!ov) return;
  sesOvSaniye = 0;
  $("sesTimer").textContent = "00:00";
  const m = $("sesMetin");
  if (m) m.textContent = t("ses_dinle");
  sesOvBarlariCiz();
  ov.classList.remove("hidden");
  requestAnimationFrame(() => ov.classList.add("acik", "kayitta"));
}
function sesOverlayKapat(gonder) {
  const ov = $("sesOverlay");
  if (!ov || ov.classList.contains("hidden")) return;
  if (sesOvTimer) { clearInterval(sesOvTimer); sesOvTimer = null; }
  ov.classList.remove("acik", "kayitta");
  setTimeout(() => ov.classList.add("hidden"), 260);
  if (gonder && sesOvSaniye > 0) {
    $("giris").value = "[Sesli mesaj — " + sesOvSaniye + " sn]";
    gonder();
  }
}
function sesOverlayBaslat() {
  sesOverlayAc();
  sesOvTimer = setInterval(() => {
    sesOvSaniye++;
    const el = $("sesTimer");
    if (el) el.textContent = String(Math.floor(sesOvSaniye / 60)).padStart(2, "0") + ":" + String(sesOvSaniye % 60).padStart(2, "0");
  }, 1000);
}

// ── Tam ekran AI loader (ai-loader) ──────────────────
const LOADER_DURUMLARI = [
  {
    durum: "Web'de araştırılıyor",
    satirlar: ["Web araması başlatılıyor...", "Sayfalar taranıyor...", "5 web sitesi ziyaret ediliyor...", "İçerik analiz ediliyor...", "Özet oluşturuluyor..."],
  },
  {
    durum: "Cevap analiz ediliyor",
    satirlar: ["Arama sonuçları analiz ediliyor...", "Özet oluşturuluyor...", "İlgili bilgiler kontrol ediliyor...", "Analiz tamamlanıyor...", "Model yönlendirmesi yapılıyor...", "Bağlam oluşturuluyor..."],
  },
  {
    durum: "Cevap yazılıyor",
    satirlar: ["Cümleler kuruluyor...", "Mantık zinciri doğrulanıyor...", "Markdown biçimlendiriliyor...", "Akış hızlandırılıyor...", "Son rötuşlar yapılıyor..."],
  },
];
let loaderDurumIdx = 0, loaderSatirIdx = 0, loaderTimer = null, loaderAktif = false;
function loaderSatirEkle() {
  const kutu = $("loaderSatirlar");
  if (!kutu) return;
  const grup = LOADER_DURUMLARI[loaderDurumIdx];
  const satir = document.createElement("div");
  satir.className = "loader-satir";
  const no = document.createElement("span");
  no.className = "loader-no";
  no.textContent = String(loaderSatirIdx + 1).padStart(2, "0");
  const metin = document.createElement("span");
  metin.textContent = grup.satirlar[loaderSatirIdx % grup.satirlar.length];
  satir.appendChild(no); satir.appendChild(metin);
  kutu.appendChild(satir);
  // sadece son 5 satır görünür kalsın
  while (kutu.children.length > 5) kutu.removeChild(kutu.firstChild);
  kutu.scrollTop = kutu.scrollHeight;
  loaderSatirIdx++;
  const sonrakiGrup = loaderSatirIdx % 8 === 0;
  if (sonrakiGrup) {
    loaderDurumIdx = (loaderDurumIdx + 1) % LOADER_DURUMLARI.length;
    const st = $("loaderStatus");
    if (st) st.textContent = LOADER_DURUMLARI[loaderDurumIdx].durum + "…";
    // progress mask'ı güncelle
    const mc = document.getElementById("loader-mask-circle");
    if (mc) mc.setAttribute("strokeDasharray", ((loaderDurumIdx + 1) / LOADER_DURUMLARI.length) * 754 + ", 754");
  }
}
function loaderAc() {
  const ov = $("loaderOverlay");
  if (!ov || loaderAktif) return;
  loaderAktif = true;
  loaderDurumIdx = 0; loaderSatirIdx = 0;
  $("loaderSatirlar").innerHTML = "";
  $("loaderStatus").textContent = LOADER_DURUMLARI[0].durum + "…";
  const mc = document.getElementById("loader-mask-circle");
  if (mc) mc.setAttribute("strokeDasharray", (1 / LOADER_DURUMLARI.length) * 754 + ", 754");
  ov.classList.remove("hidden");
  requestAnimationFrame(() => ov.classList.add("acik"));
  loaderSatirEkle();
  loaderTimer = setInterval(loaderSatirEkle, 1400);
}
function loaderKapat() {
  const ov = $("loaderOverlay");
  if (!ov) return;
  loaderAktif = false;
  if (loaderTimer) { clearInterval(loaderTimer); loaderTimer = null; }
  ov.classList.remove("acik");
  setTimeout(() => ov.classList.add("hidden"), 300);
}

// ── Görsel üretim kartı (image-generation) ──────────
function gorselUretimGoster(goster) {
  const k = $("gorselUretimKarti");
  if (!k) return;
  k.classList.toggle("hidden", !goster);
}

// ── Morph panel (ai-input → animated-ai-input) ───────
function morphAc() {
  const tetik = $("morphTetik");
  const wrap = $("girdiKutuWrap");
  if (!tetik || !wrap) return;
  tetik.classList.add("kapan");
  setTimeout(() => { tetik.hidden = true; }, 220);
  wrap.hidden = false;
  requestAnimationFrame(() => wrap.classList.add("acik"));
  setTimeout(() => { $("giris").focus(); gonderBtnGuncelle(); }, 340);
}
// ── Auth modal ───────────────────────────────────────
function authAc() { const m = $("authModal"); if (m) m.classList.remove("hidden"); }
function authKapat() { const m = $("authModal"); if (m) m.classList.add("hidden"); }

function obKapat() {
  const ob = $("onboarding");
  if (!ob) return;
  localStorage.setItem("lb_ob_gordu", "1");
  ob.classList.remove("acik");
  setTimeout(() => ob.classList.add("hidden"), 300);
}

// ── Olay bağlama ──────────────────────────────────────
function bagla() {
  $("btnGonder").addEventListener("click", () => {
    const b = $("btnGonder");
    if (b.classList.contains("gonderiliyor")) {
      if (akisDenetleyici) akisDenetleyici.abort();   // üretimi durdur
      return;
    }
    if (b.classList.contains("dolu")) { gonder(); return; }
    sesOverlayBaslat();                                     // boşken: tam ekran ses
  });
  $("giris").addEventListener("keydown", (e) => {
    const ctrlGerek = $("swKisaYol") && $("swKisaYol").checked;
    if (e.key === "Enter" && (ctrlGerek ? e.ctrlKey && !e.shiftKey : !e.shiftKey)) { e.preventDefault(); gonder(); }
  });
  $("giris").addEventListener("input", gonderBtnGuncelle);

  // Gemini tarzı sesli arama: orb'a bas → gönder; kırmızı buton → iptal
  if ($("sesOrbBtn")) $("sesOrbBtn").addEventListener("click", (e) => { e.stopPropagation(); sesOverlayKapat(true); });
  if ($("telefonKapat")) $("telefonKapat").addEventListener("click", (e) => { e.stopPropagation(); sesOverlayKapat(false); });

  // Tam sayfa ayarlar dialog
  if ($("pdOrtu")) $("pdOrtu").addEventListener("click", () => panelToggle());

  // Planlar
  if ($("btnPlanlar")) $("btnPlanlar").addEventListener("click", () => $("planlarModal").classList.remove("hidden"));
  if ($("btnPlanlarKapat")) $("btnPlanlarKapat").addEventListener("click", () => $("planlarModal").classList.add("hidden"));
  document.querySelectorAll(".pk-btn[data-plan]").forEach((b) => {
    b.addEventListener("click", () => {
      const plan = b.dataset.plan;
      localStorage.setItem("lb_plan", plan);
      planlariIsaretle();
      durum(true, plan.toUpperCase() + " planı seçildi — demo modunda ✓");
      setTimeout(() => durum(false), 2200);
    });
  });

  // Sidebar daralt
  if ($("btnSidebarDaralt")) $("btnSidebarDaralt").addEventListener("click", () => {
    const sb = $("sidebar");
    const daralmis = !sb.classList.contains("daralmis");
    sb.classList.toggle("daralmis", daralmis);
    $("btnSidebarDaralt").setAttribute("aria-expanded", daralmis ? "false" : "true");
    localStorage.setItem("lb_sidebar_daral", daralmis ? "1" : "");
    if (!daralmis && $("swSidebar")) $("swSidebar").checked = true;
  });

  // Morph panel
  if ($("morphTetik")) $("morphTetik").addEventListener("click", morphAc);

  // Auth
  if ($("btnAuth")) $("btnAuth").addEventListener("click", authAc);
  if ($("girisGoogle")) $("girisGoogle").addEventListener("click", () => { authKapat(); durum(true, "Google girişi yapılıyor…"); setTimeout(() => durum(false), 1600); });
  if ($("girisMisafir")) $("girisMisafir").addEventListener("click", authKapat);
  document.querySelectorAll("#authModal .modal-kutu").forEach((k) => k.addEventListener("click", (e) => e.stopPropagation()));
  if ($("authModal")) $("authModal").addEventListener("click", (e) => { if (e.target === $("authModal")) authKapat(); });

  // Model seçici: "Otomatik" seçeneği
  if ($("modelOtomatik")) $("modelOtomatik").addEventListener("click", () => {
    localStorage.setItem("lb_model", "auto");
    modelPiliCiz();
    modelMenuKapat();
  });

  // Prompt kutusu: pill modları
  ["pillAra", "pillDusun", "pillKanvas"].forEach((id) => {
    const b = $(id);
    if (!b) return;
    b.addEventListener("click", () => {
      promptMod = promptMod === b.dataset.mod ? null : b.dataset.mod;
      promptPillGuncelle();
    });
  });

  // Görsel ekleme
  if ($("btnDosya")) $("btnDosya").addEventListener("click", () => $("gorselGirdi").click());
  if ($("gorselGirdi")) $("gorselGirdi").addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) gorselIsle(e.target.files[0]);
    e.target.value = "";
  });

  // Sürükle-bırak görsel
  const kutu = $("girdiCubuk");
  if (kutu) {
    kutu.addEventListener("dragover", (e) => { e.preventDefault(); kutu.classList.add("surukle"); });
    kutu.addEventListener("dragleave", () => kutu.classList.remove("surukle"));
    kutu.addEventListener("drop", (e) => {
      e.preventDefault(); kutu.classList.remove("surukle");
      const f = [...(e.dataTransfer.files || [])].find((x) => x.type.startsWith("image/"));
      if (f) gorselIsle(f);
    });
  }

  // Yapıştırma ile görsel
  document.addEventListener("paste", (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const f = items[i].getAsFile();
        if (f) { e.preventDefault(); gorselIsle(f); break; }
      }
    }
  });

  $("btnTemizle").addEventListener("click", () => { karsilamaGoster(); gecmis = []; sohbetKaydet(); sohbetListesiCiz(); });
  $("btnYeniSohbet").addEventListener("click", yeniSohbet);
  $("btnPanel").addEventListener("click", panelToggle);
  $("btnPanelKapat").addEventListener("click", panelToggle);
  $("btnAyarlar").addEventListener("click", panelToggle);

  // mod cips
  document.querySelectorAll(".mod-chip").forEach((c) => c.addEventListener("click", () => {
    mod = c.dataset.mod;
    document.querySelectorAll(".mod-chip").forEach((x) => x.classList.remove("active"));
    c.classList.add("active");
    $("meclisModelSec").classList.toggle("hidden", mod !== "meclis");
    modelPiliCiz();
    modCipsCiz();
  }));

  // skills
  $("btnSkillEkle").addEventListener("click", () => { $("skillModal").classList.remove("hidden"); $("btnSkillKaydet").onclick = () => { adKaydet("skill"); }; });
  function adKaydet(tur) {
    if (tur === "skill") {
      const ad = $("skillAd").value.trim(), ic = $("skillIcerik").value.trim();
      if (!ad || !ic) { alert("Ad ve içerik zorunlu."); return; }
      skills.push({ ad, ikon: "📦", icerik: ic });
      aktifSkilller.push(skills.length - 1);
      skillKaydet(); $("skillModal").classList.add("hidden");
      $("skillAd").value = ""; $("skillIcerik").value = ""; modCipsCiz();
    }
  }
  $("btnMcpEkle").addEventListener("click", () => { $("mcpModal").classList.remove("hidden"); $("btnMcpBagla").onclick = async () => { await mcpBaglaModal(); }; });
  async function mcpBaglaModal() {
    const ad = $("mcpAd").value.trim(), uc = $("mcpUc").value.trim(), proto = $("mcpProto").value;
    if (!ad || !uc) { alert("Ad ve uç noktası zorunlu."); return; }
    const girdi = { uid: Date.now(), ad, uc, proto, durum: "kapali", aletler: [] };
    mcpListesi.push(girdi);
    mcpKaydet();
    $("mcpModal").classList.add("hidden");
    durum(true, "MCP sunucusuna bağlanılıyor: " + ad + "…");
    await mcpYenile(girdi);
    durum(false);
    modCipsCiz();
    $("mcpAd").value = ""; $("mcpUc").value = "";
  }

  // modal kapat (arka plana tıklayınca)
  document.querySelectorAll(".modal").forEach((m) => m.addEventListener("click", (e) => { if (e.target === m) m.classList.add("hidden"); }));

  // side-bar geçmiş
  if ($("swGecmis")) $("swGecmis").addEventListener("change", (e) => { $("sohbetListesi").style.display = e.target.checked ? "" : "none"; });
  if ($("swSidebar")) $("swSidebar").addEventListener("change", (e) => {
    const sb = $("sidebar");
    if (e.target.checked) { sb.classList.remove("daralmis"); $("btnSidebarDaralt").setAttribute("aria-expanded", "true"); localStorage.removeItem("lb_sidebar_daral"); }
    else { sb.style.display = "none"; }
  });
  if ($("swRoute")) $("swRoute").addEventListener("change", () => { modelPiliCiz(); });
  if ($("swKisaYol")) $("swKisaYol").addEventListener("change", () => { });

  // sohbet arama
  if ($("sohbetAra")) $("sohbetAra").addEventListener("input", sohbetListesiCiz);

  // araç değişimi cips
  if ($("toolArama")) $("toolArama").addEventListener("change", modCipsCiz);
  if ($("toolSite")) $("toolSite").addEventListener("change", modCipsCiz);

  // dil ve tema
  if ($("btnDil")) $("btnDil").addEventListener("click", () => dilAt());
  if ($("btnTema")) $("btnTema").addEventListener("click", () => temaAt(tema === "aydinlik" ? "koyu" : "aydinlik"));

  // yasal / güven sayfaları
  const bilgiAc = (tur) => {
    $("#bilgiBaslik").textContent = t(tur + "_baslik");
    $("#bilgiIcerik").innerHTML = t(tur + "_icerik");
    $("#bilgiModal").classList.remove("hidden");
  };
  if ($("ayakGizlilik")) $("ayakGizlilik").addEventListener("click", (e) => { e.preventDefault(); bilgiAc("gizlilik"); });
  if ($("ayakSartlar")) $("ayakSartlar").addEventListener("click", (e) => { e.preventDefault(); bilgiAc("sartlar"); });
  if ($("ayakIletisim")) $("ayakIletisim").addEventListener("click", (e) => { e.preventDefault(); bilgiAc("iletisim"); });
  if ($("btnBilgiKapat")) $("btnBilgiKapat").addEventListener("click", () => $("bilgiModal").classList.add("hidden"));

  // Onboarding turu — ilk ziyarette göster
  if (!localStorage.getItem("lb_ob_gordu")) {
    const ob = $("onboarding");
    if (ob) {
      ob.classList.remove("hidden");
      requestAnimationFrame(() => ob.classList.add("acik"));
    }
  }
  if ($("btnObBasla")) $("btnObBasla").addEventListener("click", obKapat);
  if ($("btnObKapat")) $("btnObKapat").addEventListener("click", obKapat);

  // API key: kalıcı depolama yok — yalnız bu oturum
  $("apiKey").value = sessionStorage.getItem("lb_key") || "";
  $("apiKey").addEventListener("input", () => sessionStorage.setItem("lb_key", $("apiKey").value.trim()));
}

// ── Başlangıç ─────────────────────────────────────────
(async function baslangic() {
  arkaBaslat();
  temaAt();
  uygulaI18n();
  // Paylaşılan sohbet linki: #s=<base64> → sohbeti yükle
  const hash = location.hash.match(/[#&]s=([A-Za-z0-9\-_]+)/);
  if (hash) {
    try {
      const json = decodeURIComponent(escape(atob(hash[1].replace(/-/g, "+").replace(/_/g, "/"))));
      const veri = JSON.parse(json);
      if (veri && Array.isArray(veri.mesajlar)) {
        gecmis = veri.mesajlar;
        aktifSohbet = "paylasilan-" + Date.now();
        const chat = $("chat");
        chat.classList.remove("bos-merkez");
        karsilamaGizle();
        gecmis.forEach((m) => {
          const wrap = mesajEkle(m.role, m.content);
          if (m.role === "ai" || m.role === "assistant") mdYazdir(wrap.querySelector(".msg-icerik"), m.content);
          else wrap.querySelector(".msg-icerik").textContent = m.content;
        });
        girdiAcikYap();
        durum(true, t("paylasilan_yuklendi"));
        setTimeout(() => durum(false), 2400);
      }
    } catch (e) { }
  }
  try {
    if (await sunucuKontrol()) {
      const kutu = $("apiKey");
      kutu.placeholder = t("apikey_ph") + " ✓";
    }
  } catch (e) { }
  modelPiliCiz();
  modelMenuDoldur();
  skillListesiCiz();
  mcpListesiCiz();
  bagla();
  sohbetListesiCiz();
  planlariIsaretle();
  // sidebar daralmışsa koru
  if (localStorage.getItem("lb_sidebar_daral")) {
    $("sidebar").classList.add("daralmis");
    const d = $("btnSidebarDaralt");
    if (d) d.setAttribute("aria-expanded", "false");
  }
  // İlk açılış: karsilama (morph tetikleyici) görünür, girdi kutusu kapalı
  const kars = $("karsilama");
  if (kars) kars.hidden = false;
  promptPillGuncelle();
  gonderBtnGuncelle();
  $("giris").focus();
})();

// test ortamı için dışa aktarımlar
window.LB = { gonder, mdYazdir, konuBul, aramaGerekliMi, skills: () => skills, mcpListesi: () => mcpListesi };