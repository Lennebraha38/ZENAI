// ZenAI MCP Rölesi (Vercel Serverless).
// Tarayıcıdan uzak MCP sunucularına JSON-RPC over HTTP ile alet listeleme/çağırma.
// CORS ve anahtar sorunlarını sunucu tarafında çözer; key tarayıcıya asla sızmaz.
// Güvenlik: SSRF önleme — iç ağ/özel IP uçlarına bağlanma engellenir.
import { lookup } from "node:dns/promises";

const MCP_HEADERS = { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" };

// ── Ortak güvenlik: CORS allowlist + opsiyonel token + IP rate-limit ──
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
function rateLimit(req, maks = 60) {
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim()
    || req.socket?.remoteAddress || "?";
  const simdi = Date.now();
  const esik = simdi - 60000;
  const gelen = (pencere.get(ip) || []).filter((t) => t > esik);
  if (gelen.length >= maks) { pencere.set(ip, gelen); return true; }
  pencere.set(ip, gelen.concat([simdi]));
  return false;
}

// ── SSRF koruması ──
function ipOzelMi(ip) {
  const v6 = ip.includes(":");
  if (v6) {
    if (ip === "::1" || ip.toLowerCase() === "::ffff:127.0.0.1") return true;
    const alt = ip.toLowerCase().split("::")[0];
    return alt.startsWith("fc") || alt.startsWith("fd") || alt.startsWith("fe8") || alt.startsWith("fe9")
      || alt.startsWith("fea") || alt.startsWith("feb") || ip.startsWith("0:");
  }
  const o = ip.split(".").map(Number);
  if (o.length !== 4) return true;
  return (
    o[0] === 10 || o[0] === 127 || o[0] === 0 ||
    (o[0] === 172 && o[1] >= 16 && o[1] <= 31) ||
    (o[0] === 192 && o[1] === 168) ||
    (o[0] === 169 && o[1] === 254) ||
    (o[0] === 100 && o[1] >= 64 && o[1] <= 127) ||
    o[0] >= 224
  );
}

async function ucGuvenli(uç) {
  if (!uç || typeof uç !== "string" || uç.length > 2048) return false;
  let u;
  try { u = new URL(uç); } catch { return false; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (u.username || u.password) return false;
  const port = u.port ? Number(u.port) : (u.protocol === "https:" ? 443 : 80);
  if (port !== 80 && port !== 443) return false;
  const host = u.hostname;
  if (!host || host === "localhost" || host === "127.0.0.1" || host === "::1" || /^\d+\.\d+\.\d+\.\d+$/.test(host) && ipOzelMi(host)) return false;
  try {
    const { address } = await lookup(host);
    return !ipOzelMi(address);
  } catch { return false; }
}

export default async function handler(req, res) {
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

  const { action, uc, proto = "http", alet, argumanlar } = req.body || {};
  if (!uc) return res.status(400).json({ error: "Uç nokta (uc) gerekli" });
  if (JSON.stringify(argumanlar || {}).length > 20000) {
    return res.status(400).json({ error: "Argümanlar çok büyük" });
  }
  if (!["http", "sse"].includes(proto)) return res.status(400).json({ error: "Geçersiz protokol" });
  if (!(await ucGuvenli(uc))) return res.status(400).json({ error: "Güvenlik: izin verilmeyen uç nokta (SSRF önleme)" });

  try {
    if (action === "tools") {
      const payload = { jsonrpc: "2.0", id: 1, method: "tools/list" };
      const data = await mcpIste(uc, proto, payload);
      return res.json({ tools: (data?.result?.tools || []).map((t) => ({
        name: t.name,
        description: t.description || "",
        inputSchema: t.inputSchema || {},
      })) });
    }

    if (action === "call") {
      if (!alet) return res.status(400).json({ error: "alet gerekli" });
      const payload = { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: alet, arguments: argumanlar || {} } };
      const data = await mcpIste(uc, proto, payload);
      const result = data?.result || {};
      return res.json({ content: result.content || [], isError: !!result.isError });
    }

    return res.status(400).json({ error: "Bilinmeyen aksiyon" });
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e).slice(0, 300) });
  }
}

// JSON-RPC over HTTP isteği. SSE uçları için önce initialize/initialized el sıkışması yapılır.
async function mcpIste(uc, proto, payload) {
  if (proto === "sse") {
    // SSE: önce /initialize + /notifications gönder, sonra tekrar iste
    await fetch(uc, { method: "POST", headers: MCP_HEADERS, body: JSON.stringify({
      jsonrpc: "2.0", id: 0, method: "initialize",
      params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "ZenAI", version: "1.0" } },
    }) });
  }
  const r = await fetch(uc, { method: "POST", headers: MCP_HEADERS, body: JSON.stringify(payload) });
  if (!r.ok) throw new Error("MCP HTTP " + r.status);
  const gövde = await r.text();
  try { return JSON.parse(gövde); }
  catch (e) {
    // SSE satırlarından JSON-RPC yanıtını çıkar
    const satir = gövde.split("\n").find((s) => s.startsWith("data:"));
    if (satir) return JSON.parse(satir.slice(5).trim());
    throw new Error("MCP yanıtı JSON veya SSE değil");
  }
}