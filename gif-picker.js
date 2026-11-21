/* GIF picker for the chat composer: a bottom sheet that searches GIPHY through
   the gif-search edge function. Picking a GIF downloads it and hands it to the
   composer as a normal .gif attachment, so it is previewed and sent like any
   other file. If search is not available, the sheet offers the file picker. */
(() => {
  'use strict';
  let options = null, dialog = null, current = null, generation = 0, debounce = 0, observer = null;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const searchIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
  const TOPICS = [['Tendencias', ''], ['Jaja', 'jaja'], ['Hola', 'hola'], ['Ok', 'ok'], ['Fiesta', 'fiesta'], ['Amor', 'amor'], ['Triste', 'triste'], ['Enfadado', 'enfadado'], ['Fútbol', 'futbol'], ['Buenas noches', 'buenas noches']];
  const closeIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

  function build() {
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.className = 'gif-picker';
    dialog.setAttribute('aria-labelledby', 'gifPickerTitle');
    dialog.innerHTML = `<div class="gif-picker-sheet" tabindex="-1" autofocus>
        <span class="gif-picker-grabber" aria-hidden="true"></span>
        <h2 id="gifPickerTitle" class="gif-picker-title">GIFs</h2>
        <div class="gif-picker-head"><label class="gif-picker-search">${searchIcon}<input type="search" data-gif-query placeholder="Buscar GIFs" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Buscar GIFs"></label><button type="button" class="gif-picker-close" data-gif-close aria-label="Cerrar">${closeIcon}</button></div>
        <div class="gif-picker-chips" role="group" aria-label="Temas">${TOPICS.map(([label, query]) => `<button type="button" data-gif-topic="${escape(query)}" aria-pressed="${query === ''}">${escape(label)}</button>`).join('')}</div>
        <div class="gif-picker-scroll" data-gif-scroll><div class="gif-picker-grid" data-gif-grid role="list"><div class="gif-picker-col"></div><div class="gif-picker-col"></div></div><p class="gif-picker-status" data-gif-status role="status" aria-live="polite"></p><span class="gif-picker-sentinel" data-gif-sentinel aria-hidden="true"></span></div>
        <footer class="gif-picker-foot"><button type="button" class="gif-picker-file" data-gif-file>Elegir del móvil</button><span class="gif-picker-credit">Powered by <b>GIPHY</b></span></footer>
      </div>`;
    document.body.append(dialog);
    dialog.addEventListener('click', event => {
      if (event.target === dialog || event.target.closest('[data-gif-close]')) { close(); return; }
      if (event.target.closest('[data-gif-file]')) { const pick = current?.pickFile; close(); pick?.(); return; }
      const tile = event.target.closest('[data-gif-url]');
      if (tile) { void choose(tile); return; }
      const topic = event.target.closest('[data-gif-topic]');
      if (topic) { dialog.querySelector('[data-gif-query]').value = ''; clearTimeout(debounce); load(topic.dataset.gifTopic, 0); }
    });
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.querySelector('[data-gif-query]').addEventListener('input', event => {
      clearTimeout(debounce);
      const value = event.target.value;
      debounce = setTimeout(() => load(value.trim(), 0), 320);
    });
    dialog.querySelector('[data-gif-query]').addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); clearTimeout(debounce); event.target.blur(); load(event.target.value.trim(), 0); }
    });
    observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting) && current?.next != null && !current.loading) load(current.query, current.next);
    }, {root: dialog.querySelector('[data-gif-scroll]'), rootMargin: '0px 0px 400px 0px'}) : null;
    observer?.observe(dialog.querySelector('[data-gif-sentinel]'));
    return dialog;
  }

  function status(text) { dialog.querySelector('[data-gif-status]').textContent = text; }

  async function load(query, offset) {
    if (!current) return;
    const token = offset ? generation : ++generation;
    const grid = dialog.querySelector('[data-gif-grid]');
    const columns = [...grid.children];
    if (!offset) {
      // Placeholder tiles while the first page loads, so the sheet never sits empty.
      columns.forEach((column, index) => { column.innerHTML = [1.2, .8, 1, 1.4].map((ratio, n) => `<span class="gif-picker-skeleton" style="--gif-ratio:${index ? [.9, 1.3, .8, 1.1][n] : ratio}"></span>`).join(''); });
      current.heights = [0, 0];
      dialog.querySelector('[data-gif-scroll]').scrollTop = 0; current.next = null;
    }
    current.query = query; current.loading = true;
    const topical = dialog.querySelector(`[data-gif-topic="${CSS.escape(query)}"]`) && !dialog.querySelector('[data-gif-query]').value.trim();
    dialog.querySelectorAll('[data-gif-topic]').forEach(chip => chip.setAttribute('aria-pressed', String(topical && chip.dataset.gifTopic === query)));
    status('');
    try {
      const {data, error} = await options.invoke('gif-search', {body: {action: 'search', q: query, offset}});
      if (token !== generation || !current) return;
      if (!offset) columns.forEach(column => column.replaceChildren());
      if (error) {
        const body = await error.context?.json?.().catch(() => null);
        const unavailable = body?.code === 'not_configured';
        status(unavailable ? 'La búsqueda de GIFs aún no está activada. Puedes elegir uno del móvil.' : (body?.error || 'No se pudieron cargar los GIFs.'));
        dialog.classList.toggle('is-unavailable', unavailable);
        return;
      }
      const items = Array.isArray(data?.items) ? data.items : [];
      // Two balanced columns: each GIF goes to the shorter one, so pages
      // appended later never reshuffle what is already on screen.
      for (const gif of items) {
        const ratio = Math.max(.5, Math.min(2.2, (Number(gif.width) || 1) / (Number(gif.height) || 1)));
        const target = current.heights[0] <= current.heights[1] ? 0 : 1;
        current.heights[target] += 1 / ratio;
        columns[target].insertAdjacentHTML('beforeend', `<button type="button" class="gif-picker-tile" role="listitem" data-gif-url="${escape(gif.gif)}" data-gif-title="${escape(gif.title)}" style="--gif-ratio:${ratio}" aria-label="${escape(gif.title || 'GIF')}"><img src="${escape(gif.preview)}" alt="" loading="lazy" decoding="async" draggable="false"></button>`);
      }
      current.next = data?.next ?? null;
      status(grid.querySelector('.gif-picker-tile') ? '' : query ? 'No hay GIFs para esa búsqueda.' : 'No hay GIFs ahora mismo.');
    } catch { if (token === generation) { if (!offset) columns.forEach(column => column.replaceChildren()); status('No se pudieron cargar los GIFs.'); } }
    finally { if (token === generation && current) current.loading = false; }
  }

  async function choose(tile) {
    if (!current || current.choosing) return;
    current.choosing = true;
    tile.classList.add('is-loading');
    tile.setAttribute('aria-busy', 'true');
    const session = current;
    try {
      const {data, error} = await options.invoke('gif-search', {body: {action: 'download', url: tile.dataset.gifUrl}});
      if (session !== current) return;
      if (error || !(data instanceof Blob) || !data.size) throw new Error('download');
      const name = `${(tile.dataset.gifTitle || 'gif').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40) || 'gif'}.gif`;
      const file = new File([data], name, {type: 'image/gif', lastModified: Date.now()});
      const pick = session.onPick;
      close();
      pick?.(file);
    } catch {
      if (session === current) status('No se pudo preparar ese GIF. Prueba con otro.');
    } finally {
      tile.classList.remove('is-loading');
      tile.removeAttribute('aria-busy');
      session.choosing = false;
    }
  }

  function open({onPick, pickFile, trigger} = {}) {
    if (!options?.invoke) { pickFile?.(); return; }
    build();
    current = {onPick, pickFile, trigger, query: '', next: null, loading: false, choosing: false, heights: [0, 0]};
    dialog.classList.remove('is-unavailable');
    dialog.querySelector('[data-gif-query]').value = '';
    if (!dialog.open) dialog.showModal();
    load('', 0);
  }

  function close() {
    if (!dialog?.open) { current = null; return; }
    const trigger = current?.trigger;
    current = null; generation++;
    clearTimeout(debounce);
    dialog.close();
    if (trigger?.isConnected) trigger.focus({preventScroll: true});
  }

  globalThis.GifPicker = Object.freeze({
    initialize(config) { options = config; },
    open,
    close,
    get isOpen() { return !!dialog?.open; }
  });
})();
