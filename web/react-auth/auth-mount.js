(function() {
  const root = document.getElementById('auth-react-root');
  if (!root) return;
  
  // Wait for React to be available
  const mount = () => {
    if (typeof React === 'undefined' || typeof ReactDOM === 'undefined') {
      setTimeout(mount, 50);
      return;
    }
    try {
      const SignIn1 = window.SignIn1;
      if (!SignIn1) {
        setTimeout(mount, 50);
        return;
      }
      const e = React.createElement;
      const rootReact = ReactDOM.createRoot(root);
      rootReact.render(e(SignIn1, {
        onSignIn: async (email, password) => {
          try {
            const r = await api('/api/auth/giris', { email, sifre: password });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) {
              const msg = j.error || 'Giriş başarısız';
              const errEl = document.getElementById('auth-react-error');
              if (errEl) { errEl.textContent = msg; errEl.classList.remove('hidden'); }
              return;
            }
            const modal = document.getElementById('authModal');
            if (modal) modal.classList.add('hidden');
            await sunucuYukle();
            authUygula();
          } catch (err) {
            const errEl = document.getElementById('auth-react-error');
            if (errEl) { errEl.textContent = 'Bağlantı hatası'; errEl.classList.remove('hidden'); }
          }
        },
        onGoogleSignIn: () => {
          if (window.SUNUCU && SUNUCU.googleAktif) {
            try { googleOturumAc(); } catch {}
          }
        },
        onSignUp: () => {
          if (typeof authModAyarla === 'function') authModAyarla('kayit');
          const modal = document.getElementById('authModal');
          if (modal && modal.classList.contains('hidden')) modal.classList.remove('hidden');
          const rootReact = root._reactRoot;
        }
      }));
    } catch (err) { console.error('React mount error:', err); }
  };
  mount();
})();
