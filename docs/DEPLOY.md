# DEPLOY — ZenAI NODE (zenai-two.vercel.app)

## Web (aktif) dağıtımı
- Kök klasör: `web/` (Vercel panel → Project → Settings → Root Directory = `web`).
- Kök dizindeki `vercel.json` ana reponun eski `api/` (Python) kalıbı içindir ve web dağıtımında KULLANILMAZ.
- `web/vercel.json` dağıtım için esas ayardır: `buildCommand`/`installCommand` boş,
  `api/*.js` için `maxDuration: 60`, `/api/*` için CORS header.
- Süre ayarları: `web/api/voice.js`, `web/api/chat.js` OpenRouter/Groq SSE + fallback zinciri
  kullandığından `maxDuration: 60` gereklidir (varsayılan 10 sn çoğu isteği kaldırmaz).

## Deploy doğrulaması (kırıldıysa)
```bash
cd web
npm install
npx vercel --prod   # Vercel CLI token gerekir (panel → Settings → Tokens)
npx vercel env add OPENROUTER_KEY    # production
npx vercel env add GROQ_API_KEY      # production (1 sn hedefi için ZORUNLU)
```
Deploy sonrası kontrol:
```bash
curl -s -X POST https://zenai-two.vercel.app/api/voice \
  -H 'Content-Type: application/json' \
  -d '{"model":"chat","messages":[{"role":"user","content":"8 kere 8 kac eder?"}],"stream":true}'
```
Yanıt: `hazirlaniyor → dusunuyor → answer: "64" → tamamlandi` fazları görülmelidir.

## Hız ölçümü (AR-GE metriği)
Groq ve OpenRouter aynı soruda ölçülür; ilk token süresi (kullanıcı hissi) raporlanır.
```bash
GROQ_API_KEY=... OPENROUTER_KEY=... python3 scripts/olcum.py --adet=5
```
Çıktı: `kayit/latency.jsonl` (gitignore'lu) + özet tablo. "1 sn altı" iddiası bu sayıyla doğrulanır.

## Yerel rota gözlem (ağ yoksa)
Yerel ortamda API key yoksa `scripts/olcum.py` uyarı verir ve çıkar (çıkış kodu 2) —
bu istenen davranış, ölçüm canlı/CI tarafında key'ler kullanılarak yapılır.

## Ses katmanı (gerekmez) — pipecat
`voice/server/streamer.py` kendi başına bağımsız çalışır; sesli konuşma için
`pipecat-ai` kurulu boss gerekir. CI'da kurulur, lokal `test_bot.py` opsiyonel atlanır.