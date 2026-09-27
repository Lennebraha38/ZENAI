// Plan durumu için sunucusuz kalıcı depo (Upstash Redis, REST — SDK gerekmez).
// Kurulu değilse uygulama sessizce ücretsiz planda çalışmaya devam eder.
const URL = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

export const depoVar = !!(URL && TOKEN);

async function cmd(...parcalar) {
  if (!depoVar) return null;
  const r = await fetch(`${URL}/${parcalar.map(encodeURIComponent).join("/")}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(parcalar),
  });
  if (!r.ok) throw new Error("Depo hatası: " + r.status);
  const v = await r.json();
  return v?.result ?? null;
}

const anahtar = (sub) => `zenai:plan:${sub}`;

// Aboneliğin planını yaz (yalnızca doğrulanmış webhook çağırır).
export async function planYaz(sub, plan) {
  if (!sub || !depoVar) return false;
  try {
    await cmd("SET", anahtar(sub), plan, "EX", 60 * 60 * 24 * 400);
    return true;
  } catch {
    return false;
  }
}

export async function planSil(sub) {
  if (!sub || !depoVar) return false;
  try { await cmd("DEL", anahtar(sub)); return true; } catch { return false; }
}

// Kullanıcının gerçek planını ok. Yoksa çerezdeki plana düşer.
export async function planOku(sub, varsayilan) {
  if (!sub) return varsayilan;
  try {
    const v = await cmd("GET", anahtar(sub));
    return typeof v === "string" && v ? v : varsayilan;
  } catch {
    return varsayilan;
  }
}
