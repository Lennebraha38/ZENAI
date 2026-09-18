// ZenAI VOICE — Vercel serverless SSE (HUD sözleşmesi, OpenRouter :free).
// Beynin KONU_MODELLERI/sistem prompt mantığını çağırmadan, chat.js ile aynı
// güvenlik katmanını (CORS allowlist, rate-limit, token) kullanır; OpenRouter
// SSE'ini HUD'un "faz"/"answer" delta biçimine çevirir.
// Uç: POST /api/voice  {model:"chat", messages:[...], stream:true}
const OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";
const GROQ = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_HIZLI = process.env.GROQ_FAST_MODEL || "llama-3.3-70b-versatile";
const GROQ_ULTRA = process.env.GROQ_ULTRA_MODEL || "llama-3.1-8b-instant";
const MAKS_TOKEN = 16384;
const MAKS_MESAJ = 60000;
const ALAN_BASINA = 30;

const MODELLER = {
  kod: "cohere/north-mini-code:free",
  matematik: "nvidia/nemotron-3-ultra-550b-a55b:free",
  mantik: "nvidia/nemotron-3-ultra-550b-a55b:free",
  bilim: "dots-studio/dots-3-note-preview:free",
  tarih: "dots-studio/dots-3-note-preview:free",
  dil: "dots-studio/dots-3-note-preview:free",
  yaratici: "dots-studio/dots-3-note-preview:free",
  kultur: "dots-studio/dots-3-note-preview:free",
  pratik: "dots-studio/dots-3-note-preview:free",
  teknoloji: "dots-studio/dots-3-note-preview:free",
};
const VARSAYILAN = "dots-studio/dots-3-note-preview:free";

function izinliOrigin(req) {
  const izin = (process.env.ZENAI_ORIGIN || "https://zenai-two.vercel.app")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.origin;
  if (!origin) return true;
  return izin.includes(origin);
}

function tokenOnay(req) {
  const beklenen = process.env.ZENAI_ACCESS_TOKEN;
  if (!beklenen) return true;
  const gelen = (req.headers["x-zenai-token"] || req.headers.authorization || "")
    .replace(/^Bearer\s+/i, "").trim();
  return gelen === beklenen;
}

const pencere = new Map();
function rateLimit(req, maks = ALAN_BASINA) {
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim()
    || req.socket?.remoteAddress || "?";
  const simdi = Date.now();
  const esik = simdi - 60000;
  const gelen = (pencere.get(ip) || []).filter((t) => t > esik);
  if (gelen.length >= maks) { pencere.set(ip, gelen); return true; }
  pencere.set(ip, gelen.concat([simdi]));
  return false;
}

function konu_sec(soru) {
  const s = String(soru || "").toLowerCase();
  if (/(kod|python|javascript|fonksiyon|derleyi|hata ver|script|api)/.test(s)) return "kod";
  if (/(matematik|hesapla|kaç|kac|topla|carp|integral|denklem|yüzde|yuzde)/.test(s)) return "matematik";
  if (/(mantik|mantık|nedir.*neden|çıkarım|cikarim|varsa)/.test(s)) return "mantik";
  if (/(bilim|fizik|kimya|biyoloji|molekül|hücre|hucre|atom)/.test(s)) return "bilim";
  if (/(tarih|savaş|savas|imparator|osmanlı|osmanli|yıl|yil)/.test(s)) return "tarih";
  if (/(dil|gramer|cümle|cumle|anlam|sözcük|sozcuk)/.test(s)) return "dil";
  if (/(hikaye|şiir|siir|yarat|öykü|oyku|senaryo)/.test(s)) return "yaratici";
  if (/(kültür|kultur|gelenek|yemek|ülke|ulke)/.test(s)) return "kultur";
  if (/(pratik|öneri|oneri|nasıl|nasil|ipucu)/.test(s)) return "pratik";
  if (/(teknoloji|yapay zeka|bilgisayar|yazılım|yazilim|donanım|donanim)/.test(s)) return "teknoloji";
  return "pratik";
}

