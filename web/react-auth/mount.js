(function(){
  const root = document.getElementById('auth-react-root');
  if (!root) return;
  let tries = 0;
  function mount(){
    tries++;
    if (typeof React === 'undefined' || typeof ReactDOM === 'undefined') { if (tries<80) setTimeout(mount,30); return; }
    const mod = window.__reactAuthMod;
    if (!mod || !mod.SignIn1) { if (tries<80) setTimeout(mount,30); return; }
    const e = React.createElement;
    const r = ReactDOM.createRoot(root);
    const googleEnabled = (window.SUNUCU && SUNUCU.googleAktif) || false;
    r.render(e(mod.SignIn1, {
      googleEnabled: googleEnabled,
      onSignIn: async (email, password) => {
        try {
          const err = document.getElementById('auth-react-error');
          const resp = await fetch('/api/auth/giris', { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include', body: JSON.stringify({email, sifre: password}) });
          const j = await resp.json().catch(()=>({}));
          if (!resp.ok){ if (err){ err.textContent = j.error||'Hata'; err.classList.remove('hidden'); } return; }
          if (err) err.classList.add('hidden');
          const modal = document.getElementById('authModal'); if (modal) modal.classList.add('hidden');
          if (typeof window.sunucuYukle==='function') await window.sunucuYukle(); else if (typeof sunucuYukle==='function') await sunucuYukle();
          if (typeof authUygula==='function') authUygula();
        } catch(e2){ const err=document.getElementById('auth-react-error'); if(err){err.textContent='Bağlantı hatası'; err.classList.remove('hidden');} }
      },
      onGoogleSignIn: () => { if ((window.SUNUCU&&SUNUCU.googleAktif) && typeof googleOturumAc==='function') googleOturumAc(); },
      onSignUp: () => { if (typeof authModAyarla==='function') authModAyarla('kayit'); }
    }));
    const form = document.getElementById('girisForm'); if (form) form.classList.add('hidden');
    const tabs = document.getElementById('girisSekmeler'); if (tabs) tabs.classList.add('hidden');
    const oldErr = document.getElementById('girisHata'); if (oldErr) oldErr.classList.add('hidden');
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
