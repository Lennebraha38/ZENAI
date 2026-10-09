window.SignIn1 = null;
function loadReactAuth() {
  const root = document.getElementById('auth-react-root');
  if (!root) return;
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/react-auth/assets/' + Array.from(document.querySelectorAll('link')).map(l=>l.href).find(h=>h.includes('index-')&&h.includes('.css')) || '';
  // fallback
  const cssFiles = Array.from(document.querySelectorAll('script')).map(s=>s.src).concat([]);
  document.head.appendChild(css);
  const js = document.createElement('script');
  js.type = 'module';
  const jsFile = Array.from(document.getElementsByTagName('script')).map(s=>s.src).find(h=>h.includes('index-')&&h.includes('.js'));
  js.src = '/react-auth/assets/' + (jsFile ? jsFile.split('/').pop() : '');
  document.body.appendChild(js);
}
