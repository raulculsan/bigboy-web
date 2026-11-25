/* Cloudflare Turnstile, only when the server asks for it (security review, 2026-11-24).
   account-requests answers 428 {captcha: true} when sign-ins look like an attack; then this
   loads Turnstile, shows it in a small dialog and the request is sent again with its token.
   Day to day nobody sees it. Used by the app (app.js) and the website (/app/captcha.js). */
(() => {
  'use strict';
  const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  let loading = null;

  function load() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    loading ||= new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT;
      script.async = true;
      script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('No se pudo cargar la comprobación.')));
      script.onerror = () => { loading = null; script.remove(); reject(new Error('No se pudo cargar la comprobación. Revisa la conexión.')); };
      document.head.append(script);
    });
    return loading;
  }

  function styles() {
    if (document.getElementById('bbCaptchaStyle')) return;
    const style = document.createElement('style');
    style.id = 'bbCaptchaStyle';
    style.textContent = `
.bb-captcha{border:0;border-radius:16px;padding:22px 20px 16px;max-width:min(360px,calc(100vw - 32px));background:#16151a;color:#f4f2ee;font:15px/1.4 system-ui,sans-serif;text-align:center}
.bb-captcha::backdrop{background:#0009}
.bb-captcha h2{margin:0 0 6px;font-size:17px}
.bb-captcha p{margin:0 0 14px;color:#b9b5ad;font-size:14px}
.bb-captcha-box{min-height:68px;display:grid;place-items:center}
.bb-captcha button{margin-top:12px;border:1px solid #ffffff33;border-radius:10px;background:transparent;color:inherit;font:inherit;padding:8px 16px;cursor:pointer}
.bb-captcha button:focus-visible{outline:2px solid #ffffffb3;outline-offset:2px}`;
    document.head.append(style);
  }

  // Resolves with a Turnstile token; rejects if it fails or the person cancels.
  async function solve(siteKey) {
    if (!siteKey) throw new Error('La comprobación de seguridad no está configurada.');
    const turnstile = await load();
    styles();
    return new Promise((resolve, reject) => {
      const dialog = document.createElement('dialog');
      dialog.className = 'bb-captcha';
      dialog.setAttribute('aria-labelledby', 'bbCaptchaTitle');
      dialog.innerHTML = '<h2 id="bbCaptchaTitle">Comprobación de seguridad</h2><p>Ha habido muchos intentos de entrar. Confirma que eres tú.</p><div class="bb-captcha-box"></div><button type="button">Cancelar</button>';
      let widget = null, done = false;
      const finish = (ok, value) => {
        if (done) return;
        done = true;
        try { if (widget !== null) turnstile.remove(widget); } catch {}
        dialog.close();
        dialog.remove();
        ok ? resolve(value) : reject(value);
      };
      dialog.querySelector('button').addEventListener('click', () => finish(false, new Error('Has cancelado la comprobación.')));
      dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false, new Error('Has cancelado la comprobación.')); });
      document.body.append(dialog);
      dialog.showModal();
      widget = turnstile.render(dialog.querySelector('.bb-captcha-box'), {
        sitekey: siteKey,
        language: 'es',
        theme: 'dark',
        callback: token => finish(true, token),
        'error-callback': () => finish(false, new Error('No se pudo hacer la comprobación. Inténtalo de nuevo.')),
        'expired-callback': () => finish(false, new Error('La comprobación ha caducado. Inténtalo de nuevo.')),
      });
    });
  }

  // POSTs JSON; if the server asks for the check, solves it and sends the same body again once.
  async function postJSON(url, headers, body, {siteKey = window.BIG_BOY_CONFIG?.turnstileSiteKey, timeout = 20000} = {}) {
    const send = payload => fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json', ...headers}, body: JSON.stringify(payload), signal: AbortSignal.timeout(timeout)});
    let response = await send(body);
    let result = await response.json().catch(() => ({}));
    if (response.status === 428 && result.captcha) {
      const captcha = await solve(siteKey);
      response = await send({...body, captcha});
      result = await response.json().catch(() => ({}));
    }
    return {response, result};
  }

  window.BBCaptcha = Object.freeze({solve, postJSON});
})();
