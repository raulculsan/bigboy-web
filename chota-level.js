// Niveles del Chota: experience from everything in the club; each level-up
// gives extra packs (one at once, then one per hour of the bonus). The server
// decides levels and packs (get_chota_level); this only shows them.
(() => {
  let options = null, data = null, owner = null, request = null, poll = 0, tick = 0;
  const celebrated = new Set();
  let celebration = null, generation = 0;
  const node = () => document.querySelector('[data-chota-level]');
  const reduced = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const format = value => new Intl.NumberFormat('es-ES').format(Math.max(0, Math.trunc(Number(value) || 0)));
  const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
  function untilText(at) {
    const minutes = Math.max(0, Math.ceil((new Date(at).getTime() - Date.now()) / 60000));
    if (minutes < 1) return 'ya mismo';
    if (minutes < 60) return `en ${plural(minutes, 'minuto', 'minutos')}`;
    const hours = Math.floor(minutes / 60), rest = minutes % 60;
    return `en ${hours} h${rest ? ` ${rest} min` : ''}`;
  }
  function render() {
    const root = node();
    if (!root) return;
    if (!data || owner !== options?.session?.()) { root.hidden = true; return; }
    root.hidden = false;
    const level = Number(data.level) || 1, from = Number(data.level_xp) || 0, to = Number(data.next_level_xp) || from + 1, xp = Number(data.xp) || 0;
    const share = Math.max(0, Math.min(1, (xp - from) / Math.max(1, to - from)));
    if (celebration?.row !== root) root.querySelector('[data-chota-level-number]').textContent = String(level);
    const bar = root.querySelector('.col-chota-level-bar');
    if (celebration?.row !== root) bar.style.setProperty('--level-progress', `${Math.round(share * 100)}%`);
    bar.setAttribute('aria-valuenow', String(Math.round(share * 100)));
    bar.setAttribute('aria-valuetext', `${format(xp - from)} de ${format(to - from)} puntos para el nivel ${level + 1}`);
    root.querySelector('[data-chota-level-xp]').textContent = `${format(xp - from)}/${format(to - from)} para el nivel ${level + 1}`;
    const bonus = root.querySelector('[data-chota-level-bonus]'), active = data.bonus;
    bonus.hidden = !active;
    if (active) {
      const left = Number(active.remaining_packs) || 0;
      bonus.textContent = `Sobres extra: ${plural(left, 'sobre más', 'sobres más')} · el siguiente ${untilText(active.next_pack_at)}`;
    }
  }
  // Keep the whole sequence owned by celebrate: reset/logout cancels every stage.
  function celebrate(result, previous) {
    const level = Math.max(1, Math.trunc(Number(result.level_up.level) || 1));
    const key = `${owner}:${level}`;
    if (celebrated.has(key)) return;
    celebrated.add(key);
    celebration?.cleanup();
    const quiet = reduced(), timers = new Set(), row = node();
    const hours = Math.max(1, Math.trunc(Number(result.level_up.hours) || 1));
    const dialog = document.createElement('dialog');
    dialog.className = 'chota-levelup-dialog';
    dialog.dataset.reducedMotion = String(!!quiet);
    dialog.setAttribute('aria-label', `El Chota sube al nivel ${level}`);
    dialog.innerHTML = `<button type="button" class="chota-levelup-pop" data-levelup-close aria-disabled="${!quiet}"><span class="chota-levelup-rays" aria-hidden="true"></span><span class="chota-levelup-confetti" aria-hidden="true"></span><span class="col-chota-sprite chota-levelup-sprite" aria-hidden="true"></span><small>¡Subes de nivel!</small><strong>Nivel <b>${level}</b></strong><span class="chota-levelup-reward"><img class="chota-levelup-pack" src="icons/cards/sobre-coleccion-01-v3.png" width="56" height="84" alt="" draggable="false"><span><b>+1 sobre ahora</b><span>Otro cada hora durante ${hours} h</span></span></span><em>${quiet ? 'Toca para seguir' : '¡El Chota está celebrando!'}</em></button>`;
    const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); };
    let flight = null, closing = false, ready = !!quiet;
    const state = {row: quiet ? null : row, cleanup};
    function settleRow() {
      row?.classList.remove('is-leveling', 'is-level-impact');
      state.row = null;
      render();
    }
    function cleanup() {
      timers.forEach(clearTimeout); timers.clear();
      if (dialog.open) dialog.close();
      dialog.remove(); flight?.remove();
      if (celebration === state) { celebration = null; settleRow(); }
    }
    function flyPack() {
      const target = ['packsCount', 'packsHomeBalance'].map(id => document.getElementById(id)).find(el => {
        if (!el || el.closest('[hidden]')) return false;
        const rect = el.getBoundingClientRect(), style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
      });
      if (!target) return;
      const start = dialog.querySelector('.chota-levelup-pack').getBoundingClientRect(), end = target.getBoundingClientRect();
      flight = dialog.querySelector('.chota-levelup-pack').cloneNode();
      flight.className = 'chota-levelup-flight';
      flight.setAttribute('aria-hidden', 'true');
      flight.style.cssText = `left:${Math.round(start.left)}px;top:${Math.round(start.top)}px;--fly-x:${Math.round(end.left + end.width / 2 - start.left - start.width / 2)}px;--fly-y:${Math.round(end.top + end.height / 2 - start.top - start.height / 2)}px`;
      document.body.append(flight);
    }
    function close() {
      if (!ready || closing) return;
      closing = true;
      if (quiet) { cleanup(); return; }
      flyPack();
      // Release the modal immediately; the remaining flight never catches a tap.
      if (dialog.open) dialog.close();
      dialog.remove();
      later(cleanup, 720);
    }
    function open() {
      settleRow();
      document.body.append(dialog);
      try { dialog.showModal(); } catch { dialog.setAttribute('open', ''); }
      dialog.querySelector('[data-levelup-close]').focus({preventScroll: true});
      if (!quiet) later(() => {
        ready = true;
        dialog.querySelector('[data-levelup-close]').setAttribute('aria-disabled', 'false');
        dialog.querySelector('em').textContent = 'Toca para seguir';
      }, 1500);
      later(close, 6000);
    }
    celebration = state;
    dialog.addEventListener('click', event => { event.stopPropagation(); close(); });
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    if (!quiet) {
      const confetti = dialog.querySelector('.chota-levelup-confetti');
      for (let i = 0; i < 28; i++) {
        const bit = document.createElement('i'), angle = (i / 28) * Math.PI * 2;
        bit.style.cssText = `--burst-x:${Math.round(Math.cos(angle) * (100 + i % 4 * 22))}px;--burst-y:${Math.round(Math.sin(angle) * (120 + i % 3 * 30))}px;--turn:${i * 47}deg;--delay:${i % 4 * 35}ms;--confetti:${['#58c4b6', '#9be7c9', '#ffffff'][i % 3]}`;
        confetti.append(bit);
      }
    }
    if (quiet || !row || row.hidden) { open(); return; }
    row.classList.add('is-leveling');
    row.querySelector('[data-chota-level-number]').textContent = String(previous?.level || Math.max(1, level - 1));
    const bar = row.querySelector('.col-chota-level-bar');
    // Commit the previous width before filling, even on the first server result.
    bar.style.setProperty('--level-progress', previous?.progress || '0%');
    void bar.offsetWidth;
    later(() => bar.style.setProperty('--level-progress', '100%'), 20);
    later(() => {
      row.querySelector('[data-chota-level-number]').textContent = String(level);
      row.classList.add('is-level-impact');
    }, 400);
    later(open, 750);
  }
  async function refresh() {
    const user = options?.session?.();
    if (!user) { data = null; owner = null; celebration?.cleanup(); render(); return null; }
    if (request) return request;
    const revision = generation;
    request = (async () => {
      try {
        const response = await options.rpc('get_chota_level');
        if (response?.error || user !== options.session() || revision !== generation) return null;
        const previous = owner === user && data ? {level: data.level, progress: node()?.querySelector('.col-chota-level-bar').style.getPropertyValue('--level-progress')} : null;
        data = response.data; owner = user;
        render();
        if (Number(data?.packs_granted) > 0) options.packsChanged?.();
        if (data?.level_up) celebrate(data, previous);
        return data;
      } catch { return null; } finally { request = null; }
    })();
    return request;
  }
  function schedule() {
    clearInterval(poll); clearInterval(tick);
    // Bonus packs drip hourly; a light check every two minutes picks them up.
    poll = setInterval(() => { if (!document.hidden) void refresh(); }, 120000);
    tick = setInterval(render, 30000);
  }
  function initialize(config) {
    if (options) return;
    options = config;
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
    schedule();
    void refresh();
  }
  function reset() { generation++; data = null; owner = null; celebration?.cleanup(); celebrated.clear(); render(); }
  globalThis.ChotaLevel = Object.freeze({initialize, refresh, reset, snapshot: () => data});
})();
