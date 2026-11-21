/* Wallet, inventory and purchases are authoritative server RPC results. */
(() => {
  const groupDigits = value => String(Math.trunc(Number(value) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  let options, state = null, busy = false, loading = false, failure = '', notice = '', generation = 0, request = null, profileTarget = null;
  // Bad-luck protection and opening streak (get_pack_luck); absent until the server has it.
  let packLuck = null, lastOpenedPack = null;
  // Chapa grafitero: painted packs count down; when time is up the server
  // deletes them, so refresh the counts.
  let trainTimer = 0;
  const trainCountdown = at => { const left = Math.max(0, Math.ceil((Date.parse(at) - Date.now()) / 1000)); return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; };
  // Chapa siesta: keep the frozen counters and envelope tag in sync with expiry.
  function scheduleTrainTick(expiring, sleepUntil = null) {
    clearTimeout(trainTimer);
    if (!expiring && !sleepUntil) return;
    trainTimer = setTimeout(() => {
      if (expiring && Date.parse(expiring.expires_at) <= Date.now()) { void refresh(true); return; }
      renderPackLuck();
    }, 1000);
  }
  const luckIcons = {
    crown:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8l4 4 4-7 4 7 4-4-2 11H6z"/></svg>',
    bolt:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 3 5 14h6l-1 7 8-11h-6z"/></svg>',
    spray:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 9h7v12H8zM10 5h3v4h-3zM17 4h.01M19 6h.01M17 8h.01M20 3h.01"/></svg>',
    door:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V4h10v17M4 21h16M13 12h.01M8 7l6 6M14 7l-6 6"/></svg>',
    clover:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12c-4 0-6-2-6-4a3 3 0 0 1 6-1 3 3 0 0 1 6 1c0 2-2 4-6 4Zm0 0c-4 0-6 2-6 4a3 3 0 0 0 6 1 3 3 0 0 0 6-1c0-2-2-4-6-4Zm0 0v9"/></svg>',
    target:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 12h.01"/></svg>',
    clock:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/></svg>'
  };
  function renderPackLuck() {
    const box = el('packLuck');
    const luck = state && packLuck;
    const sleepLuck = state || busy || loading ? packLuck : null;
    const sleepUntil = sleepLuck?.sleep_until && Date.parse(sleepLuck.sleep_until) > Date.now() ? sleepLuck.sleep_until : null;
    // The siesta freezes the kind of pack it came out of: your own packs (the
    // main counters and the standard pack) or one bought theme (its slide).
    const sleepSlide = sleepUntil ? sleepLuck.sleep_theme || 'standard' : null;
    for (const id of ['packsCount', 'packsHomeBalance']) {
      const counter = el(id);
      if (sleepSlide === 'standard') counter?.setAttribute('data-frozen', 'true');
      else counter?.removeAttribute('data-frozen');
    }
    document.querySelectorAll('#packCarouselTrack .pack-slide-count').forEach(count => {
      if (sleepSlide && sleepSlide !== 'standard' && count.closest(`[data-pack-slide="${sleepSlide}"]`)) count.setAttribute('data-frozen', 'true');
      else count.removeAttribute('data-frozen');
    });
    let sleepTag = el('packSleepTag');
    const envelope = sleepSlide ? document.querySelector(`#packCarouselTrack [data-pack-slide="${sleepSlide}"] .packs-art-button`) : null;
    if (envelope && !sleepTag) {
      sleepTag = document.createElement('span'); sleepTag.id = 'packSleepTag'; sleepTag.className = 'pack-sleep-tag';
      sleepTag.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 15A9 9 0 0 1 9 4a8 8 0 1 0 10 11Z"/></svg><span></span>';
    }
    if (envelope && sleepTag.parentElement !== envelope) envelope.append(sleepTag);
    if (sleepTag) {
      sleepTag.hidden = !envelope;
      if (envelope) { sleepTag.querySelector('span').textContent = trainCountdown(sleepUntil); sleepTag.setAttribute('aria-label', `Contador congelado: ${trainCountdown(sleepUntil)} restantes`); }
    }
    if (!luck) scheduleTrainTick(null, sleepUntil);
    if (!box) return;
    box.hidden = !luck || (globalThis.PackExtras?.activeSlide?.() || 'standard') !== 'standard';
    const tag = luck?.next_variant === 'themed' ? globalThis.PackExtras?.THEMES?.[luck.next_theme] || 'Temático' : luck?.next_variant === 'choice' ? 'Elección' : luck?.next_boosted ? 'Mejorado' : '';
    el('ownedPackOpen')?.classList.toggle('is-boosted', !!tag);
    if (el('packBoostBadge')) { el('packBoostBadge').hidden = !tag; el('packBoostBadge').textContent = tag; }
    globalThis.PackExtras?.renderCarousel(state && luck ? {...luck, balance: state.balance} : null);
    const pendingButton = el('packChoicePending'); if (pendingButton) pendingButton.hidden = !luck?.pending_choice;
    if (!luck) return;
    // Luck chips: the guaranteed legendary and the boosted pack always, then
    // whatever badge advantage is running (painted packs, closed door, food luck,
    // card target). Each is a small chip with its icon, tone and progress.
    const packs = n => `${n} ${Number(n) === 1 ? 'sobre' : 'sobres'}`;
    const pityAfter = Math.max(1, Number(luck.pity_after) || 1), pityNext = luck.guaranteed_next || luck.pity_in <= 0;
    const expiring = luck.expiring && Date.parse(luck.expiring.expires_at) > Date.now() ? luck.expiring : null;
    scheduleTrainTick(expiring, sleepUntil);
    const chips = [
      {tone:'legendary', icon:'crown', text: pityNext ? 'Legendaria asegurada' : `Legendaria en ${luck.pity_in}`, label: pityNext ? 'Legendaria asegurada en el próximo sobre' : `Legendaria asegurada en ${packs(luck.pity_in)}`, progress: pityNext ? 1 : Math.min(1, (Number(luck.since_top) || 0) / pityAfter), hot: pityNext},
      {tone:'boost', icon:'bolt', text: luck.next_boosted ? 'Próximo mejorado' : `Mejorado en ${luck.boost_in}`, label: luck.next_boosted ? 'El próximo sobre es mejorado' : `Sobre mejorado en ${packs(luck.boost_in)}`, hot: !!luck.next_boosted},
      expiring && {tone:'graffiti', icon:'spray', text: `${expiring.count} pintados · ${trainCountdown(expiring.expires_at)}`, label: `${packs(expiring.count)} ${Number(expiring.count) === 1 ? 'pintado' : 'pintados'}: se borran en ${trainCountdown(expiring.expires_at)}`, hot: true},
      Number(luck.door_packs_left) > 0 && {tone:'door', icon:'door', text: `Sin comunes ×${luck.door_packs_left}`, label: `Sin cartas comunes en ${packs(luck.door_packs_left)}`, hot: true},
      Number(luck.overtime_packs_left) > 0 && {tone:'overtime', icon:'clock', text: `Horas extra ×${luck.overtime_packs_left}`, label: `Horas extra: ${packs(luck.overtime_packs_left)} de miembros épicos o mejores`, hot: true},
      Number(luck.boost_packs_left) > 0 && {tone:'food', icon:'clover', text: `Más suerte ×${luck.boost_packs_left}`, label: `Más suerte en ${packs(luck.boost_packs_left)}`, hot: true},
      luck.target && {tone:'target', icon:'target', text: `Objetivo ${Math.min(luck.fragments, luck.target.cost)}/${luck.target.cost}`, label: `Carta objetivo: ${Math.min(luck.fragments, luck.target.cost)} de ${luck.target.cost} fragmentos`, progress: Math.min(1, (Number(luck.fragments) || 0) / Math.max(1, Number(luck.target.cost) || 1))}
    ].filter(Boolean);
    const markup = chips.map(chip => `<span class="pack-luck-chip" data-tone="${chip.tone}"${chip.hot ? ' data-hot' : ''} aria-hidden="true">${luckIcons[chip.icon]}<span>${escape(chip.text)}</span>${chip.progress != null ? `<i class="pack-luck-meter" style="--fill:${chip.progress.toFixed(3)}"></i>` : ''}</span>`).join('');
    if (box.dataset.chips !== markup) { box.dataset.chips = markup; box.innerHTML = markup; }
    box.setAttribute('role', 'note');
    box.setAttribute('aria-label', chips.map(chip => chip.label).join('. '));
    box.classList.toggle('is-near', chips.some(chip => chip.hot));
  }
  async function loadPackLuck(token, user) {
    try { const data = await rpc('get_pack_luck'); if (token === generation && user === options.session()) { packLuck = data; renderPackLuck(); if (globalThis.PackExtras?.finishOwner() !== user) void globalThis.PackExtras?.loadFinishes(); } }
    catch { /* Older servers have no pack luck: the counters simply stay hidden. */ }
  }
  const memberBanners = new Map();
  const memberBannerRequests = new Map(), memberBannerFetchedAt = new Map();
  let membersTarget = null, memberObserver = null, memberBannerCacheOwner = null, memberBannerCacheSignature = '';
  const memberBannerCacheKey = owner => `bb:member-banner-posters:v1:${options?.cacheNamespace || 'local'}:${owner}`;
  function restoreMemberBannerPosters() {
    const owner = options?.session();
    if (!owner || memberBannerCacheOwner === owner) return;
    memberBanners.clear(); memberBannerFetchedAt.clear();
    memberBannerCacheOwner = owner; memberBannerCacheSignature = '';
    try {
      const cached = JSON.parse(localStorage.getItem(memberBannerCacheKey(owner)) || 'null');
      if (!Array.isArray(cached?.banners) || !Number.isFinite(cached.savedAt) || Date.now() - cached.savedAt > 86400000) return;
      for (const [id, banner] of cached.banners.slice(0, 200)) {
        if (typeof id !== 'string' || (banner !== null && (typeof banner?.id !== 'string' || typeof banner?.name !== 'string' || typeof banner?.art_key !== 'string'))) continue;
        memberBanners.set(id, banner && {id:banner.id, name:banner.name, art_key:banner.art_key,presentation:globalThis.ShopCatalogMedia?.presentation(banner)});
      }
      // No fetched-at timestamps: cached artwork is always revalidated.
    } catch { /* A missing/invalid cache only delays artwork until its RPC. */ }
  }
  function saveMemberBannerPosters() {
    const owner = options?.session();
    if (!owner || memberBannerCacheOwner !== owner) return;
    const banners = [...memberBanners].slice(0, 200).map(([id, banner]) => [id, banner ? {id:String(banner.id), name:String(banner.name || ''), art_key:String(banner.art_key || ''),presentation:globalThis.ShopCatalogMedia?.presentation(banner)} : null]);
    const signature = JSON.stringify(banners);
    if (signature === memberBannerCacheSignature) return;
    try { localStorage.setItem(memberBannerCacheKey(owner), JSON.stringify({savedAt:Date.now(), banners})); memberBannerCacheSignature = signature; } catch {}
  }
  // The own profile paints its last balance and banner at once; the shop RPC replaces them.
  const profileSnapshotKey = owner => `bb:profile-wallet:v1:${options?.cacheNamespace || 'local'}:${owner}`;
  function profileSnapshot(owner) {
    try { const saved = JSON.parse(localStorage.getItem(profileSnapshotKey(owner)) || 'null'); return Number.isFinite(saved?.balance) ? saved : null; } catch { return null; }
  }
  function saveProfileSnapshot(owner) {
    if (!state || !owner) return;
    const banner = state.banners?.find(item => item.id === state.equipped_banner_id);
    try { localStorage.setItem(profileSnapshotKey(owner), JSON.stringify({balance:Number(state.balance) || 0, banner:banner ? {id:banner.id, name:banner.name, art_key:banner.art_key, presentation:banner.presentation ?? null} : null})); } catch {}
  }
  const walletText = () => {
    if (state) return Number(state.balance).toLocaleString('es-ES');
    const saved = options?.session() ? profileSnapshot(options.session()) : null;
    return saved ? Number(saved.balance).toLocaleString('es-ES') : '—';
  };
  const visibleMemberTiles = new Set(), observedMemberTiles = new Set();
  const bannerVideos = new Set(), visibleBannerVideos = new WeakSet(), pendingBannerVideos = new WeakSet();
  const bannerMotionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  let bannerVideoObserver;
  function updateBannerVideo(video) {
    if (!video.isConnected) {
      bannerVideoObserver?.unobserve(video); bannerVideos.delete(video);
      video.pause(); video.removeAttribute('src'); video.load();
      return;
    }
    if (document.hidden || bannerMotionPreference.matches || !visibleBannerVideos.has(video)) {video.pause(); video.classList.remove('is-ready'); return;}
    if (!video.getAttribute('src')) video.src = video.dataset.bannerSrc;
    if (!video.paused || pendingBannerVideos.has(video)) return;
    pendingBannerVideos.add(video);
    // iOS can reject autoplay in Low Power Mode. Keep the poster until actual
    // playback and retry on the next gesture or when the app returns.
    Promise.resolve(video.play()).catch(() => video.classList.remove('is-ready'))
      .finally(() => pendingBannerVideos.delete(video));
  }
  function registerBannerVideos(root = document) {
    bannerVideos.forEach(updateBannerVideo);
    root.querySelectorAll('video[data-banner-src]').forEach(video => {
      if (bannerVideos.has(video)) return;
      bannerVideos.add(video); video.muted = true; video.defaultMuted = true;
      video.autoplay = true; video.playsInline = true;
      video.setAttribute('webkit-playsinline', '');
      video.addEventListener('playing', () => video.classList.add('is-ready'));
      video.addEventListener('pause', () => video.classList.remove('is-ready'));
      video.addEventListener('emptied', () => video.classList.remove('is-ready'));
      video.addEventListener('canplay', () => updateBannerVideo(video));
      video.addEventListener('error', () => {
        if (!video.isConnected || !video.getAttribute('src') || !video.dataset.bannerRemote || video.dataset.remoteTried) return;
        video.dataset.remoteTried = 'true'; video.src = video.dataset.bannerRemote;
        updateBannerVideo(video);
      });
      if ('IntersectionObserver' in globalThis) {
        bannerVideoObserver ||= new IntersectionObserver(entries => entries.forEach(entry => {
          if (entry.isIntersecting) visibleBannerVideos.add(entry.target); else visibleBannerVideos.delete(entry.target);
          updateBannerVideo(entry.target);
        }), {threshold:0.01});
        bannerVideoObserver.observe(video);
      } else {visibleBannerVideos.add(video); updateBannerVideo(video);}
    });
  }
  document.addEventListener('visibilitychange', () => bannerVideos.forEach(updateBannerVideo));
  window.addEventListener('pageshow', () => bannerVideos.forEach(updateBannerVideo));
  document.addEventListener('pointerup', () => {
    for (const video of bannerVideos) if (video.paused) updateBannerVideo(video);
  }, {passive:true});
  bannerMotionPreference.addEventListener('change', () => bannerVideos.forEach(updateBannerVideo));
  let reveal = null, swipe = null, suppressRevealClickUntil = 0, detachRevealFoil, detachRevealVfx;
  let lastInventory = null, inventoryOwner = null, inventorySavedAt = 0, shopResetTimer, shopCountdownTimer;
  const dailyBanners = () => Array.isArray(state?.daily_banner_ids)
    ? state.daily_banner_ids.map(id => state.banners?.find(banner => banner.id === id)).filter(banner => banner && banner.id !== 'banner-de-prueba').slice(0, 5)
    : (state?.banners || []).filter(banner => banner.id !== 'banner-de-prueba' && banner.in_daily_shop !== false).slice(0, 5);
  function updateShopCountdown() {
    clearTimeout(shopCountdownTimer);
    const subtitle = el('shopBannersPanel')?.querySelector('.shop-section-heading p');
    if (!subtitle) return;
    const reset = Date.parse(state?.shop_next_reset_at);
    const remaining = Number.isFinite(reset) ? Math.max(0, Math.ceil((reset - Date.now()) / 1000)) : null;
    const text = remaining === null ? 'Actualización diaria'
      : remaining === 0 ? (online() ? 'Actualizando selección…' : 'Actualización pendiente')
      : `Se renueva en ${[Math.floor(remaining / 3600), Math.floor(remaining / 60) % 60, remaining % 60].map(value => String(value).padStart(2, '0')).join(':')}`;
    if (subtitle.textContent !== text) subtitle.textContent = text;
    // Only the text ticks: artwork and purchase controls retain their DOM state.
    if (remaining > 0 && el('bannerShopDialog')?.open && !document.hidden) {
      shopCountdownTimer = setTimeout(updateShopCountdown, 1000 - Date.now() % 1000 + 20);
    }
  }
  function scheduleShopReset() {
    clearTimeout(shopResetTimer);
    const delay = Date.parse(state?.shop_next_reset_at) - Date.now();
    if (!Number.isFinite(delay) || delay < 0) return;
    shopResetTimer = setTimeout(() => {
      if (options?.session() && el('bannerShopDialog')?.open && !document.hidden) void refresh();
    }, Math.min(delay + 250, 2147483647));
  }
  const offlineInventoryOwnerKey = 'bb:album-inventory:last-owner';
  const inventoryCacheKey = owner => `bb:album-inventory:v1:${owner}`;
  function restoreInventory(owner) {
    if (inventoryOwner === owner) return;
    inventoryOwner = owner || null; lastInventory = null; inventorySavedAt = 0;
    if (!owner) return;
    try {
      const previousOwner=localStorage.getItem(offlineInventoryOwnerKey);
      if(previousOwner && previousOwner!==owner) {localStorage.removeItem(inventoryCacheKey(previousOwner));localStorage.removeItem(offlineInventoryOwnerKey);}
      const cached = JSON.parse(localStorage.getItem(inventoryCacheKey(owner)) || 'null');
      if (cached?.owner !== owner || !Array.isArray(cached.cards) || !Number.isFinite(cached.savedAt)) return;
      lastInventory = cached.cards.filter(row => typeof row.card_id === 'string' && Number.isSafeInteger(row.quantity) && row.quantity > 0).map(row => ({card_id:row.card_id, quantity:row.quantity}));
      inventorySavedAt = cached.savedAt;
    } catch { /* Storage may be disabled. The server inventory remains available. */ }
  }
  function saveInventory(owner, cards) {
    if (!owner || owner !== options?.session() || !Array.isArray(cards)) return;
    inventoryOwner = owner; inventorySavedAt = Date.now(); lastInventory = cards;
    try { localStorage.setItem(inventoryCacheKey(owner), JSON.stringify({owner,savedAt:inventorySavedAt,cards:cards.map(row => ({card_id:row.card_id,quantity:Number(row.quantity)}))})); localStorage.setItem(offlineInventoryOwnerKey,owner); } catch {}
  }
  function offlineInventory() {
    try {
      const owner=localStorage.getItem(offlineInventoryOwnerKey);
      if(!owner)return null;
      const snapshot=JSON.parse(localStorage.getItem(inventoryCacheKey(owner)) || 'null');
      if(snapshot?.owner!==owner || !Array.isArray(snapshot.cards) || !Number.isFinite(snapshot.savedAt))return null;
      return {savedAt:snapshot.savedAt,cards:snapshot.cards.filter(row=>typeof row.card_id==='string' && Number.isSafeInteger(row.quantity) && row.quantity>0).map(row=>({card_id:row.card_id,quantity:row.quantity}))};
    }catch{return null;}
  }
  function forgetOfflineInventory() {
    try {const owner=localStorage.getItem(offlineInventoryOwnerKey);if(owner)localStorage.removeItem(inventoryCacheKey(owner));localStorage.removeItem(offlineInventoryOwnerKey);}catch{}
    document.dispatchEvent(new CustomEvent('bb:offline-album-change'));
  }
  const revealDialog = document.createElement('dialog');
  revealDialog.className = 'pack-reveal-dialog';
  revealDialog.setAttribute('aria-label', 'Abrir sobre: revelar cartas');
  document.body.append(revealDialog);
  // The reveal is an opaque full-screen surface. Once it has faded in, the app
  // underneath stops painting (its looping glows, floats and blurs kept the GPU
  // busy behind it) and shows again the moment the reveal starts to close.
  const appShell = document.querySelector('main.app');
  let coverTimer = 0;
  const coversScreen = () => { const box = revealDialog.getBoundingClientRect(); return box.left <= 1 && box.top <= 1 && box.right >= innerWidth - 1 && box.bottom >= innerHeight - 1; };
  const syncAppCover = () => {
    clearTimeout(coverTimer);
    const showing = revealDialog.open && !revealDialog.dataset.motionClosing;
    if (!showing) { appShell?.classList.remove('is-covered'); return; }
    coverTimer = setTimeout(() => { if (revealDialog.open && !revealDialog.dataset.motionClosing && coversScreen()) appShell?.classList.add('is-covered'); }, 450);
  };
  if (appShell) new MutationObserver(syncAppCover).observe(revealDialog, {attributes: true, attributeFilter: ['open', 'data-motion-closing']});
  const discardEffects = new Set();
  const extraCopies = () => (state?.cards || []).reduce((sum, item) => sum + Math.max(0, Number(item.quantity) - 1), 0);
  const discardPicks = new Map();
  // Cheapest first: the copies people most often want gone sit at the top.
  const duplicateRows = () => (state?.cards || []).filter(item => Number(item.quantity) > 1)
    .map(item => ({id:item.card_id, edition:item.edition, extra:Number(item.quantity) - 1, reward:state.discard_rewards?.[item.edition] || 1}))
    .sort((a, b) => a.reward - b.reward || String(a.id).localeCompare(String(b.id)));
  const characterCardIds = new Set(['francisco-trigo-vice-city','cristobal-fabrik-vice-city','ruben-king-vice-city','felipe-hp-full-art','felipe-hp','daniel-gonzalez-motos-full-art','daniel-gonzalez-motos','jose-enrique-fernandez-cruz-normal','juan-manuel-perez-saldana-retro','juan-carlos-vega-quevedo-retro','carlos-sanchez-rodriguez-retro']);
  function renderReveal() {
    if (!reveal || !revealDialog.open) return;
    if (reveal.summary) { renderRevealSummary(); return; }
    const item = reveal.cards[reveal.index], design = card(item.card_id);
    // Keep the turning card intact during wallet refreshes and discards.
    if (revealDialog.dataset.cardIndex !== String(reveal.index)) {
      detachRevealVfx?.();detachRevealVfx=null;
      detachRevealFoil?.();detachRevealFoil=null;
      revealDialog.dataset.cardIndex = String(reveal.index);
      revealDialog.innerHTML = `<header class="pack-reveal-header"><span class="pack-reveal-count">Carta ${reveal.index + 1} de ${reveal.cards.length}</span><span class="pack-reveal-steps" aria-hidden="true"${reveal.badge?.effect === 'swap' ? ' data-electric' : ''}>${reveal.cards.map((_,step) => `<i${step < reveal.index ? ' data-done' : step === reveal.index ? ' data-current' : ''}></i>`).join('')}</span><button type="button" class="pack-reveal-skip" data-reveal-skip>Ver todas</button><button type="button" data-reveal-close aria-label="Cerrar: todas las cartas ya están guardadas">✕</button></header><div class="pack-reveal-center"><div class="pack-reveal-stage"><button type="button" class="pack-reveal-card" data-reveal-flip aria-label="Girar carta" aria-pressed="false"><span class="pack-reveal-face pack-reveal-back"><img src="${escape(design?.back || 'icons/cards/reverso-comun-unificado-v1.jpg')}" width="948" height="1660" decoding="async" alt="Reverso de carta" draggable="false"></span><span class="pack-reveal-face pack-reveal-front" aria-hidden="true">${design ? `<img src="${escape(design.front)}" width="${escape(design.width || 948)}" height="${escape(design.height || 1660)}" decoding="async" alt="${escape(design.name)}" draggable="false">` : '<span>Carta guardada</span>'}</span></button></div></div><div class="pack-reveal-footer"><div class="pack-reveal-info" aria-live="polite"></div>${chotaMarkup}<div class="pack-reveal-actions"></div><p class="pack-reveal-status" role="status"></p></div>`;
      if((design?.edition==='Full Art'||design?.edition==='Vice City')&&document.documentElement.dataset.motionQuality!=='low'){
        const foil=document.createElement('span');foil.setAttribute('aria-hidden','true');
        revealDialog.querySelector('.pack-reveal-front').append(foil);
        detachRevealFoil=globalThis.CollectionMotion?.attachFullArtFoil(revealDialog.querySelector('.pack-reveal-stage'),foil,design.edition);
      }
      revealDialog.querySelector('[data-reveal-flip]').focus({preventScroll:true});
      // Decode the art before the turn so the flip never waits on a 1–4 MB image.
      void revealDialog.querySelector('.pack-reveal-front img')?.decode?.().catch(() => {});
    }
    const turn = revealDialog.querySelector('[data-reveal-flip]');
    if (reveal.flipped && !turn.classList.contains('is-flipped')) {
      const front = turn.querySelector('.pack-reveal-front');
      front.setAttribute('aria-hidden','false');
      turn.querySelector('.pack-reveal-back').setAttribute('aria-hidden','true');
      turn.classList.add('is-flipped'); turn.setAttribute('aria-pressed','true'); turn.setAttribute('aria-label',`${design?.name || item.card_id}. Pulsa para ${reveal.index + 1 < reveal.cards.length ? 'ver la siguiente carta' : 'terminar el sobre'}${canDiscardReveal(reveal.index) ? '. Flecha arriba para descartarla' : ''}`);
    }
    const displayKind = item.kind === 'member' ? (characterCardIds.has(item.card_id) ? 'Personaje' : 'Miembro') : item.kind === 'object' ? 'Objeto' : item.kind === 'location' ? 'Ubicación' : '';
    const status = reveal.discarded.has(reveal.index) ? 'Repetida descartada' : Number(item.quantity) > 1 ? 'Repetida' : 'Nueva';
    // Wallet refreshes re-render several times per discard; rewriting the same
    // text replays its rise animation and reads as a flicker. Write only on
    // change, and hold the text still while a discarded card turns to dust.
    const info = revealDialog.querySelector('.pack-reveal-info');
    const finishName = item.finish ? globalThis.PackExtras?.FINISH_NAMES?.[item.finish] : '';
    revealDialog.querySelector('.pack-reveal-front')?.toggleAttribute('data-finish', !!item.finish);
    if (item.finish) revealDialog.querySelector('.pack-reveal-front').dataset.finish = item.finish;
    const infoHtml = reveal.flipped ? `<span class="pack-reveal-rarity" data-rarity="${escape(item.edition)}">${escape(rarityNames[item.edition] || item.edition)}</span>${finishName ? `<span class="pack-reveal-finish" data-finish="${escape(item.finish)}">${escape(finishName)}</span>` : ''}<h3>${escape(design?.name || item.card_id)}</h3><p>${escape([displayKind, status].filter(Boolean).join(' · '))}</p>` : '';
    const frozen = reveal.flipped && info.childElementCount && (reveal.discarding || reveal.discarded.has(reveal.index));
    if (!frozen && revealInfoHtml.get(info) !== infoHtml) {info.innerHTML = infoHtml; revealInfoHtml.set(info,infoHtml);}
    if (reveal.flipped) revealDialog.dataset.rarity = item.edition; else delete revealDialog.dataset.rarity;
    paintRevealChota();
    revealDialog.querySelector('.pack-reveal-status').textContent = failure || notice;
  }
  // El Chota watches the draw from the corner and reacts to each card.
  const revealInfoHtml = new WeakMap();
  const chotaMarkup = '<div class="pack-chota" data-mood="wave"><i class="pack-chota-sprite" aria-hidden="true"></i><p class="pack-chota-line"></p></div>';
  const chotaCheers = {common:'Una más pa\'l álbum.',retro:'Esto huele a clásico.',special:'Ojo, que es especial.',epic:'¡Épica! Esto ya es otra cosa.',legendary:'¿¡Legendaria!? Enmárcala.',full_art:'Full Art… qué barbaridad.',halloween:'Uuuh, de Halloween.',vice_city:'Vice City. Pura noche.',wip:'Lona, costuras y etiqueta naranja.'};
  const chotaBig = new Set(['special','epic','legendary','full_art','halloween','vice_city','wip']);
  function chotaSays() {
    if (reveal.phase === 'opening') return ['wave','¡Rájalo! Desliza por arriba del sobre.'];
    const item = reveal.cards[reveal.index];
    if (!reveal.flipped) return ['wait',reveal.index + 1 === reveal.cards.length ? 'La última… que sea buena.' : 'Venga, dale la vuelta.'];
    if (reveal.discarded.has(reveal.index)) return ['calm','Hecho, monedas al bolsillo.'];
    if (Number(item.quantity) > 1) return chotaBig.has(item.edition) ? ['cheer',`Repetida, pero ${(rarityNames[item.edition] || '').toLowerCase()}.`]
      : ['calm',canDiscardReveal(reveal.index) ? 'Repetida. Desliza arriba y te la cambio por monedas.' : 'Repetida, pero bueno.'];
    return [chotaBig.has(item.edition) ? 'cheer' : 'wave',chotaCheers[item.edition] || chotaCheers.common];
  }
  function paintRevealChota() {
    const node = revealDialog.querySelector('.pack-chota');
    if (!node || !reveal) return;
    const [mood,line] = chotaSays();
    node.dataset.mood = mood;
    const text = node.querySelector('.pack-chota-line');
    if (text.textContent !== line) text.textContent = line;
  }
  function canDiscardReveal(index) {
    const item = reveal?.cards[index];
    if (reveal?.swapsLeft > 0) return false;
    if (!item || reveal.discarded.has(index) || reveal.pending.has(index) || reveal.uncertain.has(index) || Number(item.quantity) <= 1) return false;
    const owned = state?.cards?.find(row => row.card_id === item.card_id);
    const leaving = [...reveal.pending].filter(pending => reveal.cards[pending].card_id === item.card_id).length;
    return !state || Number(owned?.quantity) - leaving > 1;
  }
  function showRevealSummary() {
    if (!reveal || reveal.discarding) return;
    clearTimeout(revealTimer);
    stopRevealOpening();
    detachRevealVfx?.(); detachRevealVfx = null;
    detachRevealFoil?.(); detachRevealFoil = null;
    const gesture = swipe; swipe = null;
    if (gesture?.stage.hasPointerCapture(gesture.id)) gesture.stage.releasePointerCapture(gesture.id);
    revealDialog.getAnimations({subtree:true}).forEach(animation => animation.cancel());
    reveal.phase = 'idle'; reveal.advancing = false; reveal.summary = true;
    revealDialog.classList.remove('is-opening-pack');
    delete revealDialog.dataset.cardIndex;
    renderRevealSummary();
    dealRevealSummary();
    revealDialog.querySelector('[data-reveal-save]')?.focus({preventScroll:true});
  }
  const closeGlyph = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
  const shareGlyph = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4M8 8l4-4 4 4M6 12v6.5A1.5 1.5 0 0 0 7.5 20h9a1.5 1.5 0 0 0 1.5-1.5V12"/></svg>';
  const sharedGlyph = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
  const summaryRarityOrder = ['wip','halloween','vice_city','full_art','legendary','epic','special','retro','common'];
  const summaryRank = item => {const rank = summaryRarityOrder.indexOf(item.edition); return rank < 0 ? summaryRarityOrder.length : rank;};
  // The best pull leads the layout; ties favour a new card, then the draw order.
  const summaryOrder = cards => cards.map((item,index) => ({item,index}))
    .sort((a,b) => summaryRank(a.item) - summaryRank(b.item) || Number(a.item.quantity > 1) - Number(b.item.quantity > 1) || a.index - b.index)
    .map(entry => entry.index);
  const summaryStatus = index => reveal.discarded.has(index) || reveal.pending.has(index) ? 'Descartada' : reveal.uncertain.has(index) ? 'Revisar' : Number(reveal.cards[index].quantity) > 1 ? 'Repetida' : 'Nueva';
  const summaryKind = item => item.kind === 'member' ? (characterCardIds.has(item.card_id) ? 'Personaje' : 'Miembro') : item.kind === 'object' ? 'Objeto' : item.kind === 'location' ? 'Ubicación' : '';
  const summaryArt = item => {const design = card(item.card_id); return design?.front || design?.back || 'icons/cards/reverso-comun-unificado-v1.jpg';};
  // Grid tiles and the rail are small: a 360 px thumbnail decodes in a fraction
  // of the full art (PNG fronts reach 4 MB), so the summary deals without stalling.
  const summaryThumb = item => {const design = card(item.card_id); return (design?.front && globalThis.CardThumbnails?.[globalThis.CardMedia?.canonical(design.front) || design.front]) || summaryArt(item);};
  // The share icon opens a small menu of the group sections and private chats.
  function closeShareMenu() {
    const menu = revealDialog?.querySelector('.pack-share-menu');
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    revealDialog.querySelector('[data-pack-share]')?.setAttribute('aria-expanded', 'false');
  }
  function toggleShareMenu() {
    const menu = revealDialog?.querySelector('.pack-share-menu'), button = revealDialog?.querySelector('[data-pack-share]');
    if (!menu || !button) return;
    if (!menu.hidden) { closeShareMenu(); return; }
    const {groups = [], people = []} = globalThis.PackExtras?.shareTargets?.() || {};
    const item = target => `<button type="button" role="menuitem" data-share-type="${escape(target.type)}" data-share-target="${escape(target.id)}">${escape(target.label)}</button>`;
    menu.innerHTML = [
      groups.length ? `<p class="pack-share-menu-label">Grupo</p>${groups.map(item).join('')}` : '',
      people.length ? `<p class="pack-share-menu-label">Privado</p>${people.map(item).join('')}` : '',
    ].join('') || '<p class="pack-share-menu-empty">No hay chats disponibles.</p>';
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    menu.querySelector('[role="menuitem"]')?.focus({preventScroll: true});
  }
  function renderRevealSummary() {
    if (!reveal?.summary || !revealDialog.open) return;
    revealDialog.classList.add('is-pack-summary');
    if (!revealDialog.querySelector('.pack-summary-grid')) {
      reveal.order = summaryOrder(reveal.cards);
      const best = reveal.cards[reveal.order[0]].edition;
      revealDialog.dataset.rarity = best;
      revealDialog.dataset.mood = chotaBig.has(best) ? 'cheer' : 'wave';
      revealDialog.innerHTML = `<header class="pack-summary-header"><div class="pack-summary-title"><i class="pack-chota-sprite" aria-hidden="true"></i>${reveal.badge?.image ? `<img class="pack-summary-badge" src="${escape(reveal.badge.image)}" alt="${escape(reveal.badge.name)}" width="640" height="583" draggable="false">` : ''}<div><h2>${reveal.badge && badgeEditions[reveal.badge.effect] ? `Sobre ${escape(badgeEdition(reveal.badge))}` : reveal.badge?.effect === 'delivery' ? 'Sobre de ubicaciones' : rouletteShot(reveal.badge) === 'vice_city' ? 'Sobre Vice City' : 'Tu sobre'}</h2><p class="pack-summary-tally"></p></div></div><div class="pack-summary-tools"><button type="button" class="pack-summary-share" data-pack-share aria-haspopup="menu" aria-expanded="false" aria-label="Compartir el sobre en un chat" hidden>${shareGlyph}</button><button type="button" class="pack-summary-close" data-reveal-close aria-label="Cerrar: tus cartas están guardadas">${closeGlyph}</button></div><div class="pack-share-menu" role="menu" aria-label="Compartir en" hidden></div></header><div class="pack-summary-content"><div class="pack-summary-grid${reveal.cards.length === 6 ? ' is-featured' : ''}" role="group" aria-label="Cartas del sobre"></div></div><footer class="pack-summary-footer"><div class="pack-swap-bar" hidden><p></p><div><button type="button" data-swap-skip>No cambiar</button><button type="button" data-swap-go disabled>Cambiar</button></div></div><div class="pack-summary-actions"><p class="pack-summary-balance"></p><button type="button" class="packs-buy" data-reveal-save>Guardar todo</button></div><p class="pack-reveal-status" role="status" aria-live="polite"></p></footer><section class="pack-viewer" role="group" aria-label="Carta en grande" hidden><header class="pack-viewer-header"><span class="pack-viewer-count"></span><button type="button" class="pack-summary-close" data-viewer-close aria-label="Volver al sobre">${closeGlyph}</button></header><div class="pack-viewer-stage"><i class="pack-viewer-aura"></i><div class="collection-card-perspective pack-viewer-perspective"><div class="collection-card-tilt pack-viewer-tilt" tabindex="0" role="group" aria-label="Carta interactiva. Flechas para cambiar de carta"><div class="collection-card-stage"><img class="collection-card-face pack-viewer-image" width="948" height="1660" decoding="async" alt="" draggable="false"></div><div class="collection-card-foil" aria-hidden="true"></div></div></div></div><div class="pack-viewer-info" aria-live="polite"><h3></h3><p></p></div><button type="button" class="pack-viewer-discard" data-viewer-discard hidden></button><div class="pack-viewer-rail" role="group" aria-label="Cambiar de carta"></div></section>`;
      revealDialog.querySelector('.pack-summary-grid').innerHTML = reveal.order.map((index,position) => {
        const item = reveal.cards[index], art = position === 0 && reveal.cards.length === 6 ? summaryArt(item) : summaryThumb(item);
        return `<div class="pack-summary-item" data-rarity="${escape(item.edition)}"${item.finish ? ` data-finish="${escape(item.finish)}"` : ''}><i class="pack-summary-aura"></i><button type="button" class="pack-summary-card" data-summary-card="${index}"><img src="${escape(art)}" width="948" height="1660" alt="" draggable="false" decoding="async"><i class="pack-summary-sheen"></i></button><span class="pack-summary-label"></span></div>`;
      }).join('');
      revealDialog.querySelector('.pack-viewer-rail').innerHTML = reveal.order.map((index,position) => `<button type="button" data-viewer-go="${position}" data-rarity="${escape(reveal.cards[index].edition)}" aria-label="Carta ${position + 1}"><img src="${escape(summaryThumb(reveal.cards[index]))}" alt="" draggable="false" decoding="async"></button>`).join('');
    }
    reveal.cards.forEach((item,index) => {
      const button = revealDialog.querySelector(`[data-summary-card="${index}"]`), status = summaryStatus(index);
      button.classList.toggle('is-discarded',reveal.discarded.has(index) || reveal.pending.has(index));
      button.toggleAttribute('data-swap-pick',reveal.swapPick.has(index));
      if (reveal.swapsLeft > 0) button.setAttribute('aria-pressed',String(reveal.swapPick.has(index))); else button.removeAttribute('aria-pressed');
      button.setAttribute('aria-label',`Ver en grande: ${card(item.card_id)?.name || item.card_id}, ${rarityNames[item.edition] || item.edition}, ${status}`);
      const label = button.parentElement.querySelector('.pack-summary-label');
      label.textContent = reveal.swapPick.has(index) ? 'Cambiar' : status; label.dataset.status = reveal.swapPick.has(index) ? 'Cambiar' : status;
    });
    // Chapa rayo: pick up to the remaining swaps, then strike them.
    const swapping = reveal.swapsLeft > 0, swapBar = revealDialog.querySelector('.pack-swap-bar');
    revealDialog.querySelector('.pack-summary-grid').classList.toggle('is-swapping',swapping);
    swapBar.hidden = !swapping;
    if (swapping) {
      const picked = reveal.swapPick.size;
      swapBar.querySelector('p').textContent = picked ? `${picked} de ${reveal.swapsLeft} elegidas` : `Toca hasta ${reveal.swapsLeft} ${reveal.swapsLeft === 1 ? 'carta' : 'cartas'} para cambiarlas`;
      const go = swapBar.querySelector('[data-swap-go]');
      go.textContent = picked ? `Cambiar ${picked}` : 'Cambiar';
      go.disabled = !picked || reveal.swapping || !online();
      swapBar.querySelector('[data-swap-skip]').disabled = reveal.swapping;
    }
    const fresh = reveal.cards.filter(item => Number(item.quantity) <= 1).length, repeated = reveal.cards.length - fresh;
    revealDialog.querySelector('.pack-summary-tally').textContent = [fresh ? `${fresh} ${fresh === 1 ? 'nueva' : 'nuevas'}` : '', repeated ? `${repeated} ${repeated === 1 ? 'repetida' : 'repetidas'}` : ''].filter(Boolean).join(' · ');
    revealDialog.querySelector('[data-reveal-save]').textContent = reveal.discarded.size ? 'Guardar restantes' : 'Guardar todo';
    const shareButton = revealDialog.querySelector('[data-pack-share]');
    if (shareButton) {
      shareButton.hidden = !reveal.packId || !globalThis.PackExtras || reveal.cards.length < 6;
      shareButton.disabled = Boolean(reveal.shared) || reveal.sharing || !online();
      shareButton.toggleAttribute('data-shared', Boolean(reveal.shared));
      shareButton.setAttribute('aria-busy', String(Boolean(reveal.sharing)));
      shareButton.setAttribute('aria-label', reveal.shared ? `Sobre compartido en ${reveal.shared}` : 'Compartir el sobre en un chat');
      shareButton.innerHTML = reveal.shared ? sharedGlyph : shareGlyph;
      if (shareButton.disabled) closeShareMenu();
    }
    revealDialog.querySelector('.pack-summary-balance').textContent = state ? coins() : 'Actualizando saldo…';
    const hint = reveal.swapsLeft > 0 ? '' : reveal.cards.some((item,index) => canDiscardReveal(index)) && online() ? 'Desliza una repetida arriba para cambiarla' : '';
    revealDialog.querySelector('.pack-summary-footer .pack-reveal-status').textContent = failure || notice || hint;
    renderPackViewer();
  }
  // A swapped tile keeps its place; only its art and rarity change.
  function paintSummaryTile(index) {
    const item = reveal.cards[index], button = revealDialog.querySelector(`[data-summary-card="${index}"]`), node = button?.closest('.pack-summary-item');
    if (!node) return;
    node.dataset.rarity = item.edition;
    if (item.finish) node.dataset.finish = item.finish; else delete node.dataset.finish;
    const lead = node.parentElement.classList.contains('is-featured') && node === node.parentElement.firstElementChild;
    button.querySelector('img').src = lead ? summaryArt(item) : summaryThumb(item);
    const rail = revealDialog.querySelector(`[data-viewer-go="${reveal.order.indexOf(index)}"]`);
    if (rail) { rail.dataset.rarity = item.edition; rail.querySelector('img').src = summaryThumb(item); }
  }
  const boltGlyph = '<svg viewBox="0 0 24 48" aria-hidden="true"><path d="M15 0 2 27h8L6 48 22 17h-8L19 0z"/></svg>';
  // Each chosen card is struck by lightning and comes back as the new one.
  function strikeRevealCards(indexes, apply) {
    const reduced = revealReduced();
    return Promise.all(indexes.map((index,n) => new Promise(resolve => {
      const node = revealDialog.querySelector(`[data-summary-card="${index}"]`)?.closest('.pack-summary-item');
      if (!node || reduced) { apply(index); paintSummaryTile(index); resolve(); return; }
      const delay = n * 220, bolt = document.createElement('i');
      bolt.className = 'pack-swap-bolt'; bolt.innerHTML = boltGlyph;
      node.style.setProperty('--strike-delay',`${delay}ms`); node.classList.add('is-struck'); node.append(bolt);
      setTimeout(() => { apply(index); paintSummaryTile(index); }, delay + 240);
      setTimeout(() => { bolt.remove(); node.classList.remove('is-struck'); node.style.removeProperty('--strike-delay'); resolve(); }, delay + 820);
    })));
  }
  async function swapRevealCards() {
    const current = reveal;
    if (!current?.packId || current.swapping || !current.swapPick.size || !online()) return;
    const picks = [...current.swapPick].filter(index => current.cards[index]?.draw_index != null);
    if (!picks.length) return;
    current.swapping = true; failure = ''; notice = ''; renderRevealSummary();
    try {
      const data = await rpc('swap_pack_cards', {target_pack_id: current.packId, draw_indexes: picks.map(index => Number(current.cards[index].draw_index))});
      if (reveal !== current) return;
      const fresh = new Map((data?.cards || []).map(item => [Number(item.draw_index), item]));
      current.swapsLeft = Number(data?.swaps_left) || 0; current.swapPick.clear(); current.dirty = true;
      renderRevealSummary();
      await strikeRevealCards(picks.filter(index => fresh.has(Number(current.cards[index].draw_index))),
        index => { current.cards[index] = {...current.cards[index], ...fresh.get(Number(current.cards[index].draw_index))}; });
    } catch (error) { failure = errorMessage(error); }
    finally { current.swapping = false; if (reveal === current) renderRevealSummary(); }
  }
  // The six cards land from one point and the best pull arrives last.
  function dealRevealSummary() {
    if (revealReduced()) return;
    const grid = revealDialog.querySelector('.pack-summary-grid');
    if (!grid) return;
    const box = grid.getBoundingClientRect(), items = [...grid.children], easing = 'cubic-bezier(.16,1,.3,1)';
    items.forEach((node,position) => {
      const rect = node.getBoundingClientRect(), delay = (items.length - 1 - position) * 70;
      const from = `translate(${box.left + box.width / 2 - rect.left - rect.width / 2}px,${box.top + box.height / 2 - rect.top - rect.height / 2}px) rotate(${(position - 2.5) * 5}deg) scale(.58)`;
      node.animate([{transform:from,opacity:0},{opacity:1,offset:.22},{transform:'none',opacity:1}],{duration:640,delay,easing,fill:'backwards'});
    });
    const lead = items[0], settled = (items.length - 1) * 70 + 300;
    lead?.querySelector('.pack-summary-aura')?.animate([{opacity:0,transform:'scale(.7)'},{opacity:1,transform:'scale(1.12)',offset:.45},{opacity:.72,transform:'scale(1)'}],{duration:900,delay:settled,easing:'ease-out',fill:'backwards'});
    lead?.querySelector('.pack-summary-sheen')?.animate([{transform:'translateX(-130%) skewX(-16deg)'},{transform:'translateX(130%) skewX(-16deg)'}],{duration:800,delay:settled + 80,easing:'cubic-bezier(.4,0,.2,1)'});
  }
  let packViewer = null, detachViewerMotion = null;
  const viewerNode = () => revealDialog.querySelector('.pack-viewer');
  const viewerMotionTarget = () => revealDialog.querySelector('.pack-viewer-perspective');
  function setSummaryInert(value) {
    revealDialog.querySelectorAll('.pack-summary-header,.pack-summary-content,.pack-summary-footer').forEach(node => {node.inert = value;});
  }
  function renderPackViewer() {
    const root = viewerNode();
    if (!packViewer || !root || !reveal?.summary) return;
    const index = reveal.order[packViewer.position], item = reveal.cards[index], design = card(item.card_id);
    root.dataset.rarity = item.edition;
    root.querySelector('.pack-viewer-count').textContent = `${packViewer.position + 1} de ${reveal.cards.length}`;
    const image = root.querySelector('.pack-viewer-image'), art = summaryArt(item);
    if (image.getAttribute('src') !== art) image.src = art;
    image.alt = design?.name || item.card_id;
    root.querySelector('.pack-viewer-info h3').textContent = design?.name || item.card_id;
    root.querySelector('.pack-viewer-info p').textContent = [summaryKind(item), rarityNames[item.edition] || item.edition, summaryStatus(index)].filter(Boolean).join(' · ');
    const discard = root.querySelector('[data-viewer-discard]'), reward = state?.discard_rewards?.[item.edition] || 1;
    discard.hidden = !canDiscardReveal(index);
    discard.disabled = !online();
    discard.textContent = `Cambiar por ${reward} ${reward === 1 ? 'moneda' : 'monedas'}`;
    root.querySelectorAll('[data-viewer-go]').forEach((button,position) => {
      button.toggleAttribute('data-current',position === packViewer.position);
      if (position === packViewer.position) button.setAttribute('aria-current','true'); else button.removeAttribute('aria-current');
    });
  }
  function bindViewerMotion() {
    detachViewerMotion?.();
    const root = viewerNode(), item = reveal.cards[reveal.order[packViewer.position]];
    // A fresh surface binding picks up the touch effect of this card's rarity.
    detachViewerMotion = globalThis.CollectionMotion?.attachCard(root.querySelector('.pack-viewer-tilt'),root.querySelector('.collection-card-foil'),direction => stepPackViewer(direction < 0 ? 1 : -1),card(item.card_id)?.edition);
  }
  function showViewerCard(position,direction) {
    if (!packViewer || position === packViewer.position) return;
    packViewer.position = position;
    renderPackViewer();
    bindViewerMotion();
    if (!revealReduced()) viewerMotionTarget().animate([{transform:`translateX(${direction * 54}px) scale(.94)`,opacity:.25},{transform:'none',opacity:1}],{duration:280,easing:'cubic-bezier(.16,1,.3,1)'});
  }
  function stepPackViewer(step) {
    if (!packViewer) return;
    showViewerCard((packViewer.position + step + reveal.order.length) % reveal.order.length,step);
  }
  const viewerZoom = (from,to) => {
    const scale = from.width / to.width;
    return `translate(${from.left + from.width / 2 - to.left - to.width / 2}px,${from.top + from.height / 2 - to.top - to.height / 2}px) scale(${scale})`;
  };
  function openPackViewer(index) {
    const root = viewerNode();
    if (!root || packViewer) return;
    const trigger = revealDialog.querySelector(`[data-summary-card="${index}"]`);
    packViewer = {position:reveal.order.indexOf(index)};
    root.hidden = false;
    setSummaryInert(true);
    renderPackViewer();
    bindViewerMotion();
    if (!revealReduced()) {
      root.animate([{opacity:0},{opacity:1}],{duration:180,easing:'ease-out'});
      const target = viewerMotionTarget();
      target.animate([{transform:viewerZoom(trigger.getBoundingClientRect(),target.getBoundingClientRect())},{transform:'none'}],{duration:420,easing:'cubic-bezier(.16,1,.3,1)'});
    }
    root.querySelector('.pack-viewer-tilt').focus({preventScroll:true});
  }
  async function closePackViewer() {
    const root = viewerNode();
    if (!packViewer || packViewer.closing || !root) return;
    packViewer.closing = true;
    const trigger = revealDialog.querySelector(`[data-summary-card="${reveal.order[packViewer.position]}"]`);
    if (!revealReduced()) {
      const target = viewerMotionTarget(), options = {duration:240,easing:'cubic-bezier(.4,0,.2,1)',fill:'forwards'};
      const motions = [target.animate([{transform:'none'},{transform:viewerZoom(trigger.getBoundingClientRect(),target.getBoundingClientRect())}],options),root.animate([{opacity:1},{opacity:0}],options)];
      await Promise.all(motions.map(motion => motion.finished.catch(() => {})));
      motions.forEach(motion => motion.cancel());
    }
    detachViewerMotion?.(); detachViewerMotion = null;
    packViewer = null;
    root.hidden = true;
    setSummaryInert(false);
    trigger.focus({preventScroll:true});
  }
  // The card leaves on release and the server catches up behind it, so a slow
  // reply or a full shop render can never hold the gesture. Requests stay
  // sequential; the collection refresh waits for the dialog to close.
  function discardRevealCards(indices) {
    const current = reveal;
    if (!current?.summary || !online()) return;
    const targets = [...new Set(indices)].filter(canDiscardReveal);
    if (!targets.length) return;
    failure = '';
    targets.forEach(index => {current.pending.add(index); current.queue.push(index); void playSummaryExit(index);});
    renderRevealSummary();
    if (!current.draining) void drainRevealDiscards(current);
  }
  async function playSummaryExit(index) {
    const button = revealDialog.querySelector(`[data-summary-card="${index}"]`), node = button?.closest('.pack-summary-item');
    if (!node) return;
    if (packViewer) {
      const surface = viewerMotionTarget(), ash = globalThis.CollectionMotion?.dissolveCard(surface,viewerNode().querySelector('.pack-viewer-image'),revealDialog);
      surface.style.visibility = 'hidden';
      await ash;
      surface.style.removeProperty('visibility');
      if (packViewer && reveal?.order[packViewer.position] === index) stepPackViewer(1);
      return;
    }
    // Read the dragged pose first: the ash starts exactly where the finger left the card.
    const ash = globalThis.CollectionMotion?.dissolveCard(button,button.querySelector('img'),revealDialog);
    node.getAnimations().forEach(animation => animation.cancel());
    node.classList.remove('is-dragging');
    node.classList.add('is-dissolving');
    node.style.removeProperty('transform'); node.style.removeProperty('opacity');
    await ash;
    node.classList.remove('is-dissolving');
    if (!revealReduced()) button.animate([{opacity:0},{opacity:1}],{duration:320,easing:'ease-out'});
  }
  async function drainRevealDiscards(current) {
    const token = generation, user = options.session();
    let discardError = '';
    busy = true; current.draining = true; current.discarding = true;
    try {
      while (current.queue.length) {
        if (token !== generation || user !== options.session()) return;
        const index = current.queue.shift(), item = current.cards[index];
        try {
          // The server checks ownership and always retains the last copy.
          const data = await rpc('discard_duplicate_card',{target_card_id:item.card_id,copies:1});
          if (token !== generation || user !== options.session()) return;
          current.discarded.add(index); current.dirty = true;
          const owned = state?.cards?.find(row => row.card_id === item.card_id);
          if (owned && Number.isFinite(Number(data.quantity))) owned.quantity = Number(data.quantity);
          if (state && Number.isFinite(Number(data.balance))) state.balance = Number(data.balance);
          current.earned += Number(data.coins_earned) || 0;
          notice = `+${current.earned} monedas`;
        } catch (error) {
          // A lost response may follow a committed exchange. Never retry that
          // copy automatically or let a second tap spend another stored copy.
          current.uncertain.add(index); current.dirty = true;
          discardError = errorMessage(error);
          [...current.queue].forEach(waiting => current.pending.delete(waiting));
          current.queue.length = 0;
        }
        current.pending.delete(index);
        renderRevealSummary();
      }
      if (discardError) {failure = `${discardError} Las demás cartas siguen guardadas. Revisa la colección para comprobar el descarte pendiente.`; renderRevealSummary();}
    } finally {
      current.draining = false; current.discarding = false;
      if (token === generation) busy = false;
      if (reveal !== current && current.dirty && token === generation) void refresh();
    }
  }
  let summarySwipe = null;
  revealDialog.addEventListener('pointerdown',event => {
    const target = event.target.closest('[data-summary-card]');
    if (!target || !online() || !canDiscardReveal(Number(target.dataset.summaryCard)) || summarySwipe || !event.isPrimary || event.button !== 0) return;
    const node = target.closest('.pack-summary-item');
    node.getAnimations().forEach(animation => animation.cancel());
    summarySwipe = {target,node,id:event.pointerId,x:event.clientX,y:event.clientY,dy:0,vertical:false};
    target.setPointerCapture(event.pointerId);
  });
  revealDialog.addEventListener('pointermove',event => {
    const gesture = summarySwipe;
    if (!gesture || event.pointerId !== gesture.id) return;
    gesture.dy = event.clientY - gesture.y;
    gesture.vertical ||= gesture.dy < -10 && -gesture.dy > Math.abs(event.clientX - gesture.x) * 1.3;
    if (gesture.vertical) {const lift = Math.min(0,gesture.dy + 10); gesture.node.classList.add('is-dragging'); gesture.node.style.transform = `translateY(${lift}px) rotate(${lift / -60}deg)`; gesture.node.style.opacity = String(Math.max(.45,1 + lift / 260));}
  });
  function finishSummarySwipe(event) {
    const gesture = summarySwipe;
    if (!gesture || gesture.id !== event.pointerId) return;
    summarySwipe = null;
    if (event.type === 'pointerup') gesture.dy = event.clientY - gesture.y;
    if (gesture.target.hasPointerCapture(event.pointerId)) gesture.target.releasePointerCapture(event.pointerId);
    if (!gesture.vertical) return;
    suppressRevealClickUntil = Date.now() + 500;
    const index = Number(gesture.target.dataset.summaryCard);
    if (event.type === 'pointerup' && gesture.dy < -35 && canDiscardReveal(index)) {discardRevealCards([index]); return;}
    const pose = {transform:gesture.node.style.transform,opacity:gesture.node.style.opacity};
    gesture.node.classList.remove('is-dragging');
    gesture.node.style.removeProperty('transform'); gesture.node.style.removeProperty('opacity');
    if (!revealReduced()) gesture.node.animate([pose,{transform:'none',opacity:1}],{duration:260,easing:'cubic-bezier(.16,1,.3,1)'});
  }
  revealDialog.addEventListener('pointerup',finishSummarySwipe);
  revealDialog.addEventListener('pointercancel',finishSummarySwipe);
  revealDialog.addEventListener('lostpointercapture',finishSummarySwipe);
  const revealReduced = () => (globalThis.ClubMotion?.media || matchMedia('(prefers-reduced-motion: reduce)')).matches;
  const motionTimings = globalThis.CollectionMotion?.timings || {flip:420, opening:720, advance:200, discard:480, reward:620};
  let revealTimer = 0, revealOpening = null;
  const stopRevealOpening = () => {revealOpening?.stop();revealOpening = null;revealDialog.classList.remove('is-opening-pack');};
  function finishRevealMotion(current) {
    clearTimeout(revealTimer);
    if (reveal !== current || !revealDialog.open) return;
    current.phase = 'idle';
    revealDialog.classList.remove('is-opening-pack');
    revealDialog.querySelector('.pack-reveal-center')?.classList.remove('is-arriving');
    paintRevealChota();
  }
  function flipReveal() {
    if (!reveal || reveal.flipped || reveal.phase !== 'idle') return;
    // Turning before the front has decoded showed an empty card on some phones:
    // wait for the art (never more than 1.5 s), then turn.
    const art = revealDialog.querySelector('.pack-reveal-front img');
    if (art && !(art.complete && art.naturalWidth) && reveal.artWaited !== reveal.index) {
      const waiting = reveal; waiting.phase = 'preparing'; waiting.artWaited = waiting.index;
      const go = () => { if (reveal !== waiting || waiting.phase !== 'preparing') return; waiting.phase = 'idle'; flipReveal(); };
      void Promise.race([(art.decode?.() || Promise.resolve()).catch(() => {}), new Promise(resolve => setTimeout(resolve, 1500))]).then(go);
      return;
    }
    const current = reveal; current.flipped = true; current.phase = 'flipping'; renderReveal();
    const stage=revealDialog.querySelector('.pack-reveal-stage');
    stage.querySelector('.pack-reveal-card').dataset.packRevealRarity=current.cards[current.index].edition;
    detachRevealVfx?.();
    detachRevealVfx=globalThis.CollectionMotion?.playPackReveal(stage,current.cards[current.index].edition);
    clearTimeout(revealTimer);
    revealTimer = setTimeout(() => finishRevealMotion(current),revealReduced() ? 0 : motionTimings.flip);
  }
  // The whole pack downloads and decodes while the pack is torn, off the main
  // thread, instead of one card ahead; references are kept so the cache holds.
  let revealPreload = [];
  // Decoding six full-size fronts at once stalled the tear on Android (100-240 ms
  // long tasks). What is on screen first loads first: the small thumbnails, the
  // summary's featured card and the first card's back; the large fronts follow
  // one at a time, in reveal order, once the tear is under way.
  let revealPreloadToken = 0;
  function preloadReveal(cards) {
    const token = ++revealPreloadToken, seen = new Set();
    const load = src => {
      if (!src || seen.has(src)) return Promise.resolve();
      seen.add(src);
      const image = new Image(); image.decoding = 'async'; image.src = src; revealPreload.push(image);
      return (image.decode?.() || Promise.resolve()).catch(() => {});
    };
    revealPreload = [];
    const featured = cards[summaryOrder(cards)[0]];
    const designs = cards.map(item => card(item.card_id));
    void Promise.all([...cards.map(item => load(summaryThumb(item))), load(featured && summaryArt(featured)), load(designs[0]?.back)]);
    const rest = designs.flatMap(design => [design?.front, design?.back]).filter(Boolean);
    const next = () => { if (token !== revealPreloadToken || !rest.length) return; void load(rest.shift()).then(next); };
    setTimeout(next, revealReduced() ? 0 : 650);
  }
  // What a badge gives: a whole Vice City pack or a pile of coins.
  const badgeEditions = {vice_city:'Vice City', halloween:'Halloween'};
  const badgeEdition = badge => badgeEditions[badge?.effect] || 'Vice City';
  const badgeSwaps = badge => Number(badge?.swaps) || 3;
  const badgePacks = badge => Number(badge?.packs) || 5;
  const badgeBoosts = badge => Number(badge?.boosts) || 10;
  const badgePainted = badge => Number(badge?.painted) || 10;
  const badgeDoor = badge => Number(badge?.door) || 3;
  const badgeEvicted = badge => Array.isArray(badge?.evicted) ? badge.evicted.length : 0;
  // Chapa militar: what the fired bullet gives.
  const rouletteShots = {coins_2000:'+2.000 monedas', packs_3:'+3 sobres', luck_5:'más suerte en 5 sobres', vice_city:'sobre Vice City', coins_500:'+500 monedas', blank:'bala de fogueo'};
  const rouletteShot = badge => badge?.effect === 'roulette' ? badge.roulette?.shot : null;
  // A bullet's prize reuses the close animation of the badge that gives the same thing.
  const rewardAlias = badge => ({coins_2000:{...badge, effect:'coins', coins:2000}, coins_500:{...badge, effect:'coins', coins:500}, packs_3:{...badge, effect:'rewind', packs:3}, luck_5:{...badge, effect:'delivery', boosts:5}}[rouletteShot(badge)] || (badge?.effect === 'overtime' ? {...badge, effect:'coins', coins:Number(badge.coins) || 500} : badge));
  const badgePrize = badge => badge?.effect === 'coins' ? `+${new Intl.NumberFormat('es-ES').format(Number(badge.coins) || 0)} monedas` : badge?.effect === 'swap' ? `cambiar ${badgeSwaps(badge)} cartas` : badge?.effect === 'blessing' ? 'la carta más difícil de los sobres' : badge?.effect === 'rewind' ? `${badgePacks(badge)} sobres como este` : badge?.effect === 'delivery' ? `sobre de ubicaciones y más suerte en ${badgeBoosts(badge)} sobres` : badge?.effect === 'roulette' ? rouletteShots[rouletteShot(badge)] || 'ruleta rusa' : badge?.effect === 'graffiti' ? `${badgePainted(badge)} sobres pintados para abrir en 10 minutos` : badge?.effect === 'eviction' ? `fuera las comunes y ${badgeDoor(badge)} sobres sin comunes` : badge?.effect === 'sleep' ? 'sobres gratis durante 5 minutos' : badge?.effect === 'overtime' ? `+${new Intl.NumberFormat('es-ES').format(Number(badge.coins) || 500)} monedas y 5 sobres de miembros épicos o mejores` : `sobre ${badgeEdition(badge)}`;
  const badgeLine = badge => badge?.effect === 'coins' ? badgePrize(badge) : badge?.effect === 'swap' ? `Elige ${badgeSwaps(badge)} cartas del sobre para cambiarlas` : badge?.effect === 'blessing' ? 'Reza por ti: te toca la carta más difícil de los sobres' : badge?.effect === 'rewind' ? `Vuelve al pasado: te quedas las cartas y este sobre vuelve ×${badgePacks(badge)}` : badge?.effect === 'delivery' ? `Todo el sobre es de ubicaciones y tus próximos ${badgeBoosts(badge)} sobres tienen más suerte` : badge?.effect === 'roulette' ? 'Ruleta rusa: seis balas, un disparo' : badge?.effect === 'graffiti' ? `¡Cuidado que pasa el tren! Te pinta ${badgePainted(badge)} sobres: ábrelos en 10 minutos o se borran` : badge?.effect === 'eviction' ? `Reservado el derecho de admisión: ${badgeEvicted(badge) ? `${badgeEvicted(badge) === 1 ? 'la común sale' : `las ${badgeEvicted(badge)} comunes salen`} por la puerta y entran cartas mejores` : 'ninguna común entra'}; tus próximos ${badgeDoor(badge)} sobres no traen comunes` : badge?.effect === 'overtime' ? `Horas extra: +${new Intl.NumberFormat('es-ES').format(Number(badge.coins) || 500)} monedas, y tus próximos 5 sobres traen solo miembros épicos o mejores` : badge?.effect === 'sleep' ? 'El contador se duerme: durante 5 minutos abre todos los sobres que quieras sin que baje' : badge?.effect === 'halloween' ? 'Todos los miembros de este sobre son Halloween' : `Todo este sobre es ${badgeEdition(badge)}`;
  // These are presentation-only counters: confirmed balances remain untouched.
  const rewardGlyphs = {
    clock:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    hourglass:'<svg viewBox="0 0 24 24"><path d="M7 3h10M7 21h10M8 3c0 5 8 6 8 9s-8 4-8 9M16 3c0 5-8 6-8 9s8 4 8 9"/></svg>',
    gear:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg>',
    coin:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="7.2"/><path d="M14.6 9.2c-.5-.8-1.5-1.2-2.6-1.2-1.6 0-2.7.8-2.7 2s1.1 1.6 2.7 2 2.8.8 2.8 2.1-1.2 2-2.8 2c-1.2 0-2.3-.5-2.8-1.4M12 6.5v11"/></svg>',
    burger:'<svg viewBox="0 0 32 32"><path fill="#f4d35e" d="M4 14a12 10 0 0 1 24 0ZM4 23h24v2a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3Z"/><path fill="#79c65b" d="m3 15 5 3 5-3 5 3 5-3 6 3v4H3Z"/><path d="M4 22h24M11 8l1 1m6-2 1 1m3 3 1 1"/></svg>',
    fries:'<svg viewBox="0 0 32 32"><path fill="#f4d35e" d="m5 17-1-12 5-1 2 13m1 0V2h5v15m2 0 3-13 5 1-3 13"/><path fill="#79c65b" d="m4 14 4 15h16l4-15-7 4H11Z"/><path d="M13 24h6"/></svg>',
    sushi:'<svg viewBox="0 0 32 32"><path fill="#79c65b" d="M4 12h24v11c0 8-24 8-24 0Z"/><ellipse fill="#fff8d7" cx="16" cy="12" rx="12" ry="8"/><ellipse fill="#f4d35e" cx="16" cy="12" rx="6" ry="4"/><path d="m14 11 4 2M8 20v3m16-3v3"/></svg>',
    takeaway:'<svg viewBox="0 0 32 32"><path d="m18 10 5-8m-1 9 6-7"/><path fill="#f4d35e" d="m4 13 5 16h15l4-16-8-5h-8Z"/><path fill="#79c65b" d="m4 13 8 3 4-5 4 5 8-3-4 9H9Z"/><path d="M12 25h8"/></svg>'
  };
  let cancelBadgeReward = null;
  const rewardVisible = node => {
    if (!node || node.closest('[hidden], [inert], dialog:not([open])')) return false;
    const box = node.getBoundingClientRect(), style = getComputedStyle(node);
    return style.visibility !== 'hidden' && style.display !== 'none' && box.width > 0 && box.height > 0 && box.right > 0 && box.left < innerWidth && box.bottom > 0 && box.top < innerHeight;
  };
  async function playBadgeReward(current) {
    await current.rewardReady;
    if (current.rewardGeneration !== generation || revealReduced()) return;
    const badge = rewardAlias(current.badge), rewind = badge?.effect === 'rewind', delivery = badge?.effect === 'delivery';
    if (!rewind && !delivery && badge?.effect !== 'coins') return;
    const prize = Math.trunc(Number(delivery ? badgeBoosts(badge) : rewind ? badgePacks(badge) : badge.coins));
    const to = delivery ? prize : Number(rewind ? state?.available_packs?.length : state?.balance);
    if (!Number.isSafeInteger(prize) || prize <= 0 || !Number.isSafeInteger(to) || to < prize) return;
    const count = rewind ? [el('packsCount'), el('packsHomeBalance')].find(rewardVisible) : null;
    if (rewind && !count) return;
    const destination = delivery ? [el('packLuck'), el('ownedPackOpen')].find(rewardVisible) : null;
    if (delivery && !destination) return;
    cancelBadgeReward?.();
    const layer = document.createElement('div');
    layer.className = 'badge-reward-layer'; layer.dataset.effect = badge.effect;
    if (delivery) layer.dataset.target = destination.id;
    layer.setAttribute('aria-hidden','true'); layer.setAttribute('popover','manual');
    document.body.append(layer);
    // A manual popover keeps the effect above dialogs without taking focus.
    try { layer.showPopover?.(); } catch {}
    const center = node => { const b = node.getBoundingClientRect(); return {x:b.left + b.width / 2, y:b.top + b.height / 2}; };
    const from = to - prize, animations = [];
    let frame = 0, removed = false, timeout;
    const opacity = count?.style.opacity;
    const cleanup = () => {
      if (removed) return;
      removed = true; cancelAnimationFrame(frame); clearTimeout(timeout);
      media.removeEventListener?.('change', motionChanged);
      animations.forEach(animation => animation.cancel());
      if (count) count.style.opacity = opacity;
      layer.remove();
      if (cancelBadgeReward === cleanup) cancelBadgeReward = null;
    };
    cancelBadgeReward = cleanup;
    const media = globalThis.ClubMotion?.media || matchMedia('(prefers-reduced-motion: reduce)');
    const motionChanged = event => { if (event.matches) cleanup(); };
    media.addEventListener?.('change', motionChanged, {once:true});
    const finish = cleanup;
    const targetNode = destination || document.createElement('div');
    if (!delivery) targetNode.className = rewind ? 'badge-reward-count' : 'badge-reward-wallet';
    const amount = document.createElement('span'); amount.textContent = groupDigits(from);
    if (rewind) {
      const target = center(count), style = getComputedStyle(count);
      Object.assign(targetNode.style,{left:`${target.x}px`,top:`${target.y}px`,font:style.font,color:style.color});
      targetNode.append(amount); layer.append(targetNode); count.style.opacity = '0';
    } else if (!delivery) {
      targetNode.innerHTML = rewardGlyphs.coin;
      targetNode.append(amount);
      const unit = document.createElement('small'); unit.textContent = 'monedas'; targetNode.append(unit);
      layer.append(targetNode);
    }
    const target = center(targetNode), origin = {x:innerWidth / 2,y:innerHeight * .5};
    const animate = (node, frames, timing) => {
      if (!node.animate) return;
      const animation = node.animate(frames,timing); animations.push(animation);
      animation.finished?.catch(() => {});
    };
    try {
      const total = delivery ? 12 : rewind ? 18 : 22, radius = Math.min(innerWidth,innerHeight) * (delivery ? .2 : .28);
      for (let index = 0; index < total; index++) {
        const kind = delivery ? ['burger','fries','sushi','takeaway'][index % 4] : rewind ? ['clock','hourglass','gear'][index % 3] : 'coin';
        const particle = document.createElement('i'); particle.className = `badge-reward-particle is-${kind}`;
        particle.innerHTML = rewardGlyphs[kind]; layer.append(particle);
        const turn = index / total * Math.PI * 2, frames = [];
        for (let step = 0; step <= 32; step++) {
          const t = step / 32, home = Math.max(0,(t - .42) / .58), pull = home * home;
          const r = rewind ? radius * (1 - home) : radius * Math.sin(Math.PI * t) * (.5 + index % 4 / 6);
          const angle = turn + (rewind ? t * Math.PI * 4 : t * .8);
          const x = origin.x + (target.x - origin.x) * pull + Math.cos(angle) * r;
          const y = origin.y + (target.y - origin.y) * pull + Math.sin(angle) * r;
          frames.push({transform:`translate(${x}px,${y}px) translate(-50%,-50%) rotate(${t * (delivery ? 90 : 540)}deg) scale(${.4 + .6 * (1 - home)})`,opacity:Math.min(1,t * 10,(1 - t) * 15)});
        }
        animate(particle,frames,{duration:delivery ? 1050 : rewind ? 1700 : 1150,delay:index * (delivery ? 35 : rewind ? 16 : 45),easing:'linear',fill:'both'});
      }
      const impact = delivery ? 1435 : rewind ? 1980 : 1000, duration = delivery ? 850 : rewind ? 900 : 1150;
      let arrived = false;
      let start;
      const tick = now => {
        if (removed) return;
        start ??= now;
        const elapsed = now - start, progress = Math.max(0,Math.min(1,(elapsed - impact) / duration));
        amount.textContent = groupDigits(from + Math.floor(prize * progress));
        if (elapsed >= impact && !arrived) {
          arrived = true;
          if (delivery) animate(targetNode,[{transform:'translateY(0)'},{transform:'translateY(-5px)',offset:.4},{transform:'translateY(0)'}],{duration:360,easing:'ease-out'});
          else targetNode.classList.add('is-arrived');
          const label = document.createElement('b'); label.className = 'badge-reward-label';
          label.textContent = `+${groupDigits(prize)}${delivery ? ' sobres con más suerte' : rewind ? ' sobres' : ''}`;
          const labelInset = delivery ? Math.min(172,innerWidth / 2) : 72;
          Object.assign(label.style,{left:`${Math.max(labelInset,Math.min(innerWidth - labelInset,target.x))}px`,top:`${Math.max(48,Math.min(innerHeight - 50,target.y + 35))}px`});
          layer.append(label);
        }
        if (progress < 1) frame = requestAnimationFrame(tick);
        else {
          if (!delivery) animate(amount,[{transform:'scale(1)'},{transform:'scale(1.2)',offset:.45},{transform:'scale(1)'}],{duration:360,easing:'ease-out'});
          timeout = setTimeout(finish,850);
        }
      };
      frame = requestAnimationFrame(tick);
    } catch { finish(); }
  }
  // A very rare badge pops once, over the pack before it opens. It cannot be
  // waved away until its entrance (spin, name, line and hint) has finished.
  const badgeEntrance = 1600;
  function popPackBadge(badge, packCards = []) {
    const pop = document.createElement('dialog');
    pop.className = 'pack-badge-dialog';
    pop.setAttribute('aria-label', badge.name);
    pop.dataset.effect = badge.effect || 'vice_city';
    pop.innerHTML = `<button type="button" class="pack-badge-pop" data-badge-close><i class="pack-badge-rays" aria-hidden="true"></i><img class="pack-badge-img" src="${escape(badge.image)}" alt="" width="640" height="583" draggable="false" decoding="async"><strong>¡${escape(badge.name)}!</strong><span>${escape(badgeLine(badge))}</span><small>Toca para abrirlo</small></button>`;
    if (badge.effect === 'sleep') {
      // This scene illustrates the server-confirmed effect; balances stay authoritative.
      const reduced = revealReduced(), timers = [];
      pop.dataset.phase = reduced ? 'result' : 'entrance';
      pop.innerHTML = `<button type="button" class="pack-badge-pop" data-badge-close aria-disabled="true"><div class="sleep-entrance"${reduced ? ' hidden' : ''}><img class="pack-badge-img" src="${escape(badge.image)}" alt="" width="640" height="583" draggable="false"><strong>¡${escape(badge.name)}!</strong><span>${escape(badgeLine(badge))}</span><small class="sleep-entrance-hint"></small></div><div class="sleep-play"${reduced ? '' : ' hidden'}><h2>¡${escape(badge.name)}!</h2><svg class="sleep-scene" viewBox="0 0 360 270" aria-hidden="true"><g class="sleep-moon"><path d="M267 22a32 32 0 1 0 35 43 30 30 0 0 1-35-43Z" fill="#d9edff"/><path d="m230 34 3-8 3 8 8 3-8 3-3 8-3-8-8-3Z" fill="#8fbde5"/></g><g class="sleep-counter"><rect x="70" y="115" width="220" height="115" rx="18" fill="#19263a" stroke="#75889f" stroke-width="2"/><text x="180" y="190" text-anchor="middle" fill="#f0f7ff" font-size="68" font-weight="800">12</text><g class="sleep-ice sleep-ice-left"><path d="m70 132 15-21 13 9 20-9 21 25-19 11 11 24-29-9-11 30-21-9Z" fill="#bdeaff" fill-opacity=".55" stroke="#e7faff" stroke-width="2"/><path d="m74 208 20-21 11 17 24-10 16 25-25 13-15-9-24 10-11-16Z" fill="#85c9ed" fill-opacity=".5" stroke="#d2f3ff" stroke-width="2"/><path d="m84 120 12 21-13 15m13-15 21-7m-30 81 16-9 15 13" fill="none" stroke="#edfcff" stroke-width="2"/></g><g class="sleep-ice sleep-ice-right"><path d="m290 127-18-17-20 13-21-9-14 27 24 9-10 30 29-11 12 25 18-12Z" fill="#bdeaff" fill-opacity=".55" stroke="#e7faff" stroke-width="2"/><path d="m290 208-20-19-18 14-18-10-23 25 21 14 25-10 19 11 14-15Z" fill="#85c9ed" fill-opacity=".5" stroke="#d2f3ff" stroke-width="2"/><path d="m279 125-18 21 17 15m-17-15-22-7m36 76-15-10-21 17" fill="none" stroke="#edfcff" stroke-width="2"/></g><g class="sleep-ice sleep-ice-pane"><rect x="73" y="117" width="214" height="111" rx="16" fill="#a9e5ff" fill-opacity=".12" stroke="#d9f7ff" stroke-width="3"/><path d="m141 118 15 17-9 11m9-11 20 4m28 88-11-16 9-9m-9 9-14-3" fill="none" stroke="#e6faff" stroke-width="2"/><path d="m85 167 43-43m112 96 35-35" stroke="#d9f7ff" stroke-width="8" opacity=".38"/></g></g><g class="sleep-zzz" fill="#c7e6ff" font-weight="700"><text x="104" y="103" font-size="19">Z</text><text x="133" y="78" font-size="25">z</text><text x="164" y="49" font-size="32">z</text></g></svg><div class="sleep-result" aria-live="polite" aria-atomic="true"></div><small class="sleep-hint">El contador se está durmiendo…</small></div></button>`;
      document.body.append(pop);
      const button = pop.querySelector('[data-badge-close]');
      let entranceReady = Infinity, ready = Infinity;
      const later = (callback, delay) => timers.push(setTimeout(callback, delay));
      const close = () => {
        if (!pop.isConnected || pop.classList.contains('is-leaving')) return;
        timers.forEach(clearTimeout);
        pop.classList.add('is-leaving');
        setTimeout(() => { if (pop.open) pop.close(); pop.remove(); }, reduced ? 0 : 260);
      };
      const showResult = () => {
        if (!pop.isConnected) return;
        pop.dataset.phase = 'result';
        pop.querySelector('.sleep-result').innerHTML = '<b>Contador congelado</b><p>5:00 para abrir sobres gratis</p>';
        ready = Date.now() + (reduced ? 0 : 800);
        const unlock = () => { button.setAttribute('aria-disabled', 'false'); pop.querySelector('.sleep-hint').textContent = 'Toca para abrir el sobre'; };
        if (reduced) unlock(); else later(unlock, 800);
      };
      const requestClose = event => {
        event.preventDefault(); event.stopPropagation();
        if (pop.dataset.phase === 'entrance') {
          if (Date.now() >= entranceReady) {
            entranceReady = Infinity; button.setAttribute('aria-disabled', 'true');
            pop.querySelector('.sleep-entrance').hidden = true;
            pop.querySelector('.sleep-play').hidden = false;
            pop.dataset.phase = 'freezing';
            later(showResult, 2800);
          }
          return;
        }
        if (Date.now() >= ready) close();
      };
      pop.addEventListener('click', requestClose);
      pop.addEventListener('cancel', requestClose);
      pop.showModal(); button.focus({preventScroll:true});
      if (reduced) showResult();
      else later(() => {
        if (!pop.isConnected) return;
        entranceReady = Date.now(); button.setAttribute('aria-disabled', 'false');
        pop.querySelector('.sleep-entrance-hint').textContent = 'Toca para dormirlo';
      }, badgeEntrance);
      return;
    }
    if (badge.effect === 'graffiti') {
      // Presentation only: the ten expiring packs already exist on the server.
      const reduced = revealReduced(), step = 270, total = 10;
      const colors = ['#ff63b6', '#45e4cf', '#ffa45b'];
      const packs = Array.from({length:total}, (_, index) => {
        const x = 30 + index % 5 * 65, y = 42 + Math.floor(index / 5) * 100;
        return `<g class="graffiti-pack" transform="translate(${x} ${y})" style="--paint:${colors[index % 3]}"><path class="graffiti-stroke" d="m-5 57 55-43m-58 25 56-26m-48 63 46-28"/><path class="graffiti-paper" pathLength="100" d="m0 3 7-3 6 3 7-3 6 3 7-3 7 3v65l-7 3-7-3-6 3-7-3-6 3-7-3Z"/><path class="graffiti-fold" d="M3 10h34M3 59h34m-25-37 17 19m0-19-17 19"/><path class="graffiti-drip" d="M8 67v12m23-12v19"/><circle class="graffiti-speck" cx="-5" cy="16" r="2"/><circle class="graffiti-speck" cx="47" cy="54" r="3"/></g>`;
      }).join('');
      pop.dataset.phase = reduced ? 'result' : 'entrance';
      pop.innerHTML = `<button type="button" class="pack-badge-pop" data-badge-close aria-disabled="true"><div class="graffiti-entrance"${reduced ? ' hidden' : ''}><img class="pack-badge-img" src="${escape(badge.image)}" alt="" width="640" height="583" draggable="false"><strong>¡${escape(badge.name)}!</strong><span>¡Cuidado que pasa el tren!</span></div><div class="graffiti-play"${reduced ? '' : ' hidden'}><h2>¡${escape(badge.name)}!</h2><svg class="graffiti-scene" viewBox="0 0 360 290" aria-hidden="true"><rect x="1" y="1" width="358" height="250" rx="8" fill="#182329" stroke="#526069" stroke-width="2"/><path d="M10 19h340M10 233h340M117 20v210M243 20v210" stroke="#34434b" stroke-width="3"/>${[16,344].map(x => [30,120,220].map(y => `<circle cx="${x}" cy="${y}" r="3" fill="#718087"/>`).join('')).join('')}${packs}<g class="graffiti-spray" style="--spray-x:30px;--spray-y:42px;--paint:${colors[0]}"><g class="graffiti-mist" fill="currentColor"><path d="m28 22-40-18v35Z" opacity=".2"/><circle cx="0" cy="16" r="9" opacity=".25"/><circle cx="10" cy="23" r="5" opacity=".5"/><circle cx="-7" cy="32" r="3"/><circle cx="-11" cy="8" r="2"/></g><g class="graffiti-can"><path d="M28 26h25v43q-12 7-25 0Z" fill="#d5dedf" stroke="#0a151c" stroke-width="2"/><path d="M29 30h23v30H29Z" fill="currentColor"/><path d="m28 26 5-8h15l5 8M34 18v-6h12v6" fill="#98a9b1" stroke="#0a151c" stroke-width="2"/><path d="M34 14h-5" stroke="#d5dedf" stroke-width="3"/><path d="M33 36v18" stroke="#fff" stroke-width="2" opacity=".6"/></g></g><path d="M0 279h360m-360 6h360" stroke="#526069" stroke-width="2"/><g class="graffiti-train"><path d="M-310 255h255l28 20h-283Z" fill="#61777f"/><path d="M-300 259h230l17 10h-247Z" fill="#15252d"/><path d="M-283 259v10m38-10v10m38-10v10m38-10v10m38-10v10m38-10v10" stroke="#9cdedb" stroke-width="11"/><circle cx="-278" cy="277" r="5" fill="#080e12"/><circle cx="-77" cy="277" r="5" fill="#080e12"/><path d="m-39 269 15 4" stroke="#ecfffb" stroke-width="3"/></g></svg><p class="graffiti-progress"><span data-graffiti-count>0</span> / 10 sobres pintados</p><div class="graffiti-result" aria-live="polite" aria-atomic="true"></div><small class="graffiti-hint">El spray está pintando…</small></div></button>`;
      document.body.append(pop);
      const button = pop.querySelector('[data-badge-close]'), envelopes = [...pop.querySelectorAll('.graffiti-pack')];
      const spray = pop.querySelector('.graffiti-spray'), counter = pop.querySelector('[data-graffiti-count]');
      let ready = Infinity;
      const timers = [];
      const later = (callback, delay) => timers.push(setTimeout(callback, delay));
      const close = () => {
        if (!pop.isConnected || pop.classList.contains('is-leaving')) return;
        timers.forEach(clearTimeout);
        pop.classList.add('is-leaving');
        setTimeout(() => { if (pop.open) pop.close(); pop.remove(); }, reduced ? 0 : 260);
      };
      const showResult = () => {
        if (!pop.isConnected) return;
        pop.dataset.phase = 'result';
        counter.textContent = String(total);
        envelopes.forEach(envelope => envelope.classList.add('is-painted'));
        pop.querySelector('.graffiti-result').innerHTML = `<b>+10 sobres</b><p>Ábrelos en 10 minutos o se borran</p><span class="graffiti-clock" aria-hidden="true"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></svg><span>10:00</span></span>`;
        pop.querySelector('.graffiti-hint').textContent = 'Pintura fresca. ¡Date prisa!';
        ready = Date.now() + 800;
        later(() => {
          button.setAttribute('aria-disabled', 'false');
          pop.querySelector('.graffiti-hint').textContent = 'Toca para abrir el sobre';
        }, 800);
      };
      // Two taps: the badge waits for a tap to start painting, and the result
      // waits for a tap to open the pack; neither takes a tap mid-animation.
      let entranceReady = Infinity;
      const entranceHint = document.createElement('small');
      entranceHint.className = 'graffiti-entrance-hint';
      pop.querySelector('.graffiti-entrance')?.append(entranceHint);
      const requestClose = event => {
        event.preventDefault(); event.stopPropagation();
        if (pop.dataset.phase === 'entrance') { if (Date.now() >= entranceReady) { entranceReady = Infinity; button.setAttribute('aria-disabled', 'true'); startPainting(); } return; }
        if (Date.now() >= ready) close();
      };
      pop.addEventListener('click', requestClose);
      pop.addEventListener('cancel', requestClose);
      pop.showModal();
      button.focus({preventScroll:true});
      if (reduced) showResult();
      else later(() => {
        if (!pop.isConnected) return;
        entranceReady = Date.now();
        button.setAttribute('aria-disabled', 'false');
        entranceHint.textContent = 'Toca para pintar';
      }, badgeEntrance);
      function startPainting() {
        if (!pop.isConnected) return;
        pop.querySelector('.graffiti-entrance').hidden = true;
        pop.querySelector('.graffiti-play').hidden = false;
        pop.dataset.phase = 'painting';
        envelopes.forEach((envelope, index) => {
          later(() => {
            spray.style.setProperty('--spray-x', `${30 + index % 5 * 65}px`);
            spray.style.setProperty('--spray-y', `${42 + Math.floor(index / 5) * 100}px`);
            spray.style.setProperty('--paint', colors[index % 3]);
            envelope.classList.add('is-painting');
          }, index * step);
          later(() => {
            envelope.classList.add('is-painted');
            counter.textContent = String(index + 1);
            if (index === total - 1) showResult();
          }, (index + 1) * step);
        });
      }
      return;
    }
    if (badge.effect === 'eviction') {
      // The server already replaced these draws. This scene only tells their story.
      const reduced = revealReduced(), evicted = Array.isArray(badge.evicted) ? badge.evicted : [];
      const replacements = evicted.map(item => packCards.find(next => next.kicked && next.draw_index === item.draw_index)).filter(Boolean);
      const count = evicted.length, step = 130, flight = 720;
      const cardWidth = Math.min(42, 210 / Math.max(count, 1));
      const mini = (item, index, replacement = false) => {
        const design = card(item.card_id), source = design && (globalThis.CardCollection?.thumbnail?.(design) || design.front);
        const slot = evicted.findIndex(old => old.draw_index === item.draw_index);
        const x = 20 + (replacement ? slot : index) * (210 / Math.max(count, 1));
        return `<g transform="translate(${x} 143)"><g class="eviction-card ${replacement ? 'eviction-new' : 'eviction-old'}" data-card-id="${escape(item.card_id)}" data-draw-index="${escape(item.draw_index)}" style="--flight-x:${285 - x}px;--delay:${index * (replacement ? 90 : step)}ms"><rect width="${cardWidth}" height="74" rx="3" fill="#27333a" stroke="${replacement ? '#e9ebe8' : '#8c9294'}"/>${source ? `<image href="${escape(source)}" width="${cardWidth}" height="74" preserveAspectRatio="xMidYMid meet"/>` : ''}</g></g>`;
      };
      const locks = Array.from({length:badgeDoor(badge)}, (_, i) => `<svg viewBox="0 0 40 48" aria-hidden="true"><path d="m4 7 5-3 5 3 6-3 6 3 5-3 5 3v36H4Z" fill="#293236" stroke="#b8c2c3" stroke-width="1.5"/><path d="M15 24v-5a5 5 0 0 1 10 0v5" fill="none" stroke="#e6eceb" stroke-width="2"/><rect x="12" y="23" width="16" height="13" rx="2" fill="#e6eceb"/><path d="M20 27v5" stroke="#293236" stroke-width="2"/><text x="20" y="12" text-anchor="middle" fill="#e6eceb" font-size="7">${i + 1}</text></svg>`).join('');
      pop.dataset.phase = reduced ? 'result' : 'entrance';
      pop.dataset.empty = String(!count);
      pop.innerHTML = `<button type="button" class="pack-badge-pop" data-badge-close aria-disabled="true"><div class="eviction-entrance"${reduced ? ' hidden' : ''}><img class="pack-badge-img" src="${escape(badge.image)}" alt="" width="640" height="583" draggable="false"><strong>¡${escape(badge.name)}!</strong><span>${escape(badgeLine(badge))}</span></div><div class="eviction-play"${reduced ? '' : ' hidden'}><h2>¡${escape(badge.name)}!</h2><svg class="eviction-scene" viewBox="0 0 360 260" aria-hidden="true"><path d="M0 230h360M251 20v210" stroke="#645347" stroke-width="2"/><path d="M260 30h84v200h-84Z" fill="#0a0809" stroke="#b28a43" stroke-width="8"/><path d="m264 225 76-13v18h-76Z" fill="#503c26"/>${evicted.map((item, index) => mini(item, index)).join('')}<g class="eviction-impact"><path d="m93 137 10-24 12 20 24-12-9 27 26 9-28 12 7 24-26-15-19 21 1-31-28-5 28-11Z" fill="#ff8b35"/><path d="m103 143 10-10 1 17 15 7-19 4-9 14 1-20-13-6Z" fill="#ffe0a1"/></g><g class="eviction-shoe"><path d="m-80 88 100-21 29 60-87 30Z" fill="#26292b" stroke="#090a0b" stroke-width="4"/><path d="m22 109 25-10 17 19q12 8 34 6 34-4 41 25l-2 18-97 9-24-20Z" fill="#101214" stroke="#030405" stroke-width="4"/><path d="m43 134 20-10m-14 18 23-11m-14 17 22-11" stroke="#667074" stroke-width="3"/><path d="M38 157q46 8 100-11l2 20q-41 35-103 12Z" fill="#9b713d" stroke="#d3b471" stroke-width="3"/><path d="m48 161 1 15m12-14 2 16m12-17 3 16m11-18 4 15m9-19 6 14m7-19 7 12" stroke="#312a23" stroke-width="5"/></g><g class="eviction-door"><path d="M264 31h76v195h-76Z" fill="#98652d" stroke="#dab571" stroke-width="3"/><path d="M275 43h54v64h-54Zm0 76h54v92h-54Z" fill="#70481f" stroke="#c1934e" stroke-width="3"/><path d="M280 49h43v52h-43Zm0 77h43v79h-43Z" fill="#9c6b32"/><circle cx="328" cy="116" r="4" fill="#ead299"/><g class="eviction-sign"><path d="m283 80 19-24 22 24" fill="none" stroke="#d6bf94" stroke-width="2"/><rect x="275" y="77" width="56" height="36" rx="2" fill="#f3dfb3" stroke="#513a26" stroke-width="2"/><path d="M282 87h42m-42 7h42m-42 7h42" stroke="#8c7150" stroke-width="2"/><path d="m284 82 38 26m0-26-38 26" stroke="#d62826" stroke-width="6" stroke-linecap="round"/></g></g>${replacements.map((item, index) => mini(item, index, true)).join('')}</svg><div class="eviction-result" aria-live="polite" aria-atomic="true"></div><small class="eviction-hint">${count ? 'Las comunes, a la calle…' : 'Cerrando la puerta…'}</small></div></button>`;
      document.body.append(pop);
      const button = pop.querySelector('[data-badge-close]'), timers = [];
      let ready = Infinity;
      const later = (callback, delay) => timers.push(setTimeout(callback, delay));
      const close = () => {
        if (!pop.isConnected || pop.classList.contains('is-leaving')) return;
        timers.forEach(clearTimeout);
        pop.classList.add('is-leaving');
        setTimeout(() => { if (pop.open) pop.close(); pop.remove(); }, reduced ? 0 : 260);
      };
      const showResult = () => {
        if (!pop.isConnected) return;
        pop.dataset.phase = 'result';
        pop.querySelector('.eviction-result').innerHTML = `${count ? `<b>${count} ${count === 1 ? 'común fuera' : 'comunes fuera'}</b>` : ''}<p>Puerta cerrada: ${badgeDoor(badge)} sobres sin comunes</p><div class="eviction-locks" aria-hidden="true">${locks}</div>`;
        ready = Date.now() + (reduced ? 0 : 800);
        const unlock = () => {
          button.setAttribute('aria-disabled', 'false');
          pop.querySelector('.eviction-hint').textContent = 'Toca para abrir el sobre';
        };
        if (reduced) unlock(); else later(unlock, 800);
      };
      // Two taps: the badge waits until it is tapped to start the kicks, and
      // the result waits until it is tapped to open the pack. Neither moves on
      // by itself, and neither takes a tap before its animation has finished.
      let entranceReady = Infinity;
      const entranceHint = document.createElement('small');
      entranceHint.className = 'eviction-entrance-hint';
      pop.querySelector('.eviction-entrance')?.append(entranceHint);
      const requestClose = event => {
        event.preventDefault(); event.stopPropagation();
        if (pop.dataset.phase === 'entrance') { if (Date.now() >= entranceReady) { entranceReady = Infinity; button.setAttribute('aria-disabled', 'true'); startKicks(); } return; }
        if (Date.now() >= ready) close();
      };
      pop.addEventListener('click', requestClose);
      pop.addEventListener('cancel', requestClose);
      pop.showModal();
      button.focus({preventScroll:true});
      if (reduced) showResult();
      else later(() => {
        if (!pop.isConnected) return;
        entranceReady = Date.now();
        button.setAttribute('aria-disabled', 'false');
        entranceHint.textContent = 'Toca para echarlos';
      }, badgeEntrance);
      function startKicks() {
        if (!pop.isConnected) return;
        pop.querySelector('.eviction-entrance').hidden = true;
        pop.querySelector('.eviction-play').hidden = false;
        pop.dataset.phase = count ? 'kick' : 'slam';
        const slam = count ? 500 + flight + (count - 1) * step : 0;
        if (count) later(() => { pop.dataset.phase = 'slam'; }, slam);
        later(() => { pop.dataset.phase = 'replace'; }, slam + 480);
        later(showResult, slam + 480 + (replacements.length ? 650 + (replacements.length - 1) * 90 : 0));
      }
      return;
    }
    if (badge.effect === 'roulette') {
      // Presentation only: the server has already selected and paid this shot.
      const reduced = revealReduced(), spinDuration = 2400;
      const {chambers, fired} = badge.roulette;
      const shot = rouletteShot(badge), blank = shot === 'blank';
      const icons = {
        coins_2000:'<circle r="14"/><path d="M-5-5H3a4 4 0 0 1 0 8h-6m3-12V9"/>',
        coins_500:'<circle r="10"/><path d="M-3-3H2a3 3 0 0 1 0 6h-4M0-6V6"/>',
        packs_3:'<path d="M-17-9h12v21h-12zm11-5H6V7H-6zM5-9h12v21H5M-16-4h10M-5-9H5M6-4h10"/>',
        luck_5:'<path d="M0 1C-23 4-20-15-9-12-6-23 9-21 9-11 23-14 23 5 3 3L7 16M0 1-6-5M0 1 4-8"/>',
        vice_city:'<text y="6" text-anchor="middle" class="roulette-vc">VC</text>',
        blank:'<path d="M-8-7-5-13H5L8-7V12H-8zM-8-5H8M-4 6 4-2"/>'
      };
      const bullets = chambers.map((prize, index) => {
        const angle = index * Math.PI / 3;
        const x = 180 + Math.sin(angle) * 79, y = 210 - Math.cos(angle) * 79;
        return `<g class="roulette-bullet${index === fired ? ' is-fired' : ''}" data-chamber="${index}" data-shot="${escape(prize)}" transform="translate(${x} ${y}) rotate(${index * 60})"><circle r="32" fill="#0c1113" stroke="#9ba5a2" stroke-width="2"/><circle r="25" fill="${prize === 'blank' ? '#5d6769' : '#b89554'}" stroke="#e2c891" stroke-width="2"/><g class="roulette-prize-icon" fill="none" stroke="${prize === 'blank' ? '#e3e8e8' : '#241f15'}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">${icons[prize] || icons.blank}</g><path class="roulette-spent" d="m-10-10 20 20m0-20-20 20"/></g>`;
      }).join('');
      pop.dataset.phase = reduced ? 'result' : 'entrance';
      pop.dataset.shot = shot;
      pop.style.setProperty('--roulette-stop', `${1800 - fired * 60}deg`);
      pop.innerHTML = `<button type="button" class="pack-badge-pop" data-badge-close aria-disabled="true"><div class="roulette-entrance"${reduced ? ' hidden' : ''}><img class="pack-badge-img" src="${escape(badge.image)}" alt="" width="640" height="583" draggable="false"><strong>¡${escape(badge.name)}!</strong><span>Seis balas. Un disparo.</span></div><div class="roulette-play"${reduced ? '' : ' hidden'}><h2>¡${escape(badge.name)}!</h2><svg class="roulette-drum" viewBox="0 0 360 350" aria-label="Tambor de seis recámaras" role="img"><path d="M155 102V31Q180 17 205 31V102" fill="#64706e" stroke="#b3bcb6" stroke-width="3"/><path d="M166 85V36h28v49" fill="#182023"/><path d="M172 26V17h16v9" fill="#bac2ba"/><g class="roulette-rotor"><circle cx="180" cy="210" r="121" fill="#313e3e" stroke="#a7b2a9" stroke-width="5"/><circle cx="180" cy="210" r="114" fill="none" stroke="#6d795e" stroke-width="8"/>${bullets}<circle cx="180" cy="210" r="23" fill="#182023" stroke="#bd9b5f" stroke-width="4"/><path d="M170 210h20m-10-10v20" stroke="#8a9690" stroke-width="4"/></g><path d="m170 91 10 14 10-14" fill="#e6eae3"/><path class="roulette-flash" d="m180 0 9 18 20-8-8 23 20 8-24 8-17 20-9-21-25-7 19-11-7-20 16 8Z" fill="#ffedbd"/></svg><div class="roulette-result" aria-live="polite" aria-atomic="true"></div><small class="roulette-hint">El tambor está girando…</small></div></button>`;
      document.body.append(pop);
      const button = pop.querySelector('[data-badge-close]');
      let ready = Infinity;
      const timers = [];
      const later = (callback, delay) => timers.push(setTimeout(callback, delay));
      const close = () => {
        if (!pop.isConnected || pop.classList.contains('is-leaving')) return;
        timers.forEach(clearTimeout);
        pop.classList.add('is-leaving');
        setTimeout(() => { if (pop.open) pop.close(); pop.remove(); }, reduced ? 0 : 260);
      };
      const showResult = () => {
        if (!pop.isConnected) return;
        pop.dataset.phase = 'result';
        pop.querySelector('.roulette-result').innerHTML = `<b>${blank ? 'Clic' : '¡Bang!'}</b><p>${escape(blank ? 'Bala de fogueo… esta vez nada' : rouletteShots[shot])}</p>`;
        pop.querySelector('.roulette-hint').textContent = blank ? 'Esta vez nada' : 'Este es tu premio';
        ready = Date.now() + 800;
        later(() => {
          button.setAttribute('aria-disabled', 'false');
          pop.querySelector('.roulette-hint').textContent = 'Toca para abrir el sobre';
        }, 800);
      };
      // Two taps: the badge waits for a tap to spin the cylinder, and the shot
      // waits for a tap to open the pack; neither takes a tap mid-animation.
      let entranceReady = Infinity;
      const entranceHint = document.createElement('small');
      entranceHint.className = 'roulette-entrance-hint';
      pop.querySelector('.roulette-entrance')?.append(entranceHint);
      const requestClose = event => {
        event.preventDefault(); event.stopPropagation();
        if (pop.dataset.phase === 'entrance') { if (Date.now() >= entranceReady) { entranceReady = Infinity; button.setAttribute('aria-disabled', 'true'); startSpin(); } return; }
        if (Date.now() >= ready) close();
      };
      pop.addEventListener('click', requestClose);
      pop.addEventListener('cancel', requestClose);
      pop.showModal();
      button.focus({preventScroll:true});
      if (reduced) showResult();
      else later(() => {
        if (!pop.isConnected) return;
        entranceReady = Date.now();
        button.setAttribute('aria-disabled', 'false');
        entranceHint.textContent = 'Toca para disparar';
      }, badgeEntrance);
      function startSpin() {
        if (!pop.isConnected) return;
        pop.querySelector('.roulette-entrance').hidden = true;
        pop.querySelector('.roulette-play').hidden = false;
        pop.dataset.phase = 'spin';
        later(showResult, spinDuration);
      }
      return;
    }
    document.body.append(pop);
    const ready = Date.now() + (revealReduced() ? 0 : badgeEntrance);
    const close = () => { if (!pop.isConnected || pop.classList.contains('is-leaving')) return; pop.classList.add('is-leaving'); setTimeout(() => { if (pop.open) pop.close(); pop.remove(); }, revealReduced() ? 0 : 260); };
    pop.addEventListener('click', event => { event.stopPropagation(); if (Date.now() >= ready) close(); });
    pop.addEventListener('cancel', event => { event.preventDefault(); if (Date.now() >= ready) close(); });
    pop.showModal();
    pop.querySelector('[data-badge-close]').focus({preventScroll:true});
  }
  function startReveal(cards, packId = null, theme = null, badge = null) {
    if (!cards.length) return;
    preloadReveal(cards);
    globalThis.MotionQuality?.watch();
    reveal = {packId,theme,badge,rewardGeneration:generation,swapsLeft:badge?.effect === 'swap' && packId ? badgeSwaps(badge) : 0,swapPick:new Set(),swapping:false,shared:false,cards,index:0,flipped:false,discarded:new Set(),uncertain:new Set(),pending:new Set(),queue:[],earned:0,phase:'idle'};
    globalThis.PackDiagnostics?.start(revealDialog,{cards:cards.length,theme,send:payload => rpc('record_pack_opening_diagnostic',{payload})});
    revealDialog.classList.remove('is-pack-summary');
    delete revealDialog.dataset.cardIndex; delete revealDialog.dataset.rarity; delete revealDialog.dataset.mood;
    if(globalThis.ClubMotion?.openDialog)globalThis.ClubMotion.openDialog(revealDialog);else revealDialog.showModal(); renderReveal();
    if (badge?.image) popPackBadge(badge, cards);
    if (!revealReduced()) {
      // The draw is already saved: the tear is presentation and can be skipped at any point.
      const current = reveal;
      current.phase = 'opening';
      revealDialog.classList.add('is-opening-pack');
      revealOpening = globalThis.PackOpening?.play({stage:revealDialog.querySelector('.pack-reveal-stage'),
        back:escape(card(cards[0].card_id)?.back || 'icons/cards/reverso-comun-unificado-v1.jpg'),art:globalThis.PackExtras?.themeArt?.(current.theme) || undefined,count:cards.length,
        edition:globalThis.PackOpening.bestEdition(cards),onDone:() => {revealOpening = null; finishRevealMotion(current);}});
      if (!revealOpening) finishRevealMotion(current);
      paintRevealChota();
    }
  }
  revealDialog.addEventListener('click', event => {
    if (event.target.closest('[data-reveal-close]')) globalThis.ClubMotion?.closeDialog ? void globalThis.ClubMotion.closeDialog(revealDialog) : revealDialog.close();
    if (Date.now() < suppressRevealClickUntil) return;
    if (event.target.closest('[data-reveal-skip]')) {showRevealSummary(); return;}
    const viewerRoot = event.target.closest('.pack-viewer');
    if (viewerRoot) {
      const go = event.target.closest('[data-viewer-go]');
      if (go) showViewerCard(Number(go.dataset.viewerGo),Math.sign(Number(go.dataset.viewerGo) - packViewer.position));
      else if (event.target.closest('[data-viewer-discard]')) discardRevealCards([reveal.order[packViewer.position]]);
      else if (event.target.closest('[data-viewer-close]') || !event.target.closest('.pack-viewer-tilt,.pack-viewer-info')) void closePackViewer();
      return;
    }
    const summaryCard = event.target.closest('[data-summary-card]');
    if (summaryCard && reveal?.swapsLeft > 0) {
      const index = Number(summaryCard.dataset.summaryCard);
      if (reveal.swapping || reveal.discarded.has(index) || reveal.pending.has(index)) return;
      if (reveal.swapPick.has(index)) reveal.swapPick.delete(index); else if (reveal.swapPick.size < reveal.swapsLeft) reveal.swapPick.add(index);
      renderRevealSummary(); return;
    }
    if (summaryCard) {openPackViewer(Number(summaryCard.dataset.summaryCard)); return;}
    if (event.target.closest('[data-swap-skip]') && reveal && !reveal.swapping) {reveal.swapsLeft = 0; reveal.swapPick.clear(); renderRevealSummary(); return;}
    if (event.target.closest('[data-swap-go]')) {void swapRevealCards(); return;}
    const shareTarget = event.target.closest('[data-share-target]');
    if (shareTarget && reveal?.packId && !reveal.shared && !reveal.sharing) {
      const current = reveal, target = {type: shareTarget.dataset.shareType, id: shareTarget.dataset.shareTarget};
      closeShareMenu(); current.sharing = true; renderRevealSummary();
      void globalThis.PackExtras.share(current.packId, target).then(data => { current.shared = data.label || 'el chat'; notice = `Compartido en ${current.shared}.`; }).catch(error => { notice = errorMessage(error); }).finally(() => { current.sharing = false; if (reveal === current) renderRevealSummary(); });
      return;
    }
    if (event.target.closest('[data-pack-share]') && reveal?.packId && !reveal.shared && !reveal.sharing) { toggleShareMenu(); return; }
    if (!event.target.closest('.pack-share-menu')) closeShareMenu();
    if (event.target.closest('[data-reveal-save]')) {globalThis.ClubMotion?.closeDialog ? void globalThis.ClubMotion.closeDialog(revealDialog) : revealDialog.close(); return;}
    if (event.target.closest('[data-reveal-flip]')) {if (revealOpening) revealOpening.tear(); else activateReveal();}
  });
  // Swiping a revealed duplicate up exchanges it and moves on. The card only
  // returns if the server refused, since a lost reply is surfaced as a failure.
  const settleRevealStage = stage => {stage.classList.remove('is-dragging'); stage.style.removeProperty('transform'); stage.style.removeProperty('opacity');};
  // The card snaps into dust from the pose the finger left it in, while the
  // exchange runs; the next card only arrives once the last mote is gone.
  async function discardRevealCard(stage) {
    const current = reveal, index = current?.index;
    if (!current?.flipped || current.phase !== 'idle' || current.advancing || current.discarding || busy || loading || !online() || !canDiscardReveal(index)) {settleRevealStage(stage); return false;}
    detachRevealVfx?.(); detachRevealVfx = null;
    const ash = globalThis.CollectionMotion?.dissolveCard(stage.querySelector('.pack-reveal-card'),stage.querySelector('.pack-reveal-front img'),revealDialog) || Promise.resolve();
    settleRevealStage(stage);
    stage.classList.add('is-discarding');
    await mutate('discard_duplicate_card', {target_card_id:current.cards[index].card_id,copies:1}, '', index);
    current.discarding = true;
    await ash;
    current.discarding = false;
    if (reveal === current && current.discarded.has(index) && revealDialog.open) advanceReveal(stage);
    else {
      stage.classList.remove('is-discarding');
      if (!revealReduced()) stage.animate([{opacity:0,transform:'scale(.94)'},{opacity:1,transform:'none'}],{duration:280,easing:'cubic-bezier(.16,1,.3,1)'});
      if (reveal === current) renderReveal();
    }
    return true;
  }
  function activateReveal() {
    if (!reveal || reveal.phase !== 'idle' || reveal.advancing || reveal.discarding) return;
    if (reveal.flipped) advanceReveal(revealDialog.querySelector('.pack-reveal-stage'));
    else flipReveal();
  }
  function advanceReveal(stage) {
    if (!reveal?.flipped || reveal.phase !== 'idle' || reveal.advancing || reveal.discarding) return;
    const current = reveal;
    detachRevealVfx?.();detachRevealVfx=null;
    current.advancing = true; current.phase = 'advancing';
    stage.style.transform = `translateX(${current.releaseX || 0}px)`;
    stage.style.opacity = String(current.releaseOpacity ?? 1);
    current.releaseX = 0; current.releaseOpacity = 1;
    // Commit the finger's final pose before the departure transition starts.
    void stage.offsetWidth;
    stage.classList.add('is-leaving');
    stage.style.removeProperty('transform');
    stage.style.removeProperty('opacity');
    revealTimer = setTimeout(() => {
      if (reveal !== current || !revealDialog.open) return;
      if (current.index + 1 === current.cards.length) showRevealSummary();
      else {
        current.index++; current.flipped = false; current.advancing = false;
        current.phase = revealReduced() ? 'idle' : 'arriving';
        renderReveal();
        if (current.phase === 'arriving') {
          // Entrance belongs to the parent; the card keeps exclusive ownership
          // of rotation and the stage keeps exclusive ownership of swiping.
          revealDialog.querySelector('.pack-reveal-center').classList.add('is-arriving');
          revealTimer = setTimeout(() => finishRevealMotion(current),220);
        }
      }
    }, revealReduced() ? 0 : motionTimings.advance);
  }
  revealDialog.addEventListener('pointerdown', event => {
    const stage = event.target.closest('.pack-reveal-stage');
    if (swipe || !stage || !reveal || reveal.phase !== 'idle' || reveal.advancing || reveal.discarding || !event.isPrimary || event.button !== 0) return;
    swipe = {id:event.pointerId,x:event.clientX,y:event.clientY,stage,flipped:reveal.flipped,index:reveal.index,dx:0,horizontal:false};
    // Keep one capture owner from down through up. Moving capture off the
    // touched button mid-gesture emits a bubbling lostpointercapture.
    stage.setPointerCapture(event.pointerId);
  });
  revealDialog.addEventListener('pointermove', event => {
    if (!swipe || swipe.id !== event.pointerId) return;
    swipe.dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    if (!swipe.horizontal && Math.abs(swipe.dx) > 12 && Math.abs(swipe.dx) > Math.abs(dy) * 1.3) {
      swipe.horizontal = true;
    }
    if (!swipe.horizontal && !swipe.up && swipe.flipped && dy < -12 && -dy > Math.abs(swipe.dx) * 1.3 && canDiscardReveal(swipe.index)) swipe.up = true;
    if (swipe.up) {
      swipe.dy = dy;
      swipe.stage.classList.add('is-dragging');
      swipe.stage.style.transform = `translateY(${Math.min(0,dy) * .6}px) scale(${Math.max(.9,1 + Math.min(0,dy) / 1400)})`;
      swipe.stage.style.opacity = String(Math.max(.82,1 + Math.min(0,dy) / 900));
      return;
    }
    // A swipe on the back reveals it in place; only a revealed card follows
    // the finger when navigating to the next card.
    if (!swipe.horizontal || !swipe.flipped) return;
    swipe.stage.classList.add('is-dragging');
    swipe.stage.style.transform = `translateX(${Math.max(-28,Math.min(0,swipe.dx) * .2)}px)`;
    swipe.stage.style.opacity = String(Math.max(.35, 1 + Math.min(0, swipe.dx) / 400));
  });
  function finishSwipe(event) {
    if (!swipe || swipe.id !== event.pointerId) return;
    // Ignore loss from the child button's implicit touch capture. Only the
    // stage owns this gesture; unrelated bubbling losses cannot cancel it.
    if (event.type === 'lostpointercapture' && event.target !== swipe.stage) return;
    const gesture = swipe; swipe = null;
    if (event.type === 'pointerup') {
      gesture.dx = event.clientX - gesture.x;
      const dy = event.clientY - gesture.y;
      gesture.horizontal ||= Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(dy) * 1.3;
      gesture.tap = !gesture.horizontal && !gesture.up && Math.hypot(gesture.dx,dy) <= 12;
      if (gesture.up) gesture.dy = dy;
    }
    // Any completed pointer sequence owns its follow-up click, including a
    // canceled/vertical gesture. Keyboard activation still reaches click.
    suppressRevealClickUntil = Date.now() + 500;
    if (gesture.stage.hasPointerCapture(event.pointerId)) gesture.stage.releasePointerCapture(event.pointerId);
    // A released discard keeps its lifted pose: the dust starts right there.
    if (event.type === 'pointerup' && reveal?.index === gesture.index && gesture.up && gesture.dy < -Math.min(70,gesture.stage.clientHeight * .16)) {void discardRevealCard(gesture.stage); return;}
    settleRevealStage(gesture.stage);
    if (event.type !== 'pointerup' || !reveal || reveal.index !== gesture.index) return;
    // Capturing on the stage retargets the up/click; handle a stationary tap
    // here as well so tap-to-reveal remains available.
    if (gesture.tap) {activateReveal(); return;}
    if (!gesture.horizontal || gesture.dx >= -Math.min(70,gesture.stage.clientWidth * .25)) return;
    if (gesture.flipped) {
      reveal.releaseX = Math.max(-28,Math.min(0,gesture.dx) * .2);
      reveal.releaseOpacity = Math.max(.35,1 + Math.min(0,gesture.dx) / 400);
      advanceReveal(gesture.stage);
    }
    else flipReveal();
  }
  revealDialog.addEventListener('pointerup', finishSwipe);
  // Escape first folds the share menu, then closes the summary as before.
  revealDialog.addEventListener('cancel', event => {
    const menu = revealDialog.querySelector('.pack-share-menu');
    if (menu && !menu.hidden) { event.preventDefault(); closeShareMenu(); revealDialog.querySelector('[data-pack-share]')?.focus({preventScroll: true}); }
  });
  revealDialog.addEventListener('pointercancel', finishSwipe);
  revealDialog.addEventListener('lostpointercapture', finishSwipe);
  revealDialog.addEventListener('dragstart',event => {if (event.target.closest('.pack-reveal-stage, .pack-summary-card')) event.preventDefault();});
  (globalThis.ClubMotion?.media || matchMedia('(prefers-reduced-motion: reduce)')).addEventListener('change',event => {if (event.matches) {if (revealOpening) {const current = reveal; stopRevealOpening(); finishRevealMotion(current);}detachRevealVfx?.();detachRevealVfx=null;if(reveal && reveal.phase !== 'advancing') finishRevealMotion(reveal);}});
  revealDialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowUp' && reveal && !event.repeat) {
      const summaryCard = event.target.closest('[data-summary-card]');
      if (summaryCard) {event.preventDefault(); discardRevealCards([Number(summaryCard.dataset.summaryCard)]);}
      else if (!reveal.summary) {event.preventDefault(); void discardRevealCard(revealDialog.querySelector('.pack-reveal-stage'));}
    }
    if (event.key === 'ArrowLeft' && reveal && !reveal.summary && reveal.phase === 'idle' && !reveal.advancing && !event.repeat && !event.target.closest('[data-reveal-close]')) {
      event.preventDefault();
      if (reveal.flipped) advanceReveal(revealDialog.querySelector('.pack-reveal-stage'));
      else flipReveal();
    }
  });
  revealDialog.addEventListener('close', () => {if (reveal?.badge) void playBadgeReward(reveal);globalThis.PackDiagnostics?.stop();revealPreload = [];revealPreloadToken++;const syncAfterClose = reveal?.dirty && !reveal.draining;stopRevealOpening();detachRevealVfx?.();detachRevealVfx=null;detachRevealFoil?.();detachRevealFoil=null;detachViewerMotion?.();detachViewerMotion=null;packViewer=null;clearTimeout(revealTimer); summarySwipe = null; revealDialog.getAnimations({subtree:true}).forEach(animation => animation.cancel()); revealDialog.classList.remove('is-opening-pack','is-pack-summary'); reveal = null; const gesture = swipe; swipe = null; if (gesture?.stage.hasPointerCapture(gesture.id)) gesture.stage.releasePointerCapture(gesture.id); (document.querySelector('#packCarouselTrack .pack-slide.is-active button') || el('ownedPackOpen'))?.focus({preventScroll:true});if (syncAfterClose) void refresh();});
  const el = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const card = id => globalThis.CardCollection?.catalog.find(item => item.id === id);
  const online = () => navigator.onLine !== false && !!options?.session();
  const rarityNames = {common:'Común',retro:'Retro',special:'Especial',epic:'Épica',legendary:'Legendaria',full_art:'Full Art',vice_city:'Vice City',halloween:'Halloween',wip:'WIP'};
  const coins = () => state ? `${groupDigits(state.balance)} monedas` : '— monedas';
  function errorMessage(error) {
    if (navigator.onLine === false) return 'Sin conexión. Conéctate para actualizar tu colección y tus monedas.';
    if (['PGRST202','42883','42P01'].includes(error?.code)) return 'La tienda está en preparación. Prueba de nuevo cuando esté activada.';
    return error?.message || 'No se pudo conectar con la tienda. Vuelve a intentarlo.';
  }
  async function rpc(name, args = {}) {
    if (!online()) throw new Error('Conéctate e inicia sesión para usar tu colección y la tienda.');
    const response = await options.rpc(name, args);
    if (response.error) throw response.error;
    return response.data;
  }
  let galiciaSceneId = 0;
  function galiciaArtwork(banner, extra, compact = false, lightweight = false) {
    // Each mounted tile gets its own clip IDs; all joints use the 2172 × 724
    // source coordinates, preserving their registration at every display size.
    const id = `galicia-${++galiciaSceneId}`;
    const sceneFit = compact ? 'none' : 'xMidYMid meet';
    const sceneWidth = compact ? 1299 : 2172;
    const figure = `<image href="icons/banners/${compact ? 'alberto-galicia-member-figures-v1.webp' : 'alberto-galicia-figures-v1.webp'}" width="${sceneWidth}" height="724"/>`;
    const background = `<image href="icons/banners/${compact ? 'alberto-galicia-member-bg-v1.webp' : 'alberto-galicia-bg-v1.webp'}" width="${sceneWidth}" height="724"/>`;
    const head = '275,0 500,0 500,180 442,218 388,241 323,209 290,166';
    const goats = [
      {box:[575,305,510,419], head:'882,466 975,471 987,522 1083,585 1083,724 918,724 884,624 847,557', joint:'906px 539px', tail:'585,322 652,322 675,362 664,412 615,406 585,377', tailJoint:'655px 395px', ear:'858,562 890,550 935,552 946,564 930,587 894,602 864,587', earJoint:'936px 561px', wind:'3.7s', phase:'0s', duration:'5.8s'},
      {box:[1085,305,515,419], head:'1090,451 1180,451 1285,481 1348,572 1303,631 1259,724 1085,724', joint:'1250px 558px', tail:'1500,331 1589,331 1600,377 1580,411 1520,427 1510,398', tailJoint:'1515px 398px', ear:'1085,562 1115,553 1165,550 1160,575 1126,603 1085,615', earJoint:'1158px 560px', wind:'4.6s', phase:'-2.3s', duration:'7.1s'},
      {box:[1600,300,520,424], head:'1600,465 1715,465 1794,496 1855,559 1836,611 1772,724 1600,724', joint:'1770px 558px', tail:'1987,316 2070,316 2070,383 2040,421 1999,406 1990,362', tailJoint:'2006px 400px', ear:'1600,560 1640,551 1700,550 1690,569 1650,586 1600,582', earJoint:'1695px 559px', wind:'3.2s', phase:'-4.1s', duration:'6.4s'}
    ];
    // The Krita exports contain baked goat transforms. Use their final bounds
    // for compact tiles; the wide scene retains its articulated source joints.
    if (compact) {
      [[545,525,239,199],[784,525,234,199],[1018,520,281,204]].forEach((box,i) => { goats[i].box = box; });
    }
    const goatSplit = 575, goatFeet = 565;
    const goatDefs = goats.map((goat, i) => {
      const [x,y,w,h] = goat.box;
      if (compact || lightweight) return `<clipPath id="${id}-goat-${i}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath>`;
      return `<clipPath id="${id}-goat-${i}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath><clipPath id="${id}-goat-head-${i}"><polygon points="${goat.head}"/></clipPath><clipPath id="${id}-goat-upper-${i}"><rect x="${x}" y="${y}" width="${w}" height="${goatSplit-y}"/></clipPath><clipPath id="${id}-goat-feet-${i}"><rect x="${x}" y="${goatFeet}" width="${w}" height="${724-goatFeet}"/></clipPath><clipPath id="${id}-goat-tail-${i}"><polygon points="${goat.tail}"/></clipPath><clipPath id="${id}-goat-ear-${i}"><polygon points="${goat.ear}"/></clipPath><mask id="${id}-goat-face-${i}" maskUnits="userSpaceOnUse" x="${x}" y="${y}" width="${w}" height="${h}"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="white"/><polygon points="${goat.ear}" fill="black"/></mask><mask id="${id}-goat-body-${i}" maskUnits="userSpaceOnUse" x="${x}" y="${y}" width="${w}" height="${h}"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="white"/><polygon points="${goat.head}" fill="black"/><polygon points="${goat.tail}" fill="black"/></mask>`;
    }).join('');
    const goatArt = (compact || lightweight) ? goats.map((goat,i) => `<g class="banner-galicia-member-goat" style="--graze-duration:${goat.duration};--graze-phase:${goat.phase};--member-goat-joint:${goat.box[0]+goat.box[2]/2}px 724px"><g clip-path="url(#${id}-goat-${i})">${figure}</g></g>`).join('') : goats.map((goat, i) => `<g class="banner-galicia-goat" style="--graze-duration:${goat.duration};--graze-phase:${goat.phase};--goat-joint:${goat.joint};--tail-joint:${goat.tailJoint};--ear-joint:${goat.earJoint};--wind-duration:${goat.wind}" clip-path="url(#${id}-goat-${i})"><g clip-path="url(#${id}-goat-feet-${i})" mask="url(#${id}-goat-body-${i})">${figure}</g><g class="banner-galicia-goat-body"><g clip-path="url(#${id}-goat-upper-${i})" mask="url(#${id}-goat-body-${i})">${figure}</g></g><g class="banner-galicia-goat-tail"><g clip-path="url(#${id}-goat-tail-${i})">${figure}</g></g><g class="banner-galicia-goat-head"><g clip-path="url(#${id}-goat-head-${i})" mask="url(#${id}-goat-face-${i})">${figure}</g><g class="banner-galicia-goat-ear"><g clip-path="url(#${id}-goat-ear-${i})">${figure}</g></g></g></g>`).join('');
    // Feathered source patches keep the painted foliage, with each base pinned
    // to the ground. The sky patches stop above the mountain silhouettes.
    const foliage = [
      {x:105,y:130,rx:230,ry:145,joint:'145px 277px',duration:'4.8s',phase:'-1.1s',tree:true},
      {x:compact ? 1210 : 2060,y:176,rx:144,ry:120,joint:compact ? '1220px 300px' : '2070px 300px',duration:'5.6s',phase:'-3.4s',tree:true},
      ...Array.from({length:compact ? 6 : lightweight ? 2 : 10}, (_,i) => ({x:95+i*226,y:690,rx:170,ry:95,joint:`${95+i*226}px 724px`,duration:`${3.1+(i%4)*.4}s`,phase:`${i*-.47}s`}))
    ];
    const foliageDefs = foliage.map((patch,i) => `<mask id="${id}-foliage-${i}" maskUnits="userSpaceOnUse" x="${patch.x-patch.rx}" y="${patch.y-patch.ry}" width="${patch.rx*2}" height="${patch.ry*2}"><ellipse cx="${patch.x}" cy="${patch.y}" rx="${patch.rx}" ry="${patch.ry}" fill="url(#${id}-foliage-fade)"/></mask>`).join('');
    const foliageArt = (trees) => foliage.map((patch,i) => !!patch.tree === trees ? `<g class="banner-galicia-foliage ${trees ? 'is-tree' : ''}" style="--foliage-joint:${patch.joint};--wind-duration:${patch.duration};--wind-phase:${patch.phase}"><g mask="url(#${id}-foliage-${i})">${background}</g></g>` : '').join('');
    const grass = Array.from({length:compact ? 21 : lightweight ? 10 : 35}, (_, i) => {
      const x = 25 + i * 63, y = 722 - (i % 3) * 5;
      return `<g class="banner-galicia-blade" style="--blade-phase:${i * -.19}s;--blade-joint:${x}px ${y}px"><path d="M${x} ${y} Q${x-14} ${y-41} ${x-5} ${y-75} M${x} ${y} Q${x+15} ${y-37} ${x+36} ${y-52}"/><path class="is-light" d="M${x+5} ${y} Q${x+27} ${y-18} ${x+43} ${y-26}"/></g>`;
    }).join('');
    const cloudXs = compact ? [400,800,1150] : lightweight ? [1160] : [650,1160,1690];
    const cloudDefs = cloudXs.map((x,i) => `<mask id="${id}-cloud-${i}" maskUnits="userSpaceOnUse" x="${x-340}" y="-65" width="680" height="160"><ellipse cx="${x}" cy="12" rx="340" ry="80" fill="url(#${id}-cloud-fade)"/></mask>`).join('');
    const clouds = cloudXs.map((_,i) => `<g class="banner-galicia-clouds" style="--cloud-duration:${23+i*8}s;--cloud-phase:${i*-9}s"><g mask="url(#${id}-cloud-${i})">${background}</g></g>`).join('');
    const birds = Array.from({length:lightweight ? 3 : 5},(_,i) => `<g class="banner-galicia-bird-flight" style="--flight-duration:${17+i*3}s;--flight-phase:${-i*4.3}s;--flight-height:${108+(i%3)*37}px;--bird-scale:${.7+(i%3)*.25}"><g class="banner-galicia-bird" style="--flap-duration:${.72+i*.11}s"><path class="banner-galicia-wing is-left" d="M0 0 Q-13 -16 -29 -11 Q-13 -7 0 3Z"/><path class="banner-galicia-wing is-right" d="M0 0 Q13 -16 29 -11 Q13 -7 0 3Z"/><path d="M-3 0 Q0 -5 4 0 L10 3 L3 4 L0 10Z"/></g></g>`).join('');
    // Only the registered face changes; the soft edge preserves the original
    // head silhouette and the expression follows the same animated head joint.
    const expression = `<g class="banner-galicia-expression" mask="url(#${id}-expression)"><image href="icons/banners/alberto-galicia-expression-v2.webp" width="2172" height="724"/></g>`;
    return `<div class="banner-art banner-alberto-galicia ${extra}" role="img" aria-label="${escape(banner.name || 'Alberto Velasco con sus cabras en Galicia')}"><img class="banner-galicia-fallback" src="icons/banners/${compact ? 'alberto-galicia-member-v1.png' : 'posters/alberto-galicia-v1.webp'}" width="${sceneWidth}" height="724" alt="" decoding="async" aria-hidden="true"><svg class="banner-galicia-scene" viewBox="0 0 ${sceneWidth} 724" preserveAspectRatio="${sceneFit}" aria-hidden="true" focusable="false"><defs><clipPath id="${id}-alberto"><rect width="545" height="724"/></clipPath><clipPath id="${id}-head"><polygon points="${head}"/></clipPath><clipPath id="${id}-torso"><rect y="155" width="545" height="395"/></clipPath><clipPath id="${id}-legs"><rect y="535" width="545" height="189"/></clipPath><mask id="${id}-body" maskUnits="userSpaceOnUse" x="0" y="0" width="545" height="724"><rect width="545" height="724" fill="white"/><polygon points="${head}" fill="black"/></mask><radialGradient id="${id}-cloud-fade"><stop offset="45%" stop-color="white"/><stop offset="100%" stop-color="black"/></radialGradient><radialGradient id="${id}-foliage-fade"><stop offset="50%" stop-color="white"/><stop offset="100%" stop-color="black"/></radialGradient><radialGradient id="${id}-expression-fade"><stop offset="65%" stop-color="white"/><stop offset="100%" stop-color="black"/></radialGradient><mask id="${id}-expression" maskUnits="userSpaceOnUse" x="357" y="62" width="126" height="152"><ellipse cx="420" cy="138" rx="63" ry="76" fill="url(#${id}-expression-fade)"/></mask>${cloudDefs}${foliageDefs}${goatDefs}</defs>${background}${clouds}${foliageArt(true)}${birds}<g class="banner-galicia-alberto" clip-path="url(#${id}-alberto)"><g clip-path="url(#${id}-legs)">${figure}</g><g class="banner-galicia-torso"><g clip-path="url(#${id}-torso)" mask="url(#${id}-body)">${figure}</g></g><g class="banner-galicia-head"><g clip-path="url(#${id}-head)">${figure}${expression}</g></g></g>${goatArt}${foliageArt(false)}<g class="banner-galicia-grass">${grass}</g><g class="banner-galicia-breeze"><path d="M730 473 Q820 441 917 460"/><path d="M1460 269 Q1530 245 1616 256"/></g></svg></div>`;
  }
  function artwork(banner, extra = '') {
    const remote=globalThis.ShopCatalogMedia?.banner(banner,extra,bannerMotionPreference.matches);
    if(remote)return remote;
    if (banner?.art_key === 'jose-enrique-ojos-v1') {
      const base = 'icons/banners/jose-enrique-ojos-v1/';
      const remote = 'https://raulculsan.github.io/The-Big-Boy-Rules/icons/banners/jose-enrique-ojos-v1/jose-enrique-ojos-v2.mp4';
      return `<div class="banner-art banner-fufi-flight banner-jose-eyes ${extra}" style="background-image:url('${base}poster.jpg');background-color:#0b1020" role="img" aria-label="${escape(banner.name || 'José Enrique bajo la lluvia, con los ojos iluminándose')}"><img src="${base}poster.jpg" width="1440" height="480" alt="" decoding="async" aria-hidden="true"><video data-banner-src="${base}jose-enrique-ojos-v2.mp4" data-banner-remote="${remote}" poster="${base}poster.jpg" width="1440" height="480" autoplay muted loop playsinline preload="none" disablepictureinpicture disableremoteplayback tabindex="-1" aria-hidden="true"></video></div>`;
    }
    const duel = {'duelo-mirada-v1':'Jose Enrique y Miguel, cara a cara en el bosque','duelo-golpe-v1':'Jose Enrique y Miguel chocan los puños','duelo-cruce-v1':'Jose Enrique y Miguel caminan hasta cruzar miradas'}[banner?.art_key];
    if (duel) {
      const base = `icons/banners/${banner.art_key}/`, file = `${banner.art_key}.mp4`;
      const remote = `https://raulculsan.github.io/The-Big-Boy-Rules/${base}${file}`;
      return `<div class="banner-art banner-fufi-flight ${extra}" style="background-image:url('${base}poster.jpg');background-color:#1c3320" role="img" aria-label="${escape(banner.name || duel)}"><img src="${base}poster.jpg" width="1440" height="480" alt="" decoding="async" aria-hidden="true"><video data-banner-src="${base}${file}" data-banner-remote="${remote}" poster="${base}poster.jpg" width="1440" height="480" autoplay muted loop playsinline preload="none" disablepictureinpicture disableremoteplayback tabindex="-1" aria-hidden="true"></video></div>`;
    }
    if (banner?.art_key === 'fufi-supervuelo-v1') {
      const base = 'icons/banners/fufi-supervuelo-v1/';
      const remote = 'https://nfvggpgeypkkqceivkaq.supabase.co/storage/v1/object/public/group-media/banners/fufi-supervuelo-v1.mp4';
      return `<div class="banner-art banner-fufi-flight ${extra}" role="img" aria-label="${escape(banner.name || 'Fufi volando entre nubes')}"><img src="${base}poster.jpg" width="1440" height="480" alt="" decoding="async" aria-hidden="true"><video data-banner-src="${base}fufi-supervuelo-v1.mp4" data-banner-remote="${remote}" poster="${base}poster.jpg" width="1440" height="480" autoplay muted loop playsinline preload="none" disablepictureinpicture disableremoteplayback tabindex="-1" aria-hidden="true"></video></div>`;
    }
    // Only known artwork keys become styles; future Krita exports are added here.
    const panorama = {
      'madrid-medianoche-v1': 'icons/banners/madrid-medianoche-v1.jpg',
      'costa-atlantica-v1': 'icons/banners/costa-atlantica-v1.jpg'
    }[banner?.art_key];
    // Native WebKit can defer lazy images inside a dialog even after showModal().
    // The fixed-ratio surface and eager image give every shop tile real geometry;
    // the same local bitmap is also a CSS fallback while the image decodes.
    if (panorama) return `<div class="banner-art banner-panorama ${extra}" style="background-image:url('${panorama}')" role="img" aria-label="${escape(banner.name)}"><img src="${panorama}" width="2172" height="724" alt="" loading="eager" decoding="async"></div>`;
    if (banner?.art_key === 'alberto-galicia-anime-v1') return galiciaArtwork(banner, extra, false, extra.includes('member-banner-art'));
    if (banner?.art_key === 'miguel-basket-bano-v1') {
      const poses = ['00', '00a', '01', '01a', '02', '02a', '03'].map((frame, index) => `<image class="banner-basket-pose banner-basket-pose-${index}" href="icons/banners/miguel-basket-miguel-${frame}-v1.webp" width="2172" height="724"/>`).join('');
      const shots = Array.from({length: 3}, (_, i) => `<g class="banner-basket-shot banner-basket-shot-${i}"><text x="0" y="0" text-anchor="middle" dominant-baseline="central">💩</text></g>`).join('');
      const subject = `<g class="banner-basket-held"><text x="0" y="0" text-anchor="middle" dominant-baseline="central">💩</text></g>${poses}`;
      const wideScene = `<svg class="banner-basket-scene " viewBox="0 0 2172 724" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false"><image href="icons/banners/miguel-basket-bano-bg-v1.webp" width="2172" height="724"/>${subject}${shots}<g class="banner-basket-impact" transform="translate(1780 539)"><ellipse class="banner-basket-ring" rx="60" ry="12"/><path class="banner-basket-splash" d="M-42 -3 Q-67 -66 -78 -37 M-18 -8 Q-29 -86 -42 -67 M12 -8 Q28 -91 39 -63 M38 -3 Q65 -60 78 -39"/><text class="banner-basket-score" x="0" y="-75" text-anchor="middle">+3</text></g></svg>`;
      return `<div class="banner-art banner-miguel-basket ${extra}" role="img" aria-label="${escape(banner.name || 'Miguel encesta emojis en el váter')}"><img class="banner-basket-fallback" src="icons/banners/posters/miguel-basket-v1.webp" width="2172" height="724" alt="" decoding="async" aria-hidden="true">${wideScene}</div>`;
    }
    if (banner?.art_key === 'miguel-moto-anime-v1') {
      // All moving motorcycle parts use the source image's coordinates, so they
      // stay attached to the wheels and hair in every banner size.
      const spokes = Array.from({length: 6}, (_, i) => `<path d="M0 -58 L0 -132" transform="rotate(${i * 60})"/>`).join('');
      const wheels = `<svg class="banner-moto-wheels" viewBox="0 0 1312 1199" fill="none"><g transform="translate(503 929) rotate(8) scale(.47 1)"><g class="banner-moto-wheel-spin"><circle r="145" class="banner-moto-wheel-rim"/><g class="banner-moto-wheel-spokes">${spokes}</g><circle r="156" class="banner-moto-wheel-tread"/></g></g><g transform="translate(962 916) rotate(8) scale(.43 .67)"><g class="banner-moto-wheel-spin is-front"><circle r="145" class="banner-moto-wheel-rim"/><g class="banner-moto-wheel-spokes">${spokes}</g><circle r="156" class="banner-moto-wheel-tread"/></g></g></svg>`;
      return `<div class="banner-art banner-miguel-moto ${extra}" role="img" aria-label="${escape(banner.name || 'Miguel en moto por la ciudad')}"><div class="banner-moto-city banner-moto-far" aria-hidden="true"></div><div class="banner-moto-clouds" aria-hidden="true"><i></i><i></i></div><div class="banner-moto-city banner-moto-mid" aria-hidden="true"></div><div class="banner-moto-city banner-moto-near" aria-hidden="true"></div><div class="banner-moto-city banner-moto-near banner-moto-near-delayed" aria-hidden="true"></div><div class="banner-moto-road" aria-hidden="true">${Array.from({length: 12}, (_, i) => `<i class="banner-moto-lane ${i > 5 ? 'is-right' : ''}" style="--phase:${i % 6}"></i>`).join('')}</div><div class="banner-moto-rider-group" aria-hidden="true"><div class="banner-moto-shadow"></div><div class="banner-moto-rider-plane"><img class="banner-moto-rider" src="icons/banners/miguel-moto-rider-v2.webp" width="1312" height="1199" alt="" decoding="async">${wheels}<img class="banner-moto-hair" src="icons/banners/miguel-moto-rider-v2.webp" width="1312" height="1199" alt="" decoding="async"><svg class="banner-moto-wind" viewBox="0 0 1312 1199" fill="none"><path d="M710 43 Q684 27 669 42 M729 29 Q711 13 693 25 M693 64 Q670 53 658 65"/></svg></div></div><div class="banner-moto-light" aria-hidden="true"></div></div>`;
    }
    return `<div class="banner-art banner-neutral ${extra}" role="img" aria-label="${escape(banner?.name || 'Banner de perfil')}"><span>BB</span></div>`;
  }
  function paintProfile() {
    if (!profileTarget?.node.isConnected) return;
    const {node, userId, own} = profileTarget;
    const banner = own ? (state ? state.banners?.find(item => item.id === state.equipped_banner_id) : profileSnapshot(userId)?.banner) : memberBanners.get(userId);
    const identity = node.querySelector('.club-profile-identity');
    const avatar = identity?.querySelector('.club-profile-avatar');
    let hero = identity?.querySelector('.profile-banner-hero');
    if (banner && identity && avatar) {
      if (!hero) {
        hero = document.createElement('div');
        hero.className = 'profile-banner-hero';
        avatar.before(hero);
        // The showcase cards live right behind the photo and travel with it.
        const arc = avatar.nextElementSibling?.matches?.('.profile-vitrine-arc') ? avatar.nextElementSibling : null;
        hero.append(avatar);
        if (arc) hero.append(arc);
      }
      // Keep the decoded, circular avatar intact while the artwork changes.
      const signature=JSON.stringify([banner.id,banner.art_key,banner.presentation]);
      if (hero.dataset.bannerSignature !== signature || !hero.querySelector('.profile-banner')) {
        hero.querySelector('.profile-banner')?.remove();
        hero.insertAdjacentHTML('afterbegin', artwork(banner, 'profile-banner'));
        hero.dataset.bannerId = String(banner.id);hero.dataset.bannerSignature=signature;
      }
    } else if (hero) {
      const arc = hero.querySelector('.profile-vitrine-arc');
      if (avatar) hero.before(avatar);
      if (avatar && arc) avatar.after(arc);
      hero.remove();
    }
    if (own) {
      const balance = node.querySelector('[data-wallet-balance]');
      if (balance) balance.textContent = walletText();
      node.querySelector('[data-banner-shop]')?.setAttribute('aria-label', `Abrir tienda de banners. ${coins()}`);
      node.querySelector('[data-wallet]')?.setAttribute('aria-label', `Saldo: ${coins()}`);
    }
    registerBannerVideos(node);
  }
  function memberBanner(userId) {
    if (userId && userId === options?.session() && state) {
      return state.banners?.find(item => item.id === state.equipped_banner_id) || null;
    }
    return memberBanners.get(userId) || null;
  }
  function memberPoster(banner, priority = false) {
    const remote=globalThis.ShopCatalogMedia?.banner(banner,'member-banner-art',true,priority);
    if(remote)return remote;
    if (banner?.art_key === 'jose-enrique-ojos-v1') return `<div class="banner-art banner-fufi-flight banner-jose-eyes member-banner-art" style="background-image:url('icons/banners/jose-enrique-ojos-v1/poster.jpg');background-color:#0b1020" role="img" aria-label="${escape(banner.name)}"><img src="icons/banners/jose-enrique-ojos-v1/poster.jpg" width="1440" height="480" alt="" loading="${priority ? 'eager' : 'lazy'}" decoding="async"></div>`;
    if (banner?.art_key === 'fufi-supervuelo-v1') return `<div class="banner-art banner-fufi-flight member-banner-art" role="img" aria-label="${escape(banner.name)}"><img src="icons/banners/fufi-supervuelo-v1/poster.jpg" width="1440" height="480" alt="" loading="${priority ? 'eager' : 'lazy'}" decoding="async"></div>`;
    const image = {'alberto-galicia-anime-v1':'posters/alberto-galicia-v1.webp', 'miguel-basket-bano-v1':'posters/miguel-basket-v1.webp', 'miguel-moto-anime-v1':'posters/miguel-moto-v1.webp', 'madrid-medianoche-v1':'madrid-medianoche-v1.jpg', 'costa-atlantica-v1':'costa-atlantica-v1.jpg'}[banner?.art_key];
    if (image) return `<div class="banner-art member-banner-art" role="img" aria-label="${escape(banner.name)}"><img src="icons/banners/${image}" width="2172" height="724" alt="" loading="${priority ? 'eager' : 'lazy'}" fetchpriority="${priority ? 'high' : 'auto'}" decoding="async" style="width:100%;height:100%;object-fit:contain"></div>`;
    return artwork(null, 'member-banner-art');
  }
  function memberArtwork(userId) {
    return memberPoster(memberBanner(userId));
  }
  function paintMember(node) {
    const banner = memberBanner(node.dataset.memberBannerUser);
    const key = JSON.stringify([banner?.id || '',banner?.art_key,banner?.presentation]);
    const surface = node.querySelector('.club-member-banner');
    if (!surface) return;
    // Every visible carousel tile keeps its live scene. A fixed first-two
    // budget can leave an entering tile on its poster after another tile exits.
    const visible = !memberObserver || visibleMemberTiles.has(node);
    const animate = visible && !document.hidden && !(globalThis.ClubMotion?.media || matchMedia('(prefers-reduced-motion: reduce)')).matches;
    const changed = surface.dataset.bannerId !== key;
    const mode = animate ? 'animated' : 'poster';
    if (changed || !surface.firstElementChild || surface.dataset.bannerMode !== mode) {
      surface.innerHTML = animate ? artwork(banner, 'member-banner-art') : memberPoster(banner, node.dataset.memberPriority === 'true');
      surface.dataset.bannerId = key;
      surface.dataset.bannerMode = mode;
    }
    // Offscreen tiles retain one poster, releasing SVG masks and compositor layers.
    // Visible tiles keep the complete 2172 × 724 composition and original aspect.
    registerBannerVideos(surface);
  }
  globalThis.ClubMotion?.media.addEventListener('change', () => paintMembers());
  function paintMembers() {
    if (!membersTarget?.isConnected) return;
    membersTarget.querySelectorAll('[data-member-banner-user]').forEach(paintMember);
  }
  function loadMemberBanners(userIds, force = false) {
    if (!online()) return Promise.resolve();
    const ids = [...new Set(userIds)].filter(id => id && !memberBannerRequests.has(id) && (force || Date.now() - (memberBannerFetchedAt.get(id) || 0) >= 60000));
    const existing = [...new Set(userIds.map(id => memberBannerRequests.get(id)).filter(Boolean))];
    if (!ids.length) return Promise.all(existing);
    const token = generation, session = options.session();
    const pending = (async () => {
      for (let offset = 0; offset < ids.length; offset += 200) {
        const chunk = ids.slice(offset, offset + 200);
        let records;
        try {
          records = await rpc('get_member_profile_banners', {target_user_ids:chunk});
        } catch (error) {
          if (!['PGRST202','42883'].includes(error?.code)) throw error;
          // Compatibility while the batch migration is being deployed. Bound
          // concurrency instead of starting a connection for every member.
          records = [];
          let cursor = 0;
          await Promise.all(Array.from({length:Math.min(4,chunk.length)}, async () => {
            while (cursor < chunk.length) {
              const userId = chunk[cursor++];
              records.push({user_id:userId, banner:await rpc('get_member_profile_banner', {target_user_id:userId})});
            }
          }));
        }
        if (token !== generation || session !== options.session()) return;
        const banners = new Map((records || []).map(record => [record.user_id,record.banner]));
        chunk.forEach(id => {memberBanners.set(id, banners.get(id) || null); memberBannerFetchedAt.set(id, Date.now());});
      }
      saveMemberBannerPosters();
      paintProfile(); paintMembers();
    })().catch(() => {
      if (token === generation && session === options.session()) ids.forEach(id => memberBannerFetchedAt.set(id, Date.now()));
    }).finally(() => {
      ids.forEach(id => {if (memberBannerRequests.get(id) === pending) memberBannerRequests.delete(id);});
    });
    ids.forEach(id => memberBannerRequests.set(id, pending));
    return Promise.all([...existing,pending]);
  }
  function loadMemberBanner(userId, force = false) {
    return loadMemberBanners([userId], force);
  }
  function mountMembers(node) {
    restoreMemberBannerPosters();
    if (membersTarget !== node) {
      memberObserver?.disconnect(); visibleMemberTiles.clear(); observedMemberTiles.clear(); membersTarget = node;
      memberObserver = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRect.width > 0 && entry.intersectionRect.height > 0) visibleMemberTiles.add(entry.target);
          else visibleMemberTiles.delete(entry.target);
        }
        // Process the complete visibility snapshot before painting. WebKit can
        // report entering cards before exiting cards during a horizontal swipe.
        paintMembers();
      }) : null;
    }
    const tiles = [...node.querySelectorAll('[data-member-banner-user]')];
    // Drop detached cards after a list rerender; observers otherwise retain them.
    for (const tile of observedMemberTiles) if (!node.contains(tile)) {
      memberObserver?.unobserve(tile); observedMemberTiles.delete(tile); visibleMemberTiles.delete(tile);
    }
    // Hydration/presence updates often mount the same list. Keep observation
    // intact so unchanged visible banners do not restart their animation.
    tiles.forEach(tile => {
      if (!observedMemberTiles.has(tile)) { observedMemberTiles.add(tile); memberObserver?.observe(tile); }
    });
    paintMembers();
    void loadMemberBanners(tiles.map(tile => tile.dataset.memberBannerUser).filter(id => id !== options?.session() || !state));
  }
  document.addEventListener('visibilitychange', paintMembers);
  function renderEditor() {
    const settings = el('profileBannerSettings');
    if (!settings || settings.hidden) return;
    const picker = el('profileBannerPicker'), list = el('profileBannerOptions');
    if (state) {
      const owned = (state.banners || []).filter(banner => banner.owned);
      const selected = owned.find(banner => banner.id === state.equipped_banner_id);
      el('profileBannerSelection').textContent = selected?.name || 'Sin banner';
      const signature = JSON.stringify(owned.map(({id, name, art_key,presentation}) => [id, name, art_key,presentation]));
      if (list.dataset.signature !== signature) {
        list.dataset.signature = signature;
        list.innerHTML = `<button type="button" class="profile-banner-option" data-profile-banner="" data-banner-id="" aria-pressed="${!state.equipped_banner_id}"><div class="profile-banner-empty" aria-hidden="true">BB</div><span class="profile-banner-option-name">Sin banner</span></button>` + owned.map(banner => `<button type="button" class="profile-banner-option" data-profile-banner="${escape(banner.id)}" data-banner-id="${escape(banner.id)}" aria-pressed="${banner.id === state.equipped_banner_id}">${artwork(banner)}<span class="profile-banner-option-name">${escape(banner.name)}</span></button>`).join('');
      }
    }
    list.querySelectorAll('button').forEach(button => {
      button.disabled = busy || loading || !state || !online();
      button.setAttribute('aria-pressed', String((button.dataset.profileBanner || null) === (state?.equipped_banner_id || null)));
    });
    picker.setAttribute('aria-busy', String(busy || loading));
    el('profileBannerStatus').textContent = failure || (busy ? 'Aplicando banner…' : loading ? 'Cargando tus banners…' : !online() ? 'Conéctate para elegir tu banner.' : notice || (state && !(state.banners || []).some(banner => banner.owned) ? 'Todavía no tienes banners comprados.' : ''));
    el('profileBannerRetry').hidden = !failure && (loading || !!state);
    el('profileBannerRetry').disabled = busy || loading || !online();
    registerBannerVideos(list);
  }
  function openEditor(own) {
    el('profileBannerSettings').hidden = !own;
    el('profileBannerPicker').hidden = true;
    el('profileBannerToggle').setAttribute('aria-expanded', 'false');
    failure = ''; notice = '';
    if (own) {renderEditor(); void refresh();}
  }
  function closeEditor() {
    el('profileBannerSettings').hidden = true;
    el('profileBannerPicker').hidden = true;
    el('profileBannerToggle').setAttribute('aria-expanded', 'false');
  }
  function render() {
    if (state && options?.session()) {
      const userId = options.session();
      memberBanners.set(userId, state.banners?.find(item => item.id === state.equipped_banner_id) || null);
      memberBannerFetchedAt.set(userId, Date.now());
      saveMemberBannerPosters();
    }
    paintProfile();
    paintMembers();
    renderReveal();
    renderEditor();
    document.querySelectorAll('[data-duplicates-count]').forEach(node => {node.textContent = state ? groupDigits(extraCopies()) : '—'; node.closest('button')?.setAttribute('aria-label', `Gestionar ${state ? extraCopies() : ''} cartas repetidas`);});
    if (el('duplicatesStatus')) el('duplicatesStatus').textContent = failure || notice || (loading ? 'Actualizando repetidas…' : state ? `${extraCopies()} copias repetidas. Conservas una de cada carta.` : 'Actualiza la colección para consultar las repetidas.');
    if (state?.cards) lastInventory = state.cards;
    globalThis.CardAlbum?.update({cards:lastInventory, catalog:state?.card_catalog, loading:loading || busy, failure, savedAt:inventorySavedAt});
    globalThis.CollectionSocial?.update(lastInventory);
    globalThis.CardEconomy?.update(lastInventory, state?.discard_rewards);
    const status = el('bannerShopStatus');
    if (status) { status.textContent = failure || (loading ? 'Actualizando colección…' : notice); status.classList.toggle('is-error', !!failure); status.classList.toggle('is-passive', !failure && !!state); }
    if (el('bannerShopBalance')) el('bannerShopBalance').textContent = coins();
    document.querySelectorAll('[data-wallet-balance]').forEach(node => {node.textContent = walletText();});
    document.querySelectorAll('[data-wallet]').forEach(node => node.setAttribute('aria-label', `Saldo: ${coins()}`));
    // A background refresh keeps the known packs usable; only a first load with
    // no snapshot, an action in flight or an empty wallet disables the button.
    const standardPacks = packLuck?.waiting ? Number(packLuck.waiting.standard?.count) || 0 : state?.available_packs?.length || 0; if (el('ownedPackOpen')) el('ownedPackOpen').disabled = busy || !standardPacks || !online(); el('ownedPackOpen')?.toggleAttribute('data-empty', !busy && !loading && !!state && !standardPacks);
    if (el('packsStatusTitle')) el('packsStatusTitle').textContent = failure ? 'No se pudo actualizar' : busy || (loading && !state) ? 'Sincronizando sobres' : !online() ? 'Sin conexión' : !state ? 'Consulta tus sobres' : state.available_packs?.length ? 'Sobres disponibles' : 'Sin sobres disponibles';
    if (el('packsStatusMessage')) el('packsStatusMessage').textContent = failure || (busy || (loading && !state) ? 'Consultando tu colección y tu saldo…' : !online() ? 'Conéctate a internet para abrir sobres.' : state?.available_packs?.length ? 'Pulsa un sobre para abrirlo.' : state ? 'Vuelve mañana para recibir tu sobre diario.' : 'Pulsa Actualizar saldo para consultar tu cuenta.');
    if (el('packsSyncButton')) {el('packsSyncButton').disabled = busy || loading || !online(); el('packsSyncButton').textContent = loading || busy ? 'Actualizando…' : failure ? 'Reintentar' : 'Actualizar saldo';}
    el('ownedPackOpen')?.setAttribute('aria-busy',String(busy));
    if (!globalThis.PackExtras?.syncAction?.()) document.querySelectorAll('[data-pack-open]').forEach(button => {button.disabled = !!el('ownedPackOpen')?.disabled; if (button.textContent !== 'Abrir sobre') button.textContent = 'Abrir sobre';});
    if (el('packsInfoBalance')) el('packsInfoBalance').textContent = state ? String(state.available_packs?.length ?? 0) : '—';
    renderPackLuck();
    if (el('packsInfoCoins')) el('packsInfoCoins').textContent = state ? `${groupDigits(state.balance)} monedas` : '—';
    if (el('packRarityOdds')) el('packRarityOdds').textContent = state?.rarity_probabilities ? Object.keys(rarityNames).filter(rarity => state.rarity_probabilities[rarity] != null).map(rarity => `${rarityNames[rarity]} ${state.rarity_probabilities[rarity]}%`).join(' · ') : 'Probabilidades disponibles al sincronizar.';
    const shopHeading = el('shopBannersPanel')?.querySelector('.shop-section-heading');
    if (shopHeading) {
      const title = shopHeading.querySelector('h3'), subtitle = shopHeading.querySelector('p');
      if (title) title.textContent = 'Selección de hoy';
      if (subtitle) updateShopCountdown();
    }
    const shopVisible = Boolean(el('bannerShopDialog')?.open);
    const container = el('bannerShopItems');
    if (container && shopVisible) {
      // Selection, ownership and wallet changes update controls in place so
      // decoded images and animated scenes retain their playback position.
      const signature = JSON.stringify(state ? dailyBanners().map(({id,name,description,art_key,presentation}) => [id,name,description,art_key,presentation]) : null);
      if (container.dataset.signature !== signature) {
        container.dataset.signature = signature;
        container.innerHTML = state ? (dailyBanners().map((banner, index) => `<article class="banner-shop-item shop-banner-card ${index === 0 ? 'is-featured' : ''} ${banner.equipped ? 'is-equipped' : ''}"><div class="shop-artwork">${artwork(banner)}</div><div class="shop-card-content"><div class="shop-card-labels"><span class="shop-item-kind">${['alberto-galicia-anime-v1', 'miguel-basket-bano-v1', 'miguel-moto-anime-v1', 'fufi-supervuelo-v1', 'jose-enrique-ojos-v1'].includes(banner.art_key) || ['video'].includes(globalThis.ShopCatalogMedia?.presentation(banner)?.type) || globalThis.ShopCatalogMedia?.presentation(banner)?.animated ? 'Animado' : 'Perfil'}</span>${banner.owned ? `<span class="shop-ownership ${banner.equipped ? 'is-active' : ''}">${banner.equipped ? 'Equipado' : 'En tu colección'}</span>` : ''}</div><h3>${escape(banner.name)}</h3><p>${escape(banner.description || 'Diseño para la cabecera de tu perfil.')}</p><div class="shop-card-purchase"><span class="shop-price">${banner.owned ? '<small>Ya es tuyo</small>' : `<strong>${escape(banner.price)}</strong><small>${Number(banner.price) === 1 ? 'moneda' : 'monedas'}</small>`}</span><button class="packs-sync shop-purchase-button" type="button" data-banner-action="${banner.owned ? 'equip' : 'buy'}" data-banner-id="${escape(banner.id)}" ${busy || loading || banner.equipped || (!banner.owned && Number(state.balance) < Number(banner.price)) || !online() ? 'disabled' : ''}>${banner.equipped ? 'Equipado' : banner.owned ? 'Equipar' : 'Comprar'}</button></div></div></article>`).join('') || '<div class="shop-empty"><strong>Próximamente, nuevos diseños</strong><p>Los banners disponibles aparecerán aquí.</p></div>') : '<div class="shop-empty"><span class="shop-loading-art" aria-hidden="true"></span><strong>Cargando la tienda</strong><p>Los diseños del club aparecerán aquí.</p></div>';
      }
      container.querySelectorAll('[data-banner-action]').forEach(button => {
        const banner = state?.banners?.find(item => item.id === button.dataset.bannerId);
        if (banner) {
          const article = button.closest('.shop-banner-card');
          article.classList.toggle('is-equipped', !!banner.equipped);
          const labels = article.querySelector('.shop-card-labels');
          let ownership = labels.querySelector('.shop-ownership');
          if (banner.owned && !ownership) { ownership = document.createElement('span'); ownership.className = 'shop-ownership'; labels.append(ownership); }
          if (ownership) {
            ownership.hidden = !banner.owned;
            ownership.classList.toggle('is-active', !!banner.equipped);
            ownership.textContent = banner.equipped ? 'Equipado' : 'En tu colección';
          }
          const price = article.querySelector('.shop-price');
          const markup = banner.owned ? '<small>Ya es tuyo</small>' : `<strong>${escape(banner.price)}</strong><small>${Number(banner.price) === 1 ? 'moneda' : 'monedas'}</small>`;
          if (price.dataset.markup !== markup) { price.innerHTML = markup; price.dataset.markup = markup; }
          button.dataset.bannerAction = banner.owned ? 'equip' : 'buy';
          const label = banner.equipped ? 'Equipado' : banner.owned ? 'Equipar' : 'Comprar';
          if (button.textContent !== label) button.textContent = label;
        }
        button.disabled = busy || loading || !banner || banner.equipped || (!banner.owned && Number(state.balance) < Number(banner.price)) || !online();
      });
    }
    const vouchers = el('rewardVoucherItems');
    if (vouchers && shopVisible) {
      const signature = JSON.stringify(state?.vouchers || null);
      if (vouchers.dataset.signature !== signature) {
        vouchers.dataset.signature = signature;
        vouchers.innerHTML = state ? ((state.vouchers || []).map(voucher => `<article class="banner-shop-item reward-voucher-item"><div class="shop-voucher-art" aria-hidden="true"><span class="reward-voucher-mark">BB</span><span>VALE DEL CLUB</span></div><div class="shop-card-content"><div class="shop-card-labels"><span class="shop-item-kind">Canje por premio</span>${voucher.owned_quantity ? `<span class="shop-ownership">${escape(voucher.owned_quantity)} disponibles</span>` : ''}</div><h3>${escape(voucher.name)}</h3><p>${escape(voucher.description || '')}</p><div class="shop-card-purchase"><span class="shop-price">${voucher.owned_quantity ? '<small>Listo para canjear</small>' : `<strong>${escape(voucher.price)}</strong><small>monedas</small>`}</span><button class="packs-sync shop-purchase-button" type="button" data-voucher-action="${voucher.owned_quantity ? 'redeem' : 'unlock'}" data-voucher-id="${escape(voucher.id)}">${voucher.owned_quantity ? 'Canjear' : 'Desbloquear'}</button></div></div></article>`).join('') || '<div class="shop-empty"><strong>Aún no hay vales</strong><p>Los próximos premios aparecerán aquí.</p></div>') : '<div class="shop-empty"><strong>Premios del club</strong><p>Conéctate para consultar los vales.</p></div>';
      }
      vouchers.querySelectorAll('[data-voucher-action]').forEach(button => {
        const voucher = state?.vouchers?.find(item => item.id === button.dataset.voucherId);
        button.disabled = busy || loading || !voucher || !online() || (!voucher.owned_quantity && Number(state.balance) < Number(voucher.price));
      });
    }
    el('bannerShopItems')?.setAttribute('aria-busy', String(busy || loading));
    document.querySelectorAll('[data-shop-banner-count]').forEach(node => {node.textContent = state ? dailyBanners().length : '—';});
    document.querySelectorAll('[data-shop-voucher-count]').forEach(node => {node.textContent = state ? state.vouchers?.length || 0 : '—';});
    if (el('bannerUnequip')) el('bannerUnequip').disabled = busy || loading || !state?.equipped_banner_id || !online();
    renderInventory();
    registerBannerVideos();
  }
  function renderInventory() {
    const inventory = el('ownedCardInventory');
    if (!inventory) return;
    const rows = duplicateRows();
    for (const [id, copies] of discardPicks) {
      const row = rows.find(item => item.id === id);
      if (!row) discardPicks.delete(id); else if (copies > row.extra) discardPicks.set(id, row.extra);
    }
    const markup = state ? (rows.length ? rows.map(item => {
      const design = card(item.id);
      return `<article class="dup-card" data-owned-card="${escape(item.id)}" data-rarity="${escape(item.edition)}"><button type="button" class="dup-pick" data-dup-toggle="${escape(item.id)}">${design ? `<img data-card-original="${escape(design.front)}" src="${escape(globalThis.CardCollection.thumbnail(design))}" alt="" loading="lazy" decoding="async">` : ''}<span class="dup-count">×${item.extra}</span><span class="dup-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg></span></button><h4>${escape(design?.name || item.id)}</h4><p>${item.reward} ${item.reward === 1 ? 'moneda' : 'monedas'}</p>${item.extra > 1 ? `<div class="dup-stepper" hidden><button type="button" data-dup-step="-1" data-dup-card="${escape(item.id)}" aria-label="Una copia menos">−</button><output></output><button type="button" data-dup-step="1" data-dup-card="${escape(item.id)}" aria-label="Una copia más">+</button></div>` : ''}</article>`;
    }).join('') : '<p>No tienes cartas repetidas.</p>') : '<p>Tu inventario se mostrará al sincronizar la colección.</p>';
    // Loading and busy state only change controls, keeping decoded card images
    // and focus intact while an unchanged inventory is refreshed.
    if (inventory.dataset.signature !== markup) {
      inventory.innerHTML = markup;
      inventory.dataset.signature = markup;
    }
    paintDiscardPicks();
    // El Chota prices the pile before anything is chosen.
    const chota = el('duplicatesChota');
    if (chota) {
      const copies = rows.reduce((sum, item) => sum + item.extra, 0), coins = rows.reduce((sum, item) => sum + item.extra * item.reward, 0);
      chota.hidden = !state;
      chota.dataset.mood = copies ? 'wave' : 'calm';
      chota.querySelector('p').textContent = copies ? `Tienes ${copies} ${copies === 1 ? 'repetida' : 'repetidas'}. Si me ${copies === 1 ? 'la das' : 'las das'}, te saco ${coins} ${coins === 1 ? 'moneda' : 'monedas'}.` : 'Ni una repetida. Así me gusta.';
    }
  }
  // Selection repaints in place, so decoded card images are never rebuilt.
  function paintDiscardPicks() {
    const rows = duplicateRows(), blocked = busy || loading || !state || !online();
    el('ownedCardInventory')?.querySelectorAll('.dup-card').forEach(node => {
      const picked = discardPicks.get(node.dataset.ownedCard) || 0, stepper = node.querySelector('.dup-stepper');
      node.classList.toggle('is-picked', picked > 0);
      node.querySelector('.dup-pick').setAttribute('aria-pressed', String(picked > 0));
      node.querySelector('.dup-pick').disabled = blocked;
      if (stepper) {
        stepper.hidden = !picked; stepper.querySelector('output').textContent = picked;
        const extra = rows.find(item => item.id === node.dataset.ownedCard)?.extra || 0;
        stepper.querySelector('[data-dup-step="-1"]').disabled = blocked || picked < 1;
        stepper.querySelector('[data-dup-step="1"]').disabled = blocked || picked >= extra;
      }
    });
    const editions = new Map();
    rows.forEach(item => editions.set(item.edition, [...(editions.get(item.edition) || []), item]));
    const chips = el('duplicatesEditions');
    if (chips) {
      const markup = editions.size > 1 ? [...editions].map(([edition, items]) => `<button type="button" data-dup-edition="${escape(edition)}" data-rarity="${escape(edition)}"><i aria-hidden="true"></i>${escape(card(items[0].id)?.edition || edition)}</button>`).join('') : '';
      if (chips.dataset.signature !== markup) { chips.innerHTML = markup; chips.dataset.signature = markup; }
      chips.querySelectorAll('[data-dup-edition]').forEach(button => {
        button.disabled = blocked;
        button.setAttribute('aria-pressed', String(editions.get(button.dataset.dupEdition).every(item => discardPicks.get(item.id) === item.extra)));
      });
    }
    const copies = [...discardPicks.values()].reduce((sum, value) => sum + value, 0);
    const coins = rows.reduce((sum, item) => sum + (discardPicks.get(item.id) || 0) * item.reward, 0);
    const all = rows.length > 0 && rows.every(item => discardPicks.get(item.id) === item.extra);
    if (el('discardAllDuplicates')) { el('discardAllDuplicates').disabled = blocked || !rows.length; el('discardAllDuplicates').textContent = all ? 'Quitar selección' : 'Elegir todas'; }
    if (el('duplicatesBar')) el('duplicatesBar').hidden = !copies;
    if (el('duplicatesBarText')) el('duplicatesBarText').textContent = `${copies} ${copies === 1 ? 'carta' : 'cartas'} · +${coins} ${coins === 1 ? 'moneda' : 'monedas'}`;
    if (el('discardSelected')) el('discardSelected').disabled = blocked || !copies;
  }
  function refresh(forceDaily = false) {
    if (request) return request;
    const token = generation, user = options?.session();
    restoreInventory(user);
    if (!user) state = null;
    if (!online()) { loading = false; failure = ''; render(); return Promise.resolve(); }
    loading = true; failure = ''; render();
    request = (async () => {
      try {
        // The daily claim must finish before reading available packs. This also
        // covers profile mounting and reconnect, not just packs navigation.
        await options?.synchronizePacks?.(forceDaily);
        if (token !== generation || user !== options.session()) return;
        const catalogRefresh = globalThis.CardCatalogSync?.refresh();
        void loadPackLuck(token, user); const data = await rpc('get_banner_shop_state'); if ((data.cards || []).some(item => !card(item.card_id))) await catalogRefresh; if (token === generation && user === options.session()) {state = {...data, banners:(data.banners || []).filter(banner => banner.id !== 'banner-de-prueba'), daily_banner_ids:Array.isArray(data.daily_banner_ids) ? data.daily_banner_ids.filter(id => id !== 'banner-de-prueba') : undefined, equipped_banner_id:data.equipped_banner_id === 'banner-de-prueba' ? null : data.equipped_banner_id}; scheduleShopReset(); saveInventory(user, data.cards); saveProfileSnapshot(user); globalThis.DailyPacks?.updateBalance(state.available_packs.length); failure = ''; render();} }
      catch (error) { if (token === generation) {failure = errorMessage(error); render();} }
      finally {if (token === generation) {loading = false; request = null; render();}}
    })();
    return request;
  }
  async function animateDiscard(name, cardId, earned, copies, inReveal) {
    const host = inReveal ? revealDialog : el('duplicatesDialog');
    if (!host?.open || !copies) return;
    // Inside a pack the card already turns to dust; only the coins fly.
    const sourceImages = inReveal
      ? []
      : [...host.querySelectorAll('[data-owned-card]')].filter(node => name === 'discard_selected_duplicates' ? cardId.includes(node.dataset.ownedCard) : node.dataset.ownedCard === cardId).map(node => node.querySelector('img')).filter(Boolean);
    const layer = document.createElement('div'); layer.className = 'card-discard-effect';
    const hostRect = host.getBoundingClientRect();
    const rewardX = Math.max(65,Math.min(innerWidth-65,hostRect.left+hostRect.width/2));
    const rewardY = Math.max(60,Math.min(innerHeight-80,hostRect.top+95));
    const reward = document.createElement('div'); reward.className = 'card-discard-reward';
    reward.setAttribute('role','status'); reward.setAttribute('aria-live','polite');
    reward.style.left = `${rewardX}px`; reward.style.top = `${rewardY}px`;
    reward.innerHTML = `<span class="card-discard-coin" aria-hidden="true">B</span><strong>+${escape(earned)} ${earned === 1 ? 'moneda' : 'monedas'}</strong>${inReveal ? '' : `<small>${escape(copies)} ${copies === 1 ? 'repetida descartada' : 'repetidas descartadas'}</small>`}`;
    layer.append(reward); host.append(layer);
    const animations = [], originals = [];
    const preference = (globalThis.ClubMotion?.media || matchMedia('(prefers-reduced-motion: reduce)'));
    const cancelMotion = () => {if (preference.matches || document.hidden) animations.forEach(animation => animation.cancel());};
    preference.addEventListener('change', cancelMotion);
    document.addEventListener('visibilitychange', cancelMotion);
    const cleanup = (keepCopiesDimmed = false) => {preference.removeEventListener('change', cancelMotion); document.removeEventListener('visibilitychange', cancelMotion); animations.forEach(animation => animation.cancel()); if (!keepCopiesDimmed) originals.forEach(node => node.classList.remove('is-discard-source')); layer.remove(); discardEffects.delete(cleanup);};
    discardEffects.add(cleanup);
    try {
      // The permanent status already confirms the award. Reduced motion
      // must not hold the wallet UI behind an invisible animation delay.
      if (preference.matches || document.hidden) return;
      const visible = sourceImages.filter(img => {const r = img.getBoundingClientRect(); return r.bottom>hostRect.top && r.top<hostRect.bottom && r.width>0;});
      const candidates = (visible.length ? visible : sourceImages).slice(0,6);
      candidates.forEach((img,index) => {
        const rect = img.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const ghost = document.createElement('img'); ghost.className = 'card-discard-flying';
        ghost.src = img.currentSrc || img.src; ghost.alt=''; ghost.setAttribute('aria-hidden','true');
        Object.assign(ghost.style,{left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`});
        layer.append(ghost); img.classList.add('is-discard-source'); originals.push(img);
        const dx=rewardX-(rect.left+rect.width/2),dy=rewardY-(rect.top+rect.height/2);
        animations.push(ghost.animate([
          {transform:'translate(0,0) rotate(0deg) scale(1)',opacity:1,offset:0},
          {transform:`translate(${dx*.15}px,${dy*.15-18}px) rotate(${-5+index*2}deg) scale(.86)`,opacity:1,offset:.28},
          {transform:`translate(${dx*.7}px,${dy*.7}px) rotate(${16+index*3}deg) scale(.32)`,opacity:.85,offset:.7},
          {transform:`translate(${dx}px,${dy}px) rotate(26deg) scale(.04)`,opacity:0,offset:1}
        ],{duration:motionTimings.discard,delay:index*24,easing:'cubic-bezier(.4,0,.2,1)',fill:'both'}));
      });
      for (let index=0;index<9;index++) {
        const spark=document.createElement('i'); spark.className='card-discard-spark'; spark.setAttribute('aria-hidden','true');
        Object.assign(spark.style,{left:`${rewardX}px`,top:`${rewardY}px`}); layer.append(spark);
        const angle=index*Math.PI*2/9,dx=Math.cos(angle)*55,dy=Math.sin(angle)*40;
        animations.push(spark.animate([{transform:'translate(0,0) scale(.4)',opacity:0},{opacity:1,offset:.2},{transform:`translate(${dx}px,${dy}px) scale(.2)`,opacity:0}],{duration:220,delay:motionTimings.discard-180,easing:'ease-out',fill:'both'}));
      }
      animations.push(reward.animate([{transform:'translate(-50%,-50%) scale(.7)',opacity:0},{transform:'translate(-50%,-50%) scale(1.08)',opacity:1,offset:.45},{transform:'translate(-50%,-50%) scale(1)',opacity:1}],{duration:motionTimings.reward,easing:'cubic-bezier(.4,0,.2,1)',fill:'both'}));
      await Promise.all(animations.map(animation => animation.finished.catch(() => {})));
    } catch { /* A visual effect cannot turn a confirmed exchange into a failed transaction. */ }
    finally {cleanup(!inReveal);}
  }
  async function mutate(name, args, message, discardedIndex = null) {
    if (busy || loading || !online()) return;
    const token = generation, user = options.session();
    const equippingBanner = name === 'equip_profile_banner';
    const focus = document.activeElement;
    const revealAtStart = reveal;
    let finishReward;
    const focusCard = focus?.dataset?.discardCard;
    const focusBanner = focus?.dataset?.bannerId;
    const focusProfileBanner = focus?.dataset?.profileBanner;
    if (discardedIndex != null && revealAtStart) revealAtStart.discarding = true;
    busy = true; failure = ''; notice = ''; render();
    try {
      const data = await rpc(name, args);
      if (token !== generation || user !== options.session()) return;
      if (discardedIndex != null && reveal === revealAtStart) reveal.discarded.add(discardedIndex);
      // Equipping never spends coins. Apply its confirmed result to the current
      // snapshot while revalidating instead of flashing an empty shop/profile.
      if (equippingBanner && state) {
        const equipped = data.equipped_banner_id || null;
        state = {...state, equipped_banner_id:equipped, banners:state.banners.map(banner => ({...banner,equipped:banner.id === equipped}))};
        saveProfileSnapshot(user);
        render();
      } else state = null;
      if (name === 'open_owned_card_pack') {
        let draws = data.cards || (data.card ? [data.card] : []);
        if ([...draws, ...(data.choice?.options || []), ...(data.target_completed ? [data.target_completed] : [])].some(item => !card(item.card_id))) await globalThis.CardCatalogSync?.refresh(true);
        if (token !== generation || user !== options.session()) return;
        // A choice pack asks for the sixth card before the reveal; later is fine too.
        if (data.choice && globalThis.PackExtras) {
          const chosen = await globalThis.PackExtras.choose(data.choice);
          if (token !== generation || user !== options.session()) return;
          if (chosen) draws = [...draws, chosen].sort((a, b) => (a.draw_index || 0) - (b.draw_index || 0));
          else notice = 'Tu elección queda pendiente: elígela desde la pantalla de sobres.';
        }
        draws.forEach(item => globalThis.PackExtras?.noteFinish(item.card_id, item.finish));
        if (data.target_completed) notice = `Has conseguido «${card(data.target_completed.card_id)?.name || data.target_completed.card_id}» con tus fragmentos.`;
        lastOpenedPack = data.pack_id;
        if (data.luck) { packLuck = {...(packLuck || {}), ...data.luck, guaranteed_next: data.luck.pity_in <= 0, next_boosted: false}; void loadPackLuck(token, user); }
        if (data.badge?.effect === 'sleep' && data.luck?.sleep_until === undefined) packLuck = {...(packLuck || {}), sleep_until:data.badge.sleep_until, sleep_theme:data.badge.sleep_theme ?? null};
        if (data.luck || data.badge?.effect === 'sleep') renderPackLuck();
        el('ownedPackResult').textContent = `${draws.length} cartas guardadas en tu colección.${data.luck?.guaranteed ? ' Este sobre traía una legendaria o mejor garantizada.' : ''}${data.luck?.granted_boosted ? ' Has ganado un sobre mejorado.' : ''}${data.badge ? ` ¡Te ha salido la ${data.badge.name}: ${badgePrize(data.badge)}!` : ''}`;
        startReveal(draws, data.pack_id, data.theme || null, data.badge || null);
        if (reveal) reveal.rewardReady = new Promise(resolve => {finishReward = resolve;});
        await options.synchronizePacks?.(true);
        void globalThis.ChotaLevel?.refresh();
        if (token !== generation || user !== options.session()) return;
      }
      if (name === 'discard_duplicate_card' || name === 'discard_selected_duplicates') {
        const earned = Number(data.coins_earned) || 0;
        const copies = name === 'discard_selected_duplicates' ? Number(data.copies_discarded) || 0 : 1;
        if (name === 'discard_selected_duplicates') discardPicks.clear();
        // Inside a pack the floating reward is the confirmation; no line follows to the next card.
        message = discardedIndex != null ? '' : `${copies} ${copies === 1 ? 'carta repetida descartada' : 'cartas repetidas descartadas'} · +${earned} ${earned === 1 ? 'moneda' : 'monedas'}.`;
        await animateDiscard(name,args.target_card_id || args.p_items.map(item => item.card_id),earned,copies,discardedIndex != null && reveal === revealAtStart);
        if (token !== generation || user !== options.session()) return;
      }
      notice = message;
      await refresh();
    } catch (error) { if (token === generation) {if (!equippingBanner) state = null; const message = errorMessage(error); await refresh(); if (token === generation) failure = equippingBanner ? message : `${message} Comprueba el saldo actualizado antes de repetir la acción.`;} }
    finally {finishReward?.(); if (token === generation) {
      if (reveal === revealAtStart && reveal) reveal.discarding = false;
      busy = false; render();
      const destination = [...document.querySelectorAll('[data-banner-id]')].find(button => !button.disabled && ( (focusBanner && button.dataset.bannerId === focusBanner)));
      if (focusProfileBanner !== undefined) {
        if (!el('profileBannerSettings').hidden && !el('profileBannerPicker').hidden) {
          const option = [...el('profileBannerOptions').querySelectorAll('[data-profile-banner]')].find(button => button.dataset.profileBanner === focusProfileBanner);
          (option && !option.disabled ? option : el('profileBannerToggle')).focus({preventScroll:true});
        }
      } else if (revealDialog.open) revealDialog.querySelector('[data-reveal-flip]')?.focus({preventScroll:true});
      else if (el('duplicatesDialog').open && focusCard) (destination || el('discardAllDuplicates')).focus({preventScroll:true});
      else if (destination) destination.focus({preventScroll:true});
      else if (focusCard) el('duplicatesDialog')?.querySelector('[data-duplicates-close]')?.focus({preventScroll:true});
    }}
  }
  function mountProfile(node, userId, own) {
    profileTarget = {node, userId, own};
    if (own) {
      const topline = node.querySelector('.club-profile-topline');
      if (topline && !topline.querySelector('[data-banner-shop]')) topline.insertAdjacentHTML('beforeend', '<span class="profile-coin-balance" data-wallet aria-label="Saldo pendiente de sincronización"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M15 8.5c-.7-.7-1.7-1-3-1-1.6 0-2.7.8-2.7 2s1.1 1.7 2.8 2c1.8.3 2.8.8 2.8 2.1 0 1.2-1.2 2.1-3 2.1-1.4 0-2.6-.5-3.4-1.3M12 5.5v13"/></svg><span data-wallet-balance>—</span></span><button type="button" class="banner-shop-trigger" data-banner-shop aria-label="Abrir tienda de banners" aria-haspopup="dialog" title="Tienda"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h18l-2-6H5L3 9Zm1 0v12h16V9M9 21v-7h6v7M3 9c0 3 4 3 4 0 0 3 5 3 5 0 0 3 5 3 5 0 0 3 4 3 4 0"/></svg></button>');
      if (topline && !topline.querySelector('[data-card-album]')) topline.insertAdjacentHTML('beforeend', `<button type="button" class="card-album-trigger" data-card-album aria-label="Abrir mi álbum de cartas">${globalThis.CardAlbum?.icon || ''}</button>`);
      paintProfile();
      if (!state && !request) void refresh();
    } else if (userId) {
      paintProfile();
      void loadMemberBanner(userId, true);
    }
  }
  let duplicatesOpener = null;
  function openDuplicates(trigger) {
    const dialog = el('duplicatesDialog');
    if (!dialog) return;
    // Cached HTML can still have this modal inside the inactive packs route.
    // Native top-layer promotion does not make an inert ancestor interactive.
    if (dialog.parentElement !== document.body) document.body.append(dialog);
    dialog.inert = false; dialog.hidden = false; dialog.removeAttribute('aria-hidden');
    if (dialog.open) {globalThis.ClubMotion?.openDialog?.(dialog);el('duplicatesDialog')?.querySelector('[data-duplicates-close]')?.focus({preventScroll:true}); return;}
    duplicatesOpener = trigger || document.activeElement;
    try {
      render();if(globalThis.ClubMotion?.openDialog)globalThis.ClubMotion.openDialog(dialog);else dialog.showModal(); el('duplicatesDialog')?.querySelector('[data-duplicates-close]')?.focus({preventScroll:true});
    } catch {
      // Never leave an unresponsive top-layer backdrop after a failed mount.
      if (dialog.open) dialog.close(); duplicatesOpener = null; return;
    }
    // A network failure updates the modal status; closing remains available.
    void Promise.resolve().then(() => refresh()).catch(error => {
      if (!dialog.open) return;
      el('duplicatesStatus').textContent = errorMessage(error);
    });
  }
  function initialize(config) {
    options = config;globalThis.ShopCatalogMedia?.configure(config.cacheNamespace);
    globalThis.CollectionSocial?.initialize({session:options.session,rpc:options.rpc,refreshInventory:() => refresh(true)});
    globalThis.CardEconomy?.initialize({session:options.session,rpc:options.rpc,refreshInventory:() => refresh(true)});
    globalThis.PackExtras?.initialize({session:options.session,rpc:options.rpc,state:() => state && packLuck ? {...packLuck,balance:state.balance} : null,changed:() => renderPackLuck(),refresh:() => refresh(true),slideChanged:() => {renderPackLuck(); render();},open:async packId => {if (busy || !online()) return; if (loading && request) await request.catch(() => {}); void mutate('open_owned_card_pack', {target_pack_id: packId}, '');}});
    const duplicatesDialog = el('duplicatesDialog');
    if (duplicatesDialog?.parentElement !== document.body && duplicatesDialog) document.body.append(duplicatesDialog);
    duplicatesDialog?.addEventListener('close',() => {
      discardEffects.forEach(cleanup => cleanup());
      discardPicks.clear();
      const trigger = duplicatesOpener; duplicatesOpener = null;
      if (trigger?.isConnected && !trigger.closest('[inert], [hidden]')) trigger.focus({preventScroll:true});
    });
    globalThis.CardAlbum?.configure({refresh:() => refresh(), navigate:options.navigate});
    document.addEventListener('click', event => {
      if (event.target.closest('[data-banner-shop]')) {
        const shop = el('bannerShopDialog');
        if(globalThis.ClubMotion?.openDialog)globalThis.ClubMotion.openDialog(shop);else if(!shop.open)shop.showModal();
        render();
        updateShopCountdown();
        const artwork = shop.querySelector('.is-featured .shop-artwork');
        if (artwork && !revealReduced()) artwork.animate([
          {opacity:.6, transform:'scale(.985)'},
          {opacity:1, transform:'scale(1)'}
        ], {duration:300, easing:'cubic-bezier(.22,1,.36,1)'});
        void refresh();
      }
      const ownedOption = event.target.closest('[data-profile-banner]');
      if (ownedOption && !el('profileBannerSettings').hidden && !ownedOption.disabled) {
        const id = ownedOption.dataset.profileBanner || null;
        if (state && id !== (state.equipped_banner_id || null) && (id === null || state?.banners?.some(banner => banner.id === id && banner.owned))) void mutate('equip_profile_banner', {target_banner_id:id}, id ? 'Banner aplicado a tu perfil.' : 'Banner retirado de tu perfil.');
      }
      const banner = event.target.closest('[data-banner-action]');
      if (banner) void mutate(banner.dataset.bannerAction === 'buy' ? 'buy_profile_banner' : 'equip_profile_banner', {target_banner_id:banner.dataset.bannerId}, banner.dataset.bannerAction === 'buy' ? 'Banner comprado. Ya puedes equiparlo.' : 'Banner equipado en la cabecera de tu perfil.');
      const voucher = event.target.closest('[data-voucher-action]');
      if (voucher) void mutate(voucher.dataset.voucherAction === 'unlock' ? 'unlock_reward_voucher' : 'redeem_reward_voucher', {target_voucher_id:voucher.dataset.voucherId}, voucher.dataset.voucherAction === 'unlock' ? 'Vale desbloqueado.' : 'Premio canjeado.');
      const duplicatesTrigger = event.target.closest('[data-duplicates-open]');
      if (duplicatesTrigger) openDuplicates(duplicatesTrigger);
      if (event.target.closest('[data-duplicates-close]')) globalThis.ClubMotion?.closeDialog ? void globalThis.ClubMotion.closeDialog(el('duplicatesDialog')) : el('duplicatesDialog').close();
      const pick = event.target.closest('[data-dup-toggle]');
      if (pick) {
        const id = pick.dataset.dupToggle;
        if (discardPicks.has(id)) discardPicks.delete(id); else discardPicks.set(id, duplicateRows().find(item => item.id === id)?.extra || 1);
        paintDiscardPicks();
      }
      const step = event.target.closest('[data-dup-step]');
      if (step) {
        const id = step.dataset.dupCard, next = (discardPicks.get(id) || 0) + Number(step.dataset.dupStep);
        if (next > 0) discardPicks.set(id, next); else discardPicks.delete(id);
        paintDiscardPicks();
      }
      const edition = event.target.closest('[data-dup-edition]');
      if (edition) {
        const rows = duplicateRows().filter(item => item.edition === edition.dataset.dupEdition);
        const all = rows.every(item => discardPicks.get(item.id) === item.extra);
        rows.forEach(item => { if (all) discardPicks.delete(item.id); else discardPicks.set(item.id, item.extra); });
        paintDiscardPicks();
      }
    });
    el('discardSelected').addEventListener('click', () => void mutate('discard_selected_duplicates', {p_items:[...discardPicks].map(([card_id, copies]) => ({card_id, copies}))}, ''));
    el('discardAllDuplicates').addEventListener('click', () => {
      const rows = duplicateRows(), all = rows.every(item => discardPicks.get(item.id) === item.extra);
      discardPicks.clear();
      if (!all) rows.forEach(item => discardPicks.set(item.id, item.extra));
      paintDiscardPicks();
    });
    el('profileBannerToggle').addEventListener('click', () => {
      const picker = el('profileBannerPicker');
      picker.hidden = !picker.hidden;
      el('profileBannerToggle').setAttribute('aria-expanded', String(!picker.hidden));
      if (!picker.hidden) {renderEditor(); if (!state && !request) void refresh();}
    });
    el('profileBannerRetry').addEventListener('click', () => void refresh());
    el('bannerShopClose').addEventListener('click', () => globalThis.ClubMotion?.closeDialog ? void globalThis.ClubMotion.closeDialog(el('bannerShopDialog')) : el('bannerShopDialog').close());
    for(const dialog of [el('bannerShopDialog'),el('duplicatesDialog'),revealDialog])dialog?.addEventListener('cancel',event=>{if(dialog===revealDialog&&packViewer){event.preventDefault();void closePackViewer();return;}if(globalThis.ClubMotion?.closeDialog){event.preventDefault();void globalThis.ClubMotion.closeDialog(dialog);}});
    el('bannerShopDialog').addEventListener('close', () => clearTimeout(shopCountdownTimer));
    const shopTabs = [...document.querySelectorAll('[data-shop-tab]')];
    const selectShopTab = tab => {
      shopTabs.forEach(item => {
        const selected = item === tab;
        item.setAttribute('aria-selected', String(selected)); item.tabIndex = selected ? 0 : -1;
        el(item.getAttribute('aria-controls')).hidden = !selected;
      });
    };
    shopTabs.forEach((tab, index) => {
      tab.addEventListener('click', () => selectShopTab(tab));
      tab.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? shopTabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + shopTabs.length) % shopTabs.length;
        selectShopTab(shopTabs[next]); shopTabs[next].focus();
      });
    });
    el('packsInfoTrigger')?.addEventListener('click', () => {const trigger=el('packsInfoTrigger'), panel=el('packsInfoPanel'), open=trigger.getAttribute('aria-expanded')==='true';panel.hidden=open;trigger.setAttribute('aria-expanded',String(!open));
      // On a phone the panel opens below the fold; bring it into view.
      if(!open)requestAnimationFrame(()=>panel.scrollIntoView?.({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}));});
    el('bannerUnequip').addEventListener('click', () => void mutate('equip_profile_banner', {target_banner_id:null}, 'Banner retirado de tu perfil.'));
    el('packChoicePending')?.addEventListener('click', async () => {
      const pending = packLuck?.pending_choice; if (!pending || !globalThis.PackExtras) return;
      const token = generation, user = options.session();
      if (pending.options.some(item => !card(item.card_id))) await globalThis.CardCatalogSync?.refresh(true);
      const chosen = await globalThis.PackExtras.choose(pending);
      if (token !== generation || user !== options.session()) return;
      if (chosen) { startReveal([chosen], null); await refresh(true); }
    });
    document.addEventListener('bb:card-target', event => { if (event.detail && options?.session()) { packLuck = {...(packLuck || {}), ...event.detail}; renderPackLuck(); } });
    el('ownedPackOpen').addEventListener('click', async () => {if (loading && request) await request.catch(() => {}); const next = packLuck?.waiting ? packLuck.waiting.standard?.next_id : undefined; if (next === null) return; void mutate('open_owned_card_pack', next ? {target_pack_id: next} : {}, '');});
    document.addEventListener('click', event => {if (event.target.closest('[data-pack-open]')) el('ownedPackOpen')?.click();});
    window.addEventListener('online', () => {
      if (options.session()) void refresh();
      if (membersTarget?.isConnected) mountMembers(membersTarget);
    });
    window.addEventListener('offline', render);
    document.addEventListener('visibilitychange', () => {
      updateShopCountdown();
      if (!document.hidden && options?.session() && el('bannerShopDialog')?.open && Date.parse(state?.shop_next_reset_at) <= Date.now()) void refresh();
    });
    render();
  }
  function reset() {
    cancelBadgeReward?.();
    globalThis.PackExtras?.reset();
    clearTimeout(shopResetTimer);
    clearTimeout(shopCountdownTimer);
    closeEditor();
    el('profileBannerOptions').replaceChildren();
    delete el('profileBannerOptions').dataset.signature;
    el('profileBannerSelection').textContent = 'Sin banner';
    discardEffects.forEach(cleanup => cleanup());
    if (inventoryOwner) { try { localStorage.removeItem(inventoryCacheKey(inventoryOwner)); if(localStorage.getItem(offlineInventoryOwnerKey)===inventoryOwner)localStorage.removeItem(offlineInventoryOwnerKey); } catch {} }
    inventoryOwner = null; inventorySavedAt = 0;
    generation++; state = null; packLuck = null; lastInventory = null; busy = false; loading = false; request = null; failure = ''; notice = ''; profileTarget = null; memberBanners.clear(); memberBannerRequests.clear(); memberBannerFetchedAt.clear();
    memberBannerCacheOwner = null; memberBannerCacheSignature = '';
    memberObserver?.disconnect(); memberObserver = null; visibleMemberTiles.clear(); observedMemberTiles.clear();
    paintMembers(); membersTarget = null;
    duplicatesOpener = null;
    globalThis.CardAlbum?.reset();
    globalThis.CollectionSocial?.reset();
    globalThis.CardEconomy?.reset();
    revealDialog.close(); el('duplicatesDialog')?.close();
    el('bannerShopDialog')?.close(); if (el('ownedPackResult')) el('ownedPackResult').replaceChildren(); render();
  }
  document.addEventListener('bb:card-catalog-updated', () => {if (options && (revealDialog.open || el('duplicatesDialog')?.open || el('sobres')?.classList.contains('active'))) render();});
  globalThis.BannerShop = Object.freeze({initialize, offlineInventory, forgetOfflineInventory, refresh, openEditor, closeEditor, mountProfile, mountMembers, memberArtwork, artwork, reset});
})();
