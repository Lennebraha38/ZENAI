// ZenAI sunucu rölesi (Vercel Serverless).
// Kullanıcı ASLA key görmez/girmez — key sadece burada (env OPENROUTER_KEY).
// Güvenlik: opsiyonel ZENAI_ACCESS_TOKEN, IP bazlı rate-limit, CORS allowlist,
// max_tokens/mesaj boyutu sınırı (kötüye kullanım koruması).
const OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";
const GROQ = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_ULTRA = process.env.GROQ_ULTRA_MODEL || "llama-3.1-8b-instant";

const MAKS_TOKEN = 16384;      // istemcinin isteyebileceği üst sınır
const MAKS_MESAJ = 60000;      // serileştirilmiş mesaj boyutu (karakter)
const ALAN_BASINA = 30;        // 60 sn'de IP başına maks istek

// ── CORS: sadece izin verilen kökler ──
function izinliOrigin(req) {
  const izin = (process.env.ZENAI_ORIGIN || "https://zenai-two.vercel.app")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.origin;
  if (!origin) return true; // sunucu-tarafı / curl — CORS başlığı zaten yok
  return izin.includes(origin);
}

// ── Opsiyonel token: ZENAI_ACCESS_TOKEN tanımlıysa zorunlu ──
function tokenOnay(req) {
  const beklenen = process.env.ZENAI_ACCESS_TOKEN;
  if (!beklenen) return true;
  const gelen = (req.headers["x-zenai-token"] || req.headers.authorization || "")
    .replace(/^Bearer\s+/i, "").trim();
  return gelen === beklenen;
}

// ── Basit pencere throttling (bellek içi; tek warm instance). ──
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

export default async function handler(req, res) {
  // CORS başlıklarını her yanıt için tek noktadan kur
  const origin = req.headers.origin;
  if (origin && izinliOrigin(req)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-zenai-token");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST gerekli" });

  if (req.headers.origin && !izinliOrigin(req)) {
    return res.status(403).json({ error: "Kaynak engellendi (CORS allowlist)" });
  }
  if (!tokenOnay(req)) {
    return res.status(401).json({ error: "Yetkisiz: geçerli bir erişim belirteci gerekli" });
  }
  if (rateLimit(req)) {
    return res.status(429).json({ error: "Çok fazla istek, 60 saniye sonra tekrar dene" });
  }

  const KEY = process.env.OPENROUTER_KEY || "";
  if (!KEY) {
    return res.status(500).json({ error: "Sunucuda OPENROUTER_KEY yok. Vercel -> Settings -> Environment Variables -> OPENROUTER_KEY ekle." });
  }
  const GROQ_KEY = process.env.GROQ_API_KEY || "";

  const { model, messages, temperature = 0.7, max_tokens = 8192, stream = false } = req.body || {};
  if (!model || !messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "model ve messages gerekli" });
  }
  const mt = Math.min(Number(max_tokens) || 8192, MAKS_TOKEN);
  const temp = Math.min(Math.max(Number(temperature) || 0.7, 0), 2);
  let govdeBoyu = 0;
  try { govdeBoyu = JSON.stringify(messages).length; } catch { govdeBoyu = MAKS_MESAJ + 1; }
  if (govdeBoyu > MAKS_MESAJ) {
    return res.status(400).json({ error: "Mesaj çok büyük" });
  }

  // Kısa meseleler (<=7 kelime veya saf hesaplama) Groq'a gider — ilk token
  // ~0.3 sn (OpenRouter free kuyruğu 1-3 sn sürebilir). Groq key yoksa veya
  // hata verirse otomatik OpenRouter'a düşülür; Vercel bozulmaz.
  const sonSoru = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const c = String(messages[i]?.content || "").trim();
      if (messages[i]?.role === "user" && c) return c;
    }
    return "";
  })();
  const kisaMi = sonSoru && (sonSoru.split(/\s+/).length <= 7
    || /^[0-9xX*/=+\-., ]+$/.test(sonSoru));
  const groqAktif = GROQ_KEY && kisaMi;

  async function openaiCagri(adres, anahtar, govde) {
    const r = await fetch(adres, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + anahtar },
      body: JSON.stringify(govde),
    });
    if (!r.ok) {
      let hata = "";
      try { hata = (await r.text()).slice(0, 200); } catch (e) { }
      throw new Error("HTTP " + r.status + " " + hata);
    }
    return r;
  }

  try {
    const govde = { model: groqAktif ? GROQ_ULTRA : model, messages, temperature: temp, max_tokens: mt, stream };
    let r;
    if (groqAktif) {
      try {
        r = await openaiCagri(GROQ, GROQ_KEY, govde);
      } catch (e) {
        // Groq yok/bozuk → OpenRouter (free kuyruğu, ~1-3 sn)
        r = await openaiCagri(OPENROUTER, KEY, { ...govde, model });
      }
    } else {
      r = await openaiCagri(OPENROUTER, KEY, govde);
    }

    if (stream) {
      // SSE'yi olduğu gibi bayraktan geçir
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value));
      }
      return res.end();
    }

    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data?.error?.message || JSON.stringify(data).slice(0, 300) });
    return res.json({ content: data.choices?.[0]?.message?.content || "" });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e).slice(0, 300) });
  }
}