function olay(delta) {
  return "data: " + JSON.stringify({
    id: "chatcmpl-zenai-voice",
    object: "chat.completion.chunk",
    created: 0,
    model: "zenai-voice",
    choices: [{ index: 0, delta }],
  }) + "\n\n";
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin && izinliOrigin(req)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-zenai-token, x-zenai-mode");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST gerekli" });

  if (req.headers.origin && !izinliOrigin(req)) {
    return res.status(403).json({ error: "Kaynak engellendi (CORS allowlist)" });
  }
  if (!tokenOnay(req)) return res.status(401).json({ error: "Yetkisiz" });
  if (rateLimit(req)) return res.status(429).json({ error: "Cok fazla istek" });

  const KEY = process.env.OPENROUTER_KEY || "";
  const GROQ_KEY = process.env.GROQ_API_KEY || "";
  if (!KEY && !GROQ_KEY) return res.status(500).json({ error: "Sunucuda OPENROUTER_KEY/GROQ_API_KEY yok" });

  const { model = "chat", messages, max_tokens = 8192 } = req.body || {};
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "messages (liste) gerekli" });
  }
  let soru = "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const c = String(messages[i]?.content || "").trim();
    if (messages[i]?.role === "user" && c) { soru = c; break; }
  }
  if (!soru) return res.status(400).json({ error: "kullanici mesaji bos" });

  const mod = ["ajan", "rapor"].includes(String(model).toLowerCase())
    ? String(model).toLowerCase() : "chat";
  const kisaMi = soru && (soru.trim().split(/\s+/).length <= 7
    || /^[0-9xX*/=+\-., ]+$/.test(soru.trim()));
  const konu = kisaMi ? "hizli" : konu_sec(soru);
  // Groq varsa: kısa sorular Groq donanımına (0.3 sn ilk token), uzunlar konu
  // modeline (OpenRouter). Groq gemlenirse OpenRouter kısa modeline düşülür.
  const groqHisli = GROQ_KEY && kisaMi;
  const or_model = kisaMi
    ? "nex-agi/nex-n2.5-mini:free"
    : (MODELLER[konu] || VARSAYILAN);
  const mt = Math.min(Number(max_tokens) || 8192, MAKS_TOKEN);

  // Sesli sistem promptu: kisa, konuşulabilir (web/app.js KONU_YONTEM uyumlu ton)
  const sistem = "Sen ZenAI'sin — Türkçe sesli asistan. Claude, Gemini veya ChatGPT değilsin; adın sorulursa 'ZenAI' de. ÇOK HIZLI CEVAP VER: 1-3 kısa cümle, ilk cümlede doğrudan cevabı söyle. 'Şöyle açıklayayım', 'Aslında bakarsan', 'Öncelikle' gibi giriş ifadelerini ATLA — direkt cevaba gir. Uzun açıklama, liste ve madde YAPMA. Toplam 4 saniyede bitmeli, doğal ve sıcak konuş.";
  const govde = {
    model: or_model,
    messages: [{ role: "system", content: sistem }, ...messages.slice(-6)],
    max_tokens: Math.min(mt, 512),
    temperature: 0.7,
    stream: true,
  };

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");

  // Groq için de genişleyen SSE akış okuyucusu (OpenRouter/Groq ortak format)
  async function sseAkisi(adres, anahtar, govde) {
    const r = await fetch(adres, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + anahtar },
      body: JSON.stringify(govde),
    });
    if (!r.ok) {
      const hata = (await r.text()).slice(0, 200);
      throw new Error("SSE " + r.status + " " + hata);
    }
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let tampon = "";
    let parca = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      tampon += decoder.decode(value, { stream: true });
      let i;
      while ((i = tampon.indexOf("\n")) >= 0) {
        const satir = tampon.slice(0, i).trim();
        tampon = tampon.slice(i + 1);
        if (!satir.startsWith("data: ")) continue;
        const g = satir.slice(6);
        if (g === "[DONE]") continue;
        try {
          const j = JSON.parse(g);
          const d = j.choices?.[0]?.delta?.content || "";
          if (d) {
            parca += d;
            res.write(olay({ type: "answer", role: "assistant", content: d }));
          }
        } catch { /* bozuk satir: atla */ }
      }
    }
    return parca;
  }

  try {
    res.write(olay({ type: "faz", faz: "hazirlaniyor", durum: "dusunuyor",
      detay: (groqHisli ? "groq-" : "") + (konu || "chat") + " · " + String(or_model).split("/")[1], content: "" }));

    let parca = "";
    if (groqHisli) {
      // 1) Groq donanımı (ilk token ~0.3 sn)
      try {
        res.write(olay({ type: "faz", faz: "dusunuyor", durum: "dusunuyor",
          detay: "groq · " + GROQ_ULTRA, content: "" }));
        govde.model = GROQ_ULTRA;
        parca = await sseAkisi(GROQ, GROQ_KEY, govde);
      } catch (e) {
        res.write(olay({ type: "faz", faz: "yedek", durum: "hizli", detay: "Groq sikisti → OpenRouter", content: "" }));
        govde.model = or_model;
        parca = await sseAkisi(OPENROUTER, KEY, govde);
      }
    } else {
      govde.model = or_model;
      parca = await sseAkisi(OPENROUTER, KEY, govde);
    }

    res.write(olay({ type: "faz", faz: "tamamlandi", durum: "konusuyor",
      detay: String(parca.length), content: "" }));
    return res.end("data: [DONE]\n\n");
  } catch (e) {
    res.write(olay({ type: "faz", faz: "hata", durum: "hata",
      detay: String(e.message || e).slice(0, 200), content: "" }));
    return res.end("data: [DONE]\n\n");
  }
}