/* ZenAI // VOICE — JARVIS HUD
 * Tek dosya, sıfır bağımlılık. Metin modu gateway SSE ile çalışır;
 * ses yolu (WebRTC/WS) ayarlanınca aynı durum makinesiyle beslenir.
 * Saf katmanlar node ortamında da test edilebilir (module.exports).
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = mod; }
  if (root) {
    root.ZenHud = mod;
    if (root.addEventListener && root.document) mod.baslat(root.document);
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ── Durum makinesi (saf) ─────────────────────────────────────────── */
  const DURUMLAR = { bosta: 'BOŞTA', dinliyor: 'DİNLİYOR', dusunuyor: 'DÜŞÜNÜYOR',
                     arastiriyor: 'ARAŞTIRIYOR', konusuyor: 'KONUŞUYOR', hata: 'HATA' };

  function Durum() {
    this.aktif = 'bosta';
    this.detay = 'hazır';
  }

  /* gateway delta olayları: {tur:'answer'|'faz', faz:'...', durum:'...', detay:'...'} */
  Durum.prototype.uygula = function (e) {
    if (!e || typeof e !== 'object') return this;
    const t = e.tur || e.type;
    if (t === 'answer' || t === 'thought') { this.git('konusuyor', 'yanıt okunuyor'); return this; }
    if (t === 'faz') return this.faz(e);
    if (t === 'hata') { this.git('hata', e.detay || e.icerik || 'hata'); return this; }
    if (e.yerel) {
      if (e.yerel === 'dinle') this.git('dinliyor', 'mikrofon');
      else if (e.yerel === 'sus') this.git('bosta', 'hazır');
      else if (e.yerel === 'pta-bas') this.git('dinliyor', 'konuşuyorsun');
      else if (e.yerel === 'pta-son') this.git('dusunuyor', 'işleniyor');
    }
    return this;
  };

  Durum.prototype.faz = function (e) {
    const ad = e.faz || '', d = e.detay || e.durum || '';
    if (ad === 'hata') { this.git('hata', d); return this; }
    if (ad === 'rapor' || ad === 'arastiriliyor') { this.git('arastiriyor', d || 'kaynak taraması'); return this; }
    if (ad === 'hazirlaniyor' || ad === 'plan' || ad === 'dusunuyor' ||
        ad === 'arac-hazirligi') { this.git('dusunuyor', d || 'akıl yürütme'); return this; }
    if (ad === 'yanit' || ad === 'tamamlandi' || ad === 'konusuyor') { this.git('konusuyor', d || ''); return this; }
    if (!this.YERLESTI) this.git('bosta', 'hazır');
    return this;
  };

  Durum.prototype.git = function (ad, detay) {
    if (DURUMLAR[ad]) { this.aktif = ad; }
    if (detay) this.detay = String(detay).slice(0, 60);
    return this;
  };

  Durum.prototype.sus = function () { this.git('bosta', 'hazır'); return this; };

  /* ── SSE satır ayrıştırıcı (saf) ───────────────────────────────────── */
  /* `data: <json>` satırlarını olay listesine çevirir; "[DONE]" boş geçilir. */
  function durum_ayikla(satirlar) {
    const olaylar = [];
    for (const sat of String(satirlar || '').split('\n')) {
      if (!sat.startsWith('data: ')) continue;
      const g = sat.slice(6);
      if (g === '[DONE]') continue;
      try { olaylar.push(JSON.parse(g)); } catch (e) { /* bozuk satır: atla */ }
    }
    return olaylar;
  }

  /* ── POST + akış okuma (SSE) ───────────────────────────────────────── */
  async function akisPost(url, govde, onOlay, isaret) {
    const yanit = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-zenai-mode': govde.zenai_mode || 'chat' },
      body: JSON.stringify(govde),
      signal: isaret ? isaret.signal : undefined,
    });
    if (!yanit.ok) throw new Error('gateway ' + yanit.status);
    const okuyucu = yanit.body.getReader();
    const kod = new TextDecoder();
    let tampon = '';
    for (;;) {
      const { done, value } = await okuyucu.read();
      if (done) break;
      tampon += kod.decode(value, { stream: true });
      let son = tampon.lastIndexOf('\n\n');
      if (son === -1) continue;
      const hazir = tampon.slice(0, son);
      tampon = tampon.slice(son + 2);
      for (const olay of durum_ayikla(hazir)) onOlay(olay);
    }
    for (const olay of durum_ayikla(tampon)) onOlay(olay);
  }

  /* ── Tarayıcı HUD ──────────────────────────────────────────────────── */
  function baslat(ad) {
    function $(id) { return ad.getElementById(id); }
    const durum = new Durum();
    const canvas = $('hud-canvas');
    const ctx = canvas.getContext('2d');
    const kok = ad.body;
    const durumMetin = $('durum-metin');
    const durumDetay = $('durum-detay');
    const fazSeridi = $('faz-seridi');
    const sohbetKaydi = $('sohbet-kaydi');
    const saatEl = $('saat');

    let gateway = ($('cfg-gateway').value || '').replace(/\/$/, '');
    let wsUrl = ($('cfg-ws').value || '').trim();
    let ses = null;      // WebRTC/WS köprüsü (opsiyonel)
    let cik = null;      // AudioContext
    let mikAnaliz = null;
    let ab = null;       // iptal denetleyicisi
    let hedefEnerji = 0, enerji = 0, darbe = 0;
    let yazylan = '';
    let tip = 0;

    durum.YERLESTI = true;

    function setDurum() {
      kok.setAttribute('data-durum', durum.aktif);
      durumMetin.textContent = DURUMLAR[durum.aktif] || durum.aktif.toUpperCase();
      durumDetay.textContent = durum.detay;
    }
    const olayIsle = function (olay) {
      /* gateway SSE olaylari OpenAI biciminde: choices[0].delta -> duzlestir */
      const delta = olay && olay.choices && olay.choices[0] && olay.choices[0].delta;
      const duz = delta
        ? { type: delta.type, faz: delta.faz, detay: delta.detay, durum: delta.durum,
            icerik: delta.content, content: delta.content }
        : olay;
      durum.uygula(duz);
      setDurum();
      if (duz.type === 'faz') {
        fazSeridi.textContent =
          (duz.faz + ' · ' + (duz.detay || '')).toUpperCase();
      }
      return duz;
    };

    /* mikrofon: hem analiz hem "dinliyor" enerjisi */
    async function mikBaslat() {
      if (cik) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        cik = new (window.AudioContext || window.webkitAudioContext)();
        mikAnaliz = cik.createAnalyser();
        mikAnaliz.fftSize = 256;
        mikAnaliz.smoothingTimeConstant = 0.7;
        cik.createMediaStreamSource(stream).connect(mikAnaliz);
        $('baglanti').textContent = 'mikrofon açık';
        $('baglanti').classList.add('canli');
      } catch (e) {
        $('baglanti').textContent = 'mikrofon: ' + e.name;
      }
    }

    function mikEnerji() {
      if (!mikAnaliz) return 0;
      const veri = new Uint8Array(mikAnaliz.frequencyBinCount);
      mikAnaliz.getByteFrequencyData(veri);
      let toplam = 0;
      for (let i = 0; i < veri.length; i++) toplam += veri[i];
      const ort = toplam / veri.length / 255;
      return ort > 0.02 ? Math.min(1, ort * 4) : 0;
    }

    /* romantik enerji: mikrofon (dinlerken) ya da darbe (konuşurken) */
    function enerjiHedef() {
      if (durum.aktif === 'dinliyor') return mikEnerji();
      if (durum.aktif === 'dusunuyor' || durum.aktif === 'arastiriyor')
        return 0.12 + 0.1 * Math.sin(tip / 28);
      if (durum.aktif === 'konusuyor') return 0.25 + 0.75 * darbe;
      if (durum.aktif === 'hata') return 0.3;
      return 0.08;
    }

    /* renk paleti */
    function renkler() {
      const r = { bosta: '#00d4ff', dinliyor: '#22e0b4', dusunuyor: '#ffb020',
                  arastiriyor: '#ffb020', konusuyor: '#00d4ff', hata: '#ff5d5d' };
      return r[durum.aktif] || r.bosta;
    }

    /* parçacık alanı */
    const P = [];
    for (let i = 0; i < 80; i++) {
      P.push({ a: Math.random() * Math.PI * 2, r: 110 + Math.random() * 130,
               h: 0.002 + Math.random() * 0.006, d: Math.random() * 0.4 + 0.3 });
    }

    function ciz() {
      const cx = canvas.width / 2, cy = canvas.height / 2;
      const Rda = 96 + 44 * enerji + 14 * Math.sin(tip / 40);
      const renk = renkler();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      /* dalga formu (radar çubuğu) */
      let bins = 40;
      if (mikAnaliz) {
        const v = new Uint8Array(mikAnaliz.frequencyBinCount);
        mikAnaliz.getByteFrequencyData(v);
        bins = 48;
        for (let i = 1; i < bins; i++) {
          const n = (v[i] / 255) * (0.4 + 0.6 * enerji);
          const a = ((i / bins) * Math.PI * 2) + tip / 120;
          const u = Rda + 18 + n * 120;
          ctx.strokeStyle = renk;
          ctx.globalAlpha = 0.35 + 0.6 * n;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * (Rda - 6), cy + Math.sin(a) * (Rda - 6));
          ctx.lineTo(cx + Math.cos(a) * u, cy + Math.sin(a) * u);
          ctx.stroke();
        }
      } else {
        for (let i = 1; i < bins; i++) {
          const n = 0.25 + 0.5 * enerji * Math.abs(Math.sin(i * 0.7 + tip / 20));
          const a = (i / bins) * Math.PI * 2;
          ctx.strokeStyle = renk;
          ctx.globalAlpha = 0.25 + 0.6 * n;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * Rda, cy + Math.sin(a) * Rda);
          ctx.lineTo(cx + Math.cos(a) * (Rda + 14 + n * 90), cy + Math.sin(a) * (Rda + 14 + n * 90));
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;

      /* parçacıklar */
      for (const p of P) {
        p.a += p.h * (durum.aktif === 'arastiriyor' ? 3 : 1);
        const rr = p.r * (1 + 0.06 * Math.sin(tip / 30 + p.d * 9));
        const x = cx + Math.cos(p.a) * rr, y = cy + Math.sin(p.a) * rr;
        ctx.fillStyle = renk;
        ctx.globalAlpha = p.d * (0.3 + 0.7 * enerji);
        ctx.beginPath();
        ctx.arc(x, y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      /* orb */
      const g = ctx.createRadialGradient(cx - 20, cy - 20, 8, cx, cy, Rda);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.55, renk + '30');
      g.addColorStop(1, renk + 'b0');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, Rda, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = renk;
      ctx.lineWidth = 1.6;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(cx, cy, Rda, 0, Math.PI * 2);
      ctx.stroke();

      /* dönen yaylar */
      ctx.beginPath();
      ctx.arc(cx, cy, Rda + 26, tip / 160, tip / 160 + Math.PI * 0.6);
      ctx.stroke();
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(cx, cy, Rda + 46, -tip / 200, -tip / 200 + Math.PI * 0.35);
      ctx.stroke();
      ctx.globalAlpha = 1;

      /* merkez etiket */
      ctx.fillStyle = renk;
      ctx.globalAlpha = 0.9;
      ctx.font = '600 22px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('ZENAI', cx, cy + 6);
      ctx.globalAlpha = 0.55;
      ctx.font = '11px Consolas, monospace';
      ctx.fillText((DURUMLAR[durum.aktif] || durum.aktif).toUpperCase(), cx, cy + 26);
      ctx.globalAlpha = 1;
    }

    function don() {
      tip += 1;
      hedefEnerji = enerjiHedef();
      enerji += (hedefEnerji - enerji) * 0.18;
      darbe *= 0.92;
      ciz();
      requestAnimationFrame(don);
    }

    /* sohbet paneli */
    function kutu(rol, metin) {
      const k = ad.createElement('div');
      k.className = rol === 'k' ? 'k' : 'a';
      k.textContent = (rol === 'k' ? 'SEN: ' : 'ZENAI: ') + metin;
      sohbetKaydi.appendChild(k);
      sohbetKaydi.scrollTop = sohbetKaydi.scrollHeight;
      return k;
    }

    async function gonderu(soru) {
      if (!soru.trim()) return;
      kutu('k', soru);
      const yer = kutu('a', '');
      ab = new AbortController();
      yazylan = '';
      durum.uygula({ yerel: 'pta-son' });
      setDurum();
      try {
        await akisPost(gateway, {
          model: 'chat', stream: true,
          messages: [{ role: 'user', content: soru }],
        }, function (olay) {
          olayIsle(olay);
          const d = olay && olay.choices && olay.choices[0] && olay.choices[0].delta;
          if (d && d.type === 'answer' && d.content) {
            yazylan += d.content;
            yer.textContent = 'ZENAI: ' + yazylan;
            darbe = 1;
          }
        }, ab);
        durum.sus();
        setDurum();
      } catch (e) {
        yer.textContent = 'ZENAI: [hata] ' + e.message;
        durum.uygula({ tur: 'hata', detay: e.message });
        setDurum();
      } finally {
        ab = null;
      }
    }

    /* PTT: sokma basılıyken dinliyor; opsiyonel WS köprüsüne gönder */
    function ptaBas() {
      mikBaslat();
      durum.uygula({ yerel: 'pta-bas' });
      setDurum();
      if (ses) ses.basla();
    }
    function ptaSon() {
      durum.uygula({ yerel: 'pta-son' });
      setDurum();
      if (ses) ses.bitir();
    }

    function baglan() {
      const girilen = ($('cfg-gateway').value || '').trim().replace(/\/$/, '');
      /* Vercel yayini: ayni origin uzerinden /api/voice (CORS'suz, 0 maliyet).
       * Lokal: http://127.0.0.1:8787 gibi tam adres girilir. */
      const ayniOrigin = location.origin.startsWith('http') &&
        !girilen && location.pathname.indexOf('/voice/hud') >= 0;
      let uc;
      if (ayniOrigin) {
        uc = location.origin + '/api/voice/completions';  // Vercel: Python SSE fonksiyonu
      } else if (girilen) {
        uc = girilen;
        if (uc.indexOf('/v1/') < 0 && /^https?:\/\/(127\.0\.0\.1|localhost)/.test(uc)) {
          uc = uc.replace(/\/$/, '') + '/v1/chat/completions';
        }
      } else {
        uc = 'http://127.0.0.1:8787/v1/chat/completions';
      }
      gateway = uc;
      wsUrl = ($('cfg-ws').value || '').trim();
      durum.sus();
      setDurum();
      fazSeridi.textContent = 'köprü: ' + gateway;
      $('baglanti').textContent = 'gateway: ' + gateway;
      $('baglanti').classList.add('canli');
      if (wsUrl) { ses = SesKoprusu(wsUrl, olayIsle); ses.baglan(); }
      mikBaslat();
    }

    ad.getElementById('sohbet-form').addEventListener('submit', function (q) {
      q.preventDefault();
      const ip = $('sohbet-metin');
      gonderu(ip.value); ip.value = '';
    });
    ad.getElementById('pta-btn').addEventListener('mousedown', ptaBas);
    ad.getElementById('pta-btn').addEventListener('mouseup', ptaSon);
    ad.getElementById('pta-btn').addEventListener('mouseleave', ptaSon);
    ad.body.addEventListener('keydown', function (q) {
      if (q.code === 'Space' && q.target.tagName !== 'INPUT' &&
          q.target.tagName !== 'TEXTAREA') { q.preventDefault(); ptaBas(); }
    });
    ad.body.addEventListener('keyup', function (q) {
      if (q.code === 'Space') ptaSon();
    });
    ad.getElementById('cfg-kaydet').addEventListener('click', baglan);

    setInterval(function () {
      const t = new Date();
      saatEl.textContent = t.toTimeString().slice(0, 8);
    }, 1000);

    baglan();
    don();
  }

  /* ── Ses köprüsü (WebRTC, SmallWebRTC bot ucu) ──────────────────────────
   * Tarayıcı mikrofonu WebRTC track olarak bota akar; bot (pipecat:
   * VAD→STT→ZenAI LLM→Piper TTS) sesini geri yollar. Bot faz/durum olaylarını
   * uygulama mesajı (data channel JSON) olarak gönderir; HUD bunları durum
   * makinesine besler. */
  function SesKoprusu(botUrl, onOlay) {
    let pc = null, kanal = null, mikro = null;
    const cikisElemani = ad.getElementById("ses-cikis");

    async function baglan() {
      try {
        mikro = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        onOlay({ yerel: "hata", detay: "mikrofon reddedildi" });
        return;
      }
      pc = new RTCPeerConnection();
      mikro.getTracks().forEach(function (t) { pc.addTrack(t, mikro); });
      pc.ontrack = function (e) {
        if (cikisElemani.srcObject !== e.streams[0]) cikisElemani.srcObject = e.streams[0];
      };
      pc.ondatachannel = function (e) { kanal = e.channel; kanalDinle(kanal); };
      /* SmallWebRTC: data channel'ı bot tarafı açar; bazı akışlarda istemci de açabilir */
      kanal = pc.createDataChannel("pipecat");
      kanalDinle(kanal);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const yanit = await fetch(botUrl.replace(/\/$/, "") + "/offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sdp: pc.localDescription.sdp, type: pc.localDescription.type }),
      });
      if (!yanit.ok) {
        onOlay({ yerel: "hata", detay: "bot ucu: " + yanit.status });
        return;
      }
      const cevap = await yanit.json();
      await pc.setRemoteDescription({ type: cevap.type, sdp: cevap.sdp });
      onOlay({ yerel: "sus" });
    }

    function kanalDinle(k) {
      k.onmessage = function (m) {
        try {
          onOlay(JSON.parse(m.data));
        } catch (e) { /* JSON olmayan mesaj: yok say */ }
      };
    }

    return {
      baglan: baglan,
      basla: function () { /* VAD bota göre çalışır; mikrofon track zaten akıyor */ },
      bitir: function () { /* barge-in transport tarafından ele alınır */ },
      kapat: function () {
        if (mikro) mikro.getTracks().forEach(function (t) { t.stop(); });
        if (pc) pc.close();
        pc = null; kanal = null; mikro = null;
      },
    };
  }

  return { Durum, durum_ayikla, akisPost, baslat };
});