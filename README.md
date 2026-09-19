# ZenAI

**Yerel + Mega Beyin mimarisiyle çalışan Türkçe yapay zeka asistan projesi.**
*Resmî adı: ZenAI (eski adı: LenBeyni — 2026-09 rebrand)*

Tabletten buluta uzanan iki kademeli beyin sistemi:

- **Yerel beyin** (Ollama): 7B/14B kod modeli — offline, kendi donanımında
- **Mega beyin** (OpenRouter): nemotron-550B (ücretsiz tier kotaları ile çalışır) — bulutta

> Not: Ücretsiz tier modeller kotalıdır; günün 첫 호출larında 429 alabilir.
> Fallback zinciri otomatik devreye girer. Detay: [Ölçüm Şeffaflığı](#ölçüm-şeffaflığı).

## Modüller

| Modül | Dosya | Ne yapar |
|---|---|---|
| Ajan döngüsü | `agentv2/zenai_zeka.py` | `[ARAMA]` / `[SITE]` komutlarıyla web'i talimatla tarar |
| **Akıl Motoru** | `agentv2/akil_motoru.py` | Claude'un az-token/yüksek-mantık felsefesi + bizim bol-token: CoT yöntemi, 5000 kelime hedefi, kendi kendini doğrulama |
| **Model Routing** | `agentv2/model_routing.py` | Konuya göre uzman model: kod→north-mini-code, matematik/mantık→nemotron-550B, diğer→dots-3 (2-4x Claude token büyüklüğü) |
| **Self-Correction** | `agentv2/self_correction.py` | Kod cevapları sandbox'ta çalıştırılır → syntax/runtime hatası bulunursa model düzeltme turu yapar |
| **Otomatik Skorer** | `agentv2/otomatik_skorer.py` | Soru-bazlı beklenen yanıt (`soru_bankasi.HEDEFLER`) eşleştirir: matematik=sayısal, mantık/dil=anahtar kavram; kod=sandbox çalıştırma. Doğruluk ağırlıklı: hedefsiz cevap ≤0.4 |
| **Çoğuluk Oyu** | `agentv2/cogunluk_oyu.py` | Aynı soruyu N kez sorar, en sık cevabı seçer (doğruluk istatistiksel artırılır) |
| Karşılaştırma testi | `karsilastirma.py` | Türkçe karşılaştırma + rate-limit aware (retry + backoff); çıktısı **yazım sırasında otomatik puanlanır** (`puan`+`ozet`), CI gate'i puansız ham kaydı reddeder |
| Benchmark | `agentv2/tam_zirve.py` + `soru_bankasi.py` | **150 soru** / 10 konu / 3 zorluk; `--kategori`, `--zorluk` filtreleri |
| Bağımsız doğrulama | `agentv2/dogrulama.py` + `dogrulama_seti.py` | 40 gerçek-soru **strict doğru/yanlış** (`puan_strict`); uzunluk/yapı puanı yok |
| Deep Research | `agentv2/zenai_zeka.py` (`rapor` modu) | Soruyu alt-başlıklara böler, kaynakları toplar, kaynaklı kurumsal rapor yazar |
| Bellek (vektör) | `agentv2/bellek_vektor.py` | Karakter n-gram benzerliğiyle hatırlar (`~/.zenai_bellek.json`); TTL + kullanıcı izolasyonu |
| Güvenlik | `agentv2/guvenlik.py` + `SECURITY.md` | SSRF (DNS rebinding + decimal IP) / kod (AST + MWE) / shell (IFS hilesi) / path / prompt-injection — deny-by-default |
| Web GUI | `web/` | Premium arayüz: konu→model rozeti, Akıl Motoru, AI Meclisi, **Skills**, **MCP**; opsiyonel token (`ZENAI_ACCESS_TOKEN`) + IP rate-limit |
| Kod eğitimi | `egitim/` | QLoRA ile 7B/14B kod modeli fine-tune (Kaggle) |
| Cihaz beyni | `ciday/` (tablet) | Ollama tabanlı, offline sohbet/kod |
| Araç katmanı | `agentv2/araclar/` | 10+ yetenek: belge, kod sandbox, sistem, github, haber, hava, görsel, güvenlik (browser-use/gpt-researcher/OpenCLI özleri) |

## Ölçüm Şeffaflığı

Her skor raporu şu alanları içerir:

```
Kaynak dosya | Yöntem | Model | Tarih | Doğru/Toplam | Yüzde
```

- **Bağımsız doğrulama (`dogrulama.py`)**: 40 gerçek soru, strict doğru/yanlış eşleştirme. Uzunluk/yapı puanı yok. "Gerçekten zeki mi?" sorusuna dürüst cevap.
- **Zirve (`tam_zirve.py`, 150 soru)**: Kendi soru bankasına göre üretilmiş ölçüm. Skorlayıcı doğruluk ağırlıklı (hedefsiz cevap en fazla 0.4). Tanı-reçete amaçlı; bağımsız doğrulamanın yerine geçmez.
- Ücretsiz modeller 429 ile kotalıyken benchmark `ZIRVE_MODEL` ile acil yoldan çalışır (ör. `ZIRVE_MODEL=openai/gpt-4o-mini:free`). Not: Bazı modeller açık kotalara tabidir ve her zaman kullanılamayabilir.
- Her skor `kayit/routing_log.jsonl`'e işlenir ve `model_routing.routing_rapor()` ile gerçek veri üzerinden model önerisi üretir.
- **Neyin ölçüldüğü:** kod katmanı (`tests/`, `yuk_testi.py`, CI gate'leri) CI'da ölçülür; Python `akil_motoru.py`'nin 5000-kelime hedefi **benchmark aracı**dır (CLI), web'deki "Akıl Motoru" modu tarayıcıda ayrı bir hafif akış uygular — ikisinin aynı kod yolu olduğunu iddia etmiyoruz.

## Test

```bash
python3 -m pytest tests/ -q          # 176 test (akil + guvenlik + skor + araclar + token + meclis + dayaniklilik)
python3 scripts/yuk_testi.py --n 20 --eşzaman 10   # voice gateway eşzamanlılık (SSE, ağ yok)
python3 agentv2/otomatik_skorer.py karsilastirma.json   # canli test skoru raporu
python3 agentv2/cogunluk_oyu.py "soru" --tekrar 3       # majority vote
python3 agentv2/tam_zirve.py --soru 10                  # zirve testi (ilk 10 soru)
python3 agentv2/tam_zirve.py --kategori kod             # sadece kod soruları
python3 agentv2/tam_zirve.py --zorluk zor               # sadece zor sorular
python3 agentv2/tam_zirve.py --kalan-bekle              # rate-limit bekle, sürekli dene
python3 agentv2/meclis_hakemi.py "soru"                 # genişletilmiş hakem paneli (12 kriter)
python3 agentv2/akil_dongu_test.py "soru"               # 5 tur kalite ölçümü
python3 agentv2/dogrulama.py                            # bağımsız 40 gerçek soru (strict)
python3 agentv2/dogrulama.py --adet 10 --kalan-bekle    # hızlı + rate-limit uyumlu

> Rate-limit notu: ücretsiz OpenRouter modelleri 429 dönebilir; `--kalan-bekle`
> otomatik bekler. Zirve raporunu `agentv2/tam_zirve.py --sadece-skor` ile gör.
```

## Kurulum

```bash
pip install requests
export OPENROUTER_KEY="sk-or-v1-..."
python3 agentv2/zenai_zeka.py "sorun" ajan
python3 agentv2/zenai_zeka.py "araştırma konusu" rapor
```

## Web GUI: Premium sohbet arayüzü

**ZERO-CONFIG** — kullanıcı tarayıcıda hiçbir key'le uğraşmaz (Gemini gibi):

- **Sunucu rolü** (`web/api/chat.js`): OpenRouter key'i sadece Vercel env'inde tutulur (`OPENROUTER_KEY`). Tarayıcıya key asla sızmaz.
- **MCP rolü** (`web/api/mcp.js`): Uzak MCP sunucularına JSON-RPC over HTTP ile araç listeleme/çağırma — key gerekmez.
- Sunucu yoksa kullanıcı kendi key'ini girebilir (geliştirici modu). Key localStorage'da saklanır, sunucuya gitmez.
- **Rol güvenliği**: CORS yalnız `ZENAI_ORIGIN` allowlist'ine (varsayılan `https://zenai-two.vercel.app`); IP başına 1 dk pencere rate-limit (chat 30 / mcp 60); opsiyonel `ZENAI_ACCESS_TOKEN` tanımlanırse rol tüm isteklerde token ister; `max_tokens` 16K'da, mesaj boyutu 60K karakterde sınırlıdır.

**Özellikler:**

- **Akıl yönlendirme rozeti** — soruyu okuyup konu tespiti yapar, doğru modeli önerir (kod→north-mini, matematik→nemotron, vb.)
- **Skills** — Yetenekler panelinden mevcut skill'leri aç/kapat, **yeni skill ekle** (ad + sistem talimatı). Aktif skill'ler cevap üretirken sistem talimatına enjekte edilir ve mesajda ✨etiketi olarak görünür.
- **MCP bağlama** — Sağ panelden sunucu adı + uç nokta girerek bağlan. Bağlı araçlar listelenir (● bağlı / ! hata). Model ihtiyaç duyarsa `TOOL_CALL:` satırıyla araç çıktırması yapar, sonuç geri beslenir.
- **Modlar** — Sohbet / Akıl Motoru (CoT + kapsamlı) / AI Meclisi (3 model + hakem)
- **Araçlar** — Web araması + site okuma (gerçek veri, sistem promptuna beslenir)
- **Markdown** — Başlık, liste, tablo, kod bloğu (kopyala butonuyla), alıntı
- **Sohbet listesi** — Sol panelde geçmiş konuşmalar, yeni sohbet, temizle

**Test:**
```bash
NODE_PATH=$(npm root -g) node web/web_gui_test.js   # Playwright GUI doğrulaması
```

```bash
# Vercel'e deploy:
# 1. Repo'yu Vercel'e bağla
# 2. Settings -> Environment Variables -> OPENROUTER_KEY ekle
# 3. Deploy et — bitti.
```

## Lisans

MIT
