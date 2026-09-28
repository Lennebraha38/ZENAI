// ZenAI görsel üretim rölesi (Vercel Serverless).
// Kullanıcı key'i ASLA girmez/görmez — röle burada çalışır (chat.js deseni).
// Görsel-çıktı veren OpenRouter modeli: google/gemini-2.5-flash-image (ucuz, gerçek görsel).
// Güvenlik: CORS allowlist + opsiyonel token + IP rate-limit + prompt boyutu sınırı.
const OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash-image";
const MAKS_PROMPT = 2000;      // karakter
const MAKS_YANIT = 16;         // 60 sn'de IP başına görsel üretimi
const MAKS_ONIZ = 16 * 1024 * 1024; // dönen görselin karakter üst sınırı

// Görsel modeline istenecek AZAMİ token sayısı.
//
// NEDEN 16384 DEĞİL: OpenRouter istenen azami token'ın HESABIN KREDİSİYLE
// karşılanabileceğini baştan denetler. 16384 istendiğinde bu hesabın bütçesi
// yetmediği için istek HİÇ ÇALIŞMADAN reddediliyordu ("you can only afford
// 3262") ve görsel üretimi tamamen bozuktu. Tek bir 1:1 görsel ~1-1.5K token
// tutar; 3000 hem bütçeye sığar hem görseli kesmez.
const MAKS_TOKEN = Number(process.env.OPENROUTER_IMAGE_MAX_TOKENS) || 3000;

// ── CORS: sadece izin verilen kökler ──
function izinliOrigin(req) {
  const izin = (process.env.ZENAI_ORIGIN || "https://zenai-two.vercel.app")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.origin;
  if (!origin) return true;
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

// ── Basit pencere throttling (bellek içi; tek warm instance) ──
const pencere = new Map();
function rateLimit(req, maks = MAKS_YANIT) {
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
  const origin = req.headers.origin;
  if (origin && izinliOrigin(req)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-zenai-token");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST gerekli" });

  if (req.headers.origin && !izinliOrigin(req)) {
    return res.status(403).json({ error: "Kaynak engellendi (CORS allowlist)" });
  }
  if (!tokenOnay(req)) {
    return res.status(401).json({ error: "Yetkisiz: geçerli bir erişim belirteci gerekli" });
  }
  if (rateLimit(req)) {
    return res.status(429).json({ error: "Çok fazla görsel üretimi, 60 saniye sonra tekrar dene" });
  }

  const KEY = process.env.OPENROUTER_KEY || "";
  if (!KEY) {
    return res.status(500).json({ error: "Sunucuda OPENROUTER_KEY yok. Vercel → Settings → Environment Variables → OPENROUTER_KEY ekle." });
  }

  const { prompt, oran = "1:1" } = req.body || {};
  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "prompt gerekli (metin)" });
  }
  const p = prompt.trim().slice(0, MAKS_PROMPT);
  if (!p) return res.status(400).json({ error: "prompt boş olamaz" });
  if (!/^(1:1|16:9|9:16|4:3|3:4)$/.test(oran)) {
    return res.status(400).json({ error: "geçersiz oran (1:1, 16:9, 9:16, 4:3, 3:4)" });
  }

  try {
    const r = await fetch(OPENROUTER, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + KEY,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: p }],
        modalities: ["image"],
        max_tokens: MAKS_TOKEN,
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      const hm = data?.error?.message || data?.message || JSON.stringify(data).slice(0, 300);
      // Kredi yetersizliği en sık karşılaşılan hatadır; ham OpenRouter metni
      // kullanıcıya hiçbir şey ifade etmiyor.
      if (/requires more credits|can only afford|insufficient.*credit/i.test(hm)) {
        return res.status(402).json({
          error: "Görsel üretimi için OpenRouter kredisi yetersiz. openrouter.ai → Settings → Credits bölümünden bakiye yükle (veya OPENROUTER_IMAGE_MAX_TOKENS değerini düşür).",
        });
      }
      return res.status(r.status).json({ error: hm });
    }

    // OpenRouter görsel modelleri görüntüyü `output` (data URI listesi) olarak döner:
    //   output: [{ type: "image", data: "data:image/png;base64,..." }, ...]
    // Bazı modeller choices[0].message.content içinde data URI dizgisi verir.
    const cikti = Array.isArray(data?.output)
      ? data.output
      : Array.isArray(data?.choices?.[0]?.message?.content)
        ? data.choices[0].message.content
        : [];
    let oniz = null;
    for (const blok of cikti) {
      if (!blok) continue;
      if (blok.type === "image" && typeof blok.data === "string" && blok.data.startsWith("data:image")) {
        oniz = blok.data; break;
      }
      if (typeof blok.image === "string" && blok.image.startsWith("data:image")) {
        oniz = blok.image; break;
      }
    }
    const dogrudan = typeof data?.choices?.[0]?.message?.content === "string"
      && data.choices[0].message.content.startsWith("data:image")
      ? data.choices[0].message.content : null;
    if (!oniz) oniz = dogrudan;

    if (!oniz) {
      return res.status(502).json({ error: "Model görsel döndürmedi (yanıt: " + JSON.stringify(data).slice(0, 200) + ")" });
    }
    if (oniz.length > MAKS_ONIZ) {
      return res.status(502).json({ error: "Görsel yanıtı çok büyük" });
    }

    return res.json({ goruntu: oniz, model: MODEL });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e).slice(0, 300) });
  }
}
