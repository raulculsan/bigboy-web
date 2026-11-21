/* Short arcade sessions. Daily packs are validated and granted by the server. */
(() => {
  'use strict';
  const games = {
    football: {name:'Toques en la sede',item:'Pelota',art:'football-v2.png',unit:'toques',help:'Mueve a El Chota con las flechas de abajo y pulsa Toque cuando el balón entre en su aro. Aguanta los 30 segundos y llega a los toques del nivel. La sombra del suelo marca dónde va a caer. Cada nivel, más velocidad y viento.'},
    skateboard: {name:'Salta con El Chota',item:'Skate',art:'skateboard-v2.png',unit:'saltos',help:'Pulsa Saltar para pasar conos y cajas. Mantén el botón para saltar más alto y más lejos: bancos y barreras lo necesitan. Completa el recorrido sin chocar. Cada nivel es una calle distinta y más rápida.'},
    'robot-vacuum': {name:'La última miga',item:'Roomba',art:'robot-vacuum-v2.png',unit:'migas',help:'Conduce la roomba con el círculo de abajo para limpiar las 30 migas. Cada nivel es una habitación distinta y más grande; la cámara te sigue y el mapa muestra lo que falta. Tienes 3 vidas: cada bola de polvo quita una.'},
    darts: {name:'Dardos en el corcho',item:'Diana',art:'darts-board-v1.svg',unit:'puntos',help:'La mira se mueve sola. Mantén el botón de abajo para frenarla mientras te dure el aire y suéltalo para lanzar. El centro vale 3, el anillo interior 2 y el exterior 1. Cada nivel es un bar distinto, la mira va más rápida y la diana es más pequeña; en los últimos, la diana también se mueve.'}
  };
  const maxLevel=5;
  const levelRules=(id,level)=>({
    goal:id==='football'?[10,14,18,22,26][level-1]:id==='skateboard'?[8,10,12,14,16][level-1]:id==='darts'?[12,18,24,30,36][level-1]:30,
    duration:id==='robot-vacuum'?[30,40,50,60,75][level-1]:30,
    name:id==='robot-vacuum'?['El rincón','El salón','El pasillo','El taller','La gran sede'][level-1]:id==='darts'?['Calentando el brazo','Puntería','Pulso firme','Diana viajera','Rey del corcho'][level-1]:id==='skateboard'?['Primeras cajas','En marcha','A toda pista','Sin frenos','El gran recorrido'][level-1]:['Primeros toques','Más ritmo','Viento cruzado','Alta velocidad','Control total'][level-1]
  });
  let levelProgress={},progressOwner=null;
  const progressKey=()=>`bb:chota-levels:v1:${user()}`;
  function readProgress(){if(progressOwner===user())return;progressOwner=user();try{levelProgress=JSON.parse(localStorage.getItem(progressKey())||'{}')||{};}catch{levelProgress={};}for(const id of Object.keys(games))levelProgress[id]=Math.max(0,Math.min(maxLevel,Math.floor(Number(levelProgress[id])||0)));}
  function cacheProgress(data){readProgress();for(const id of Object.keys(games))if(Number.isInteger(data?.[id]))levelProgress[id]=Math.max(0,Math.min(maxLevel,data[id]));try{localStorage.setItem(progressKey(),JSON.stringify(levelProgress));}catch{}}
  const unlocked=id=>Math.min(maxLevel,(Number(levelProgress[id])||0)+1);
  async function rpc(name,args){const result=await config.rpc(name,args);if(result?.error)throw result.error;return result?.data;}
  async function loadProgress(){readProgress();if(config.rpc){const actor=user();const data=await rpc('get_chota_level_progress');if(actor===user())cacheProgress(data);}}
  function roomFor(level){
    const sizes=[[600,450],[720,520],[840,600],[960,680],[1080,760]];
    const layouts=[
      [[126,205,76,72],[366,280,98,55],[390,132,62,65]],
      [[105,155,120,65],[360,160,70,130],[190,330,130,62],[495,355,105,68]],
      [[130,170,140,65],[420,145,95,100],[610,270,90,100],[265,365,155,65],[510,450,140,60]],
      [[115,155,95,115],[345,170,145,65],[650,145,110,85],[205,390,135,85],[530,350,95,130],[740,510,110,60]],
      [[120,170,150,75],[405,145,105,115],[715,170,135,70],[870,340,90,120],[230,400,110,110],[495,365,135,70],[560,570,150,65],[110,600,125,65]]
    ];
    return {width:sizes[level-1][0],height:sizes[level-1][1],furniture:layouts[level-1].map(([x,y,w,h])=>({x,y,w,h})),palette:[['#59412e','#252e44','#b87a38'],['#594c39','#244443','#bc9567'],['#4e4356','#333552','#b5a07a'],['#514639','#334337','#c58d52'],['#4b3c3d','#3e2e49','#c99b67']][level-1]};
  }
  let config = {}, dialog = null, round = null, frame = 0, root = null, previousFocus = null, serial = 0, holdTimer = 0;
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const user = () => String(config.session?.() || 'guest');
  const key = () => `bb:chota-games:v1:${user()}`;
  function scores(){try{return JSON.parse(localStorage.getItem(key()) || '{}') || {};}catch{return {};}}
  function save(game,score){const best=scores();best[game]=Math.max(Number(best[game]) || 0,score);try{localStorage.setItem(key(),JSON.stringify(best));}catch{}return best[game];}
  async function owned(){
    const data = config.getOwnedItems ? await config.getOwnedItems() : await globalThis.ChotaShop?.refresh?.();
    const items = Array.isArray(data) ? data : data?.items;
    if(items)return new Set(items.filter(i=>typeof i==='string'||i.owned===true).map(i=>typeof i==='string'?i:i.art_key));
    return new Set(Object.keys(games).filter(id=>document.querySelector(`.chota-room-${id}`)));
  }
  function mount(container){
    if(!container)return;
    root=container;
    root.classList.add('chota-arcade-entry');
    root.innerHTML='<button type="button" data-chota-arcade aria-label="Juegos de El Chota" title="Juegos de El Chota"><svg viewBox="0 0 28 24" aria-hidden="true"><path d="M8 6h12c3 0 4 3 5 9s-2 7-5 3l-2-2h-8l-2 2c-3 4-6 3-5-3S5 6 8 6Z"/><path d="M8 9v6m-3-3h6"/><circle cx="19" cy="10" r="1"/><circle cx="22" cy="13" r="1"/></svg></button>';
    root.querySelector('button').addEventListener('click',open);
  }
  function stop(){cancelAnimationFrame(frame);clearTimeout(holdTimer);holdTimer=0;frame=0;round=null;}
  function close({immediate=false}={}){serial++;stop();const old=dialog;dialog=null;const finish=()=>{old?.remove();if(!dialog&&!document.querySelector('dialog[open]'))previousFocus?.focus?.({preventScroll:true});};if(old&&globalThis.ClubMotion?.closeDialog)return globalThis.ClubMotion.closeDialog(old,finish,{immediate});old?.close();finish();return Promise.resolve();}
  async function open(){
    if(dialog)return;
    previousFocus=document.activeElement;
    dialog=document.createElement('dialog');dialog.className='chota-arcade';dialog.setAttribute('aria-label','Minijuegos de El Chota');
    dialog.innerHTML='<div class="chota-arcade-shell"><header><h2>Juegos</h2><button type="button" data-arcade-close aria-label="Cerrar minijuegos">Cerrar</button></header><div data-arcade-body aria-live="polite"><p>Cargando sus objetos…</p></div></div>';
    document.body.append(dialog);if(globalThis.ClubMotion?.openDialog)globalThis.ClubMotion.openDialog(dialog);else dialog.showModal();
    dialog.querySelector('[data-arcade-close]').addEventListener('click',close);
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    dialog.addEventListener('click',event=>{if(event.target===dialog)close();});
    await menu();
  }
  async function menu(){
    stop();const token=++serial, actor=user();
    if(!dialog)return;
    let inventory;
    try{[inventory]=await Promise.all([owned(),loadProgress().catch(()=>{})]);}catch{inventory=new Set();}
    if(token!==serial||actor!==user()||!dialog)return;
    const best=scores();
    body().innerHTML=`<section class="chota-duels" data-duels hidden></section><div class="chota-arcade-games">${Object.entries(games).map(([id,g])=>`<button class="chota-arcade-game" type="button" data-game="${id}" aria-describedby="chotaGameHelpHint" ${inventory.has(id)?'':'data-locked="true"'}><img src="icons/clubhouse/props/${g.art}" alt="" draggable="false"><span><strong>${g.name}</strong><small>${inventory.has(id)?`Nivel ${unlocked(id)} de ${maxLevel} · Récord ${Number(best[id])||0}`:`Necesitas ${g.item.toLowerCase()}`}</small></span><b>${inventory.has(id)?'Jugar':'Tienda'}</b></button>`).join('')}</div><div class="chota-arcade-menu-note"><p>1 sobre por juego al día</p><p id="chotaGameHelpHint">Mantén pulsado un juego para ver cómo jugar. Al guardar una partida puedes retar a alguien a superarla.</p></div>`;
    void duels(body().querySelector('[data-duels]'));
    body().querySelectorAll('[data-game]').forEach(button=>{
      let press=null,suppressUntil=0;
      const clearHold=()=>{clearTimeout(holdTimer);holdTimer=0;press=null;button.classList.remove('is-holding');};
      const explain=()=>{clearHold();suppressUntil=performance.now()+900;briefing(button.dataset.game,button.dataset.locked==='true');};
      button.addEventListener('pointerdown',event=>{
        if(event.button!==0||!event.isPrimary)return;
        clearHold();press={x:event.clientX,y:event.clientY};button.classList.add('is-holding');
        holdTimer=setTimeout(explain,450);
      });
      button.addEventListener('pointermove',event=>{if(press&&Math.hypot(event.clientX-press.x,event.clientY-press.y)>10)clearHold();});
      ['pointerup','pointercancel','pointerleave','lostpointercapture'].forEach(type=>button.addEventListener(type,clearHold));
      button.addEventListener('contextmenu',event=>{event.preventDefault();if(performance.now()>=suppressUntil)explain();});
      button.addEventListener('keydown',event=>{if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'){event.preventDefault();explain();}});
      button.addEventListener('click',event=>{
        clearHold();if(performance.now()<suppressUntil){event.preventDefault();return;}
        if(button.dataset.locked){if(config.openShop){close();config.openShop();}return;}
        levels(button.dataset.game);
      });
    });
  }
  // Duels ("retos"): beat a member's saved score on the same game and level.
  const duelState={incoming:'Te reta',outgoing:'Has retado'};
  async function duels(node){
    if(!node||!config.rpc)return;const actor=user();
    try{
      const data=await rpc('get_chota_duels');if(!node.isConnected||actor!==user())return;
      const list=(data?.duels||[]).filter(d=>d.status==='open'||d.can_claim);
      if(!list.length){node.hidden=true;return;}
      node.hidden=false;
      const row=d=>{
        const g=games[d.game],open=d.status==='open',left=Math.max(0,3-Number(d.attempts||0));
        const when=new Date(d.expires_at).toLocaleString('es-ES',{weekday:'short',hour:'2-digit',minute:'2-digit'});
        const result=d.status==='won'?(d.incoming?'¡Le has ganado!':'Te ha superado'):d.status==='lost'?(d.incoming?'No le has superado':'¡Tu marca ha aguantado!'):d.status==='tied'?'Empate':'';
        const detail=open?(d.incoming?`Supera ${Number(d.target_score)} ${g?.unit||'puntos'} · ${left} intento${left===1?'':'s'} · hasta ${when}`:`Tu marca: ${Number(d.target_score)} · lleva ${Number(d.attempts)} de 3 intentos`):`${result} · su mejor: ${d.rival_best??'—'} de ${Number(d.target_score)}`;
        const actions=d.can_claim?`<button type="button" data-duel-claim="${esc(d.id)}">Cobrar 40 monedas</button>`:open&&d.incoming?`<button type="button" data-duel-play="${esc(d.game)}" data-duel-level="${Number(d.level)}">Jugar</button><button type="button" class="chota-duel-quiet" data-duel-decline="${esc(d.id)}">${Number(d.attempts)?'Plantarme':'Rechazar'}</button>`:'';
        return `<article class="chota-duel" data-state="${esc(d.status)}"><div><small>${esc(d.incoming?duelState.incoming:duelState.outgoing)} ${esc(d.incoming?d.other:'a '+d.other)}</small><strong>${esc(g?.name||d.game)} · nivel ${Number(d.level)}</strong><p>${esc(detail)}</p></div>${actions?`<div class="chota-duel-actions">${actions}</div>`:''}</article>`;
      };
      node.innerHTML=`<h3>Retos</h3>${list.map(row).join('')}<p class="chota-duel-feedback" role="status" aria-live="polite"></p>`;
      const feedback=node.querySelector('.chota-duel-feedback');
      node.querySelectorAll('[data-duel-play]').forEach(button=>button.addEventListener('click',()=>start(button.dataset.duelPlay,Number(button.dataset.duelLevel))));
      node.querySelectorAll('[data-duel-decline],[data-duel-claim]').forEach(button=>button.addEventListener('click',async()=>{
        button.disabled=true;const claim=!!button.dataset.duelClaim;
        try{const r=await rpc(claim?'claim_chota_duel':'decline_chota_duel',{p_duel:button.dataset.duelClaim||button.dataset.duelDecline});if(claim)globalThis.ClubCoinMissions?.activity({coins:r?.awarded_coins});await duels(node);if(claim&&node.isConnected){const f=node.querySelector('.chota-duel-feedback');if(f)f.textContent=`+${Number(r?.awarded_coins)||0} monedas`;}}
        catch(error){button.disabled=false;feedback.textContent=error?.message||'No se pudo completar. Vuelve a intentarlo.';}
      }));
    }catch{node.hidden=true;}
  }
  async function challenge(host,sessionId){
    if(!host||!config.rpc)return;const actor=user();
    host.innerHTML='<button type="button" class="chota-arcade-secondary" data-duel-open>Retar a alguien con esta marca</button>';
    host.querySelector('[data-duel-open]').addEventListener('click',async()=>{
      host.innerHTML='<p>Cargando miembros…</p>';
      try{
        const data=await rpc('get_chota_duels');if(!host.isConnected||actor!==user())return;
        const peers=data?.peers||[];
        host.innerHTML=`<p class="chota-duel-pick-title">¿A quién retas? Tendrá 48 horas y 3 intentos.</p><div class="chota-duel-peers">${peers.map(p=>`<button type="button" data-duel-peer="${esc(p.id)}">${esc(p.name||'Miembro')}</button>`).join('')}</div><p class="chota-duel-feedback" role="status" aria-live="polite"></p>`;
        const feedback=host.querySelector('.chota-duel-feedback');
        host.querySelectorAll('[data-duel-peer]').forEach(button=>button.addEventListener('click',async()=>{
          host.querySelectorAll('[data-duel-peer]').forEach(b=>b.disabled=true);
          try{await rpc('create_chota_duel',{p_session:sessionId,p_rival:button.dataset.duelPeer});if(host.isConnected)host.innerHTML=`<p class="chota-duel-sent">Reto enviado a ${esc(button.textContent)}.</p>`;}
          catch(error){host.querySelectorAll('[data-duel-peer]').forEach(b=>b.disabled=false);feedback.textContent=error?.message||'No se pudo enviar el reto.';}
        }));
      }catch{if(host.isConnected)host.innerHTML='<p>No se pudo cargar la lista. Vuelve a intentarlo luego.</p>';}
    });
  }
  async function weeklyChallenge(node){
    if(!node)return;if(!config.rpc){node.innerHTML='<p>El reto semanal no está disponible ahora.</p>';return;}const actor=user();
    try{const {data,error}=await config.rpc('get_chota_weekly_challenge');if(error)throw error;if(!node.isConnected||actor!==user())return;
      const game=games[data.game];
      node.innerHTML=`<div class="club-weekly-heading"><span>RETO DE LA SEMANA</span><small>Hasta ${new Date(data.ends_at).toLocaleDateString('es-ES',{day:'numeric',month:'short'})}</small></div><h3>${esc(game?.name||'El reto del club')}</h3><p>Consigue ${Number(data.target)} puntos. Cuando ${Number(data.club_goal)} miembros lo consigan, cada participante que supere el reto recibe ${Number(data.club_reward_packs)} sobres.</p><div class="club-weekly-progress"><progress value="${Math.min(Number(data.participants)||0,Number(data.club_goal)||3)}" max="${Number(data.club_goal)||3}"></progress><span>${Number(data.participants)||0}/${Number(data.club_goal)||3} miembros · Tu marca: ${Number(data.my_best)||0}</span></div><ol class="club-weekly-ranking">${(data.leaderboard||[]).slice(0,10).map((r,i)=>`<li><span>${i+1}. ${esc(r.name||'Miembro')}</span><strong>${Number(r.score)||0}</strong></li>`).join('')||'<li>Aún no hay marcas esta semana.</li>'}</ol>${data.reward_claimed?'<p>Recompensa recibida</p>':data.club_complete&&Number(data.my_best)>=Number(data.target)?'<button type="button" data-weekly-claim>Recoger sobres</button>':'<p>Las partidas guardadas cuentan automáticamente para este reto.</p>'}`;
      node.querySelector('[data-weekly-claim]')?.addEventListener('click',async e=>{e.target.disabled=true;try{const r=await config.rpc('claim_chota_weekly_reward');if(r.error)throw r.error;void globalThis.DailyPacks?.refresh(true);await weeklyChallenge(node);}catch{e.target.disabled=false;e.target.textContent='Reintentar recompensa';}});
    }catch{if(node.isConnected)node.innerHTML='<p>El reto semanal no está disponible. Puedes seguir jugando y guardar tus marcas.</p>';}
  }
  const body=()=>dialog?.querySelector('[data-arcade-body]');
  function briefing(id,locked=false){
    clearTimeout(holdTimer);holdTimer=0;const g=games[id];
    body().innerHTML=`<section class="chota-arcade-brief"><img src="icons/clubhouse/props/${g.art}" alt="" draggable="false"><h2 tabindex="-1">${g.name}</h2><p>${g.help}</p>${locked?'<p>Consigue este objeto en la tienda para jugar.</p>':'<button type="button" data-start>Jugar</button>'}<button type="button" class="chota-arcade-secondary" data-menu>Volver a los juegos</button></section>`;
    body().querySelector('[data-start]')?.addEventListener('click',()=>levels(id));
    body().querySelector('[data-menu]').addEventListener('click',menu);
    body().querySelector('h2').focus({preventScroll:true});
  }
  function levels(id,message=''){
    stop();serial++;readProgress();if(!dialog)return;
    const cleared=Number(levelProgress[id])||0;
    body().innerHTML=`<section class="chota-level-select"><div class="chota-level-heading"><img src="icons/clubhouse/props/${games[id].art}" alt=""><div><h2 tabindex="-1">${games[id].name}</h2><p>${cleared===maxLevel?'Todos los niveles superados':`${cleared} de ${maxLevel} superados`}</p></div></div>${message?`<p role="status" class="chota-level-error">${esc(message)}</p>`:''}<div class="chota-level-list">${Array.from({length:maxLevel},(_,index)=>{const level=index+1,rules=levelRules(id,level),locked=level>unlocked(id);return `<button type="button" data-level-start="${level}" ${locked?'disabled':''}><span class="chota-level-number">${level}</span><span><strong>${rules.name}</strong><small>${sceneNames[id]?sceneNames[id][index]+' · ':''}${id==='robot-vacuum'?`30 migas · ${rules.duration} s`:id==='football'?`${rules.goal} toques · 30 s`:id==='darts'?`${rules.goal} puntos · 30 s`:`${rules.goal} obstáculos · 30 s`}</small></span><b>${locked?'Bloqueado':level<=cleared?'Superado':'Jugar'}</b></button>`;}).join('')}</div><button type="button" class="chota-arcade-secondary" data-menu>Volver a juegos</button></section>`;
    body().querySelectorAll('[data-level-start]').forEach(button=>button.addEventListener('click',()=>start(id,Number(button.dataset.levelStart))));
    body().querySelector('[data-menu]').addEventListener('click',menu);body().querySelector('h2').focus({preventScroll:true});
  }
  // Controls live in a pad below the level (redesign 2026-11-15): the finger
  // never covers the ball, the roomba or the board. Each game has its own pad.
  const pads={
    football:'<div class="chota-pad chota-pad-football"><button type="button" data-hold="left" aria-label="Mover a la izquierda"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg></button><button type="button" class="chota-pad-main" data-press="kick">Toque</button><button type="button" data-hold="right" aria-label="Mover a la derecha"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></button></div><p class="chota-pad-hint">Muévete bajo el balón y pulsa <b>Toque</b> cuando el aro se ilumine.</p>',
    skateboard:'<div class="chota-pad chota-pad-single"><button type="button" class="chota-pad-main" data-hold="jump">Saltar</button></div><p class="chota-pad-hint">Toca para un salto corto. <b>Mantén</b> para saltar más alto y más lejos.</p>',
    'robot-vacuum':'<div class="chota-pad chota-pad-stick"><div class="chota-stick" data-stick role="slider" aria-label="Dirección de la roomba" aria-valuetext="Quieta"><span></span></div><p class="chota-pad-hint">Desliza el pulgar en el círculo para conducir. Esquiva las bolas de polvo.</p></div>',
    darts:'<div class="chota-pad chota-pad-single"><button type="button" class="chota-pad-main" data-hold="aim">Mantén para apuntar · suelta para lanzar</button></div><p class="chota-pad-hint">Mientras mantienes, la mira va más lenta hasta que se acaba el aire.</p>'
  };
  const sceneNames={
    football:['La sede','La terraza','El parque','La azotea','El estadio'],
    skateboard:['El barrio','El parking','El puerto','La ciudad de noche','El puente'],
    darts:['El corcho de la sede','El bar irlandés','El pub de neón','El garaje','La gran final']
  };
  async function start(id,level=1){
    stop();const token=++serial,actor=user();readProgress();
    if(!games[id]||!Number.isInteger(level)||level<1||level>unlocked(id)){levels(id);return;}
    body().innerHTML='<p role="status">Preparando el nivel…</p>';
    let sessionId;
    try{sessionId=config.rpc?await rpc('start_chota_level',{target_game:id,target_level:level}):config.startGame?await config.startGame(id):null;}
    catch{if(dialog&&token===serial&&actor===user())levels(id,'No se pudo preparar la partida. Comprueba la conexión y vuelve a intentarlo.');return;}
    if(!dialog||token!==serial||actor!==user())return;
    const rules=levelRules(id,level),world=roomFor(level);
    body().innerHTML=`<div class="chota-arcade-score"><div><span>${games[id].unit}</span><strong data-score>0 / ${rules.goal}</strong></div><h2>${games[id].name}</h2><div><span>Tiempo</span><strong data-clock>${rules.duration}</strong></div></div><div class="chota-arcade-round-status"><div class="chota-arcade-level"><strong>Nivel ${level} · ${rules.name}</strong><progress data-level-progress value="0" max="${rules.goal}" aria-label="Objetivo del nivel"></progress><span data-level-next>${id==='football'?`Consigue ${rules.goal} toques en ${rules.duration} segundos`:id==='darts'?`Suma ${rules.goal} puntos en ${rules.duration} segundos`:id==='skateboard'?`Supera ${rules.goal} obstáculos sin chocar`:'Limpia las 30 migas del mapa'}</span></div>${id==='robot-vacuum'?'<div class="chota-arcade-lives" data-lives role="img" aria-label="3 vidas restantes">'+Array.from({length:3},()=>'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20S3 14.7 3 8.7A5.2 5.2 0 0 1 12 5a5.2 5.2 0 0 1 9 3.7C21 14.7 12 20 12 20Z"/></svg>').join('')+'</div>':''}</div><div class="chota-arcade-stage" role="application" aria-label="${esc(games[id].help)}" tabindex="0"><canvas aria-label="Zona de juego"></canvas></div>${pads[id]}<button type="button" class="chota-arcade-secondary" data-abandon>Terminar partida</button>`;
    const stage=body().querySelector('.chota-arcade-stage'),canvas=stage.querySelector('canvas'),ctx=canvas.getContext('2d');
    if(!ctx){levels(id,'Este dispositivo no pudo abrir el juego.');return;}
    const dpr=Math.min(devicePixelRatio||1,2);canvas.width=600*dpr;canvas.height=450*dpr;ctx.scale(dpr,dpr);ctx.imageSmoothingEnabled=false;
    const r=round={id,token,actor,score:0,level,rules,world,time:0,last:0,completed:false,endReason:'',misses:0,pops:[],
      input:{left:false,right:false,kick:false,jump:false,aim:false,stick:{x:0,y:0},keys:new Set()},
      px:300,facing:1,kickT:0,lastKick:-1,ball:{x:300,y:120,vy:0,vx:70+(level-1)*20},
      aim:{x:300,y:210},aimPhase:0,breath:1.6,board:{x:300,y:215,r:[118,110,104,98,96][level-1]},darts:[],lastThrow:-1,
      jump:0,vy:0,skateAir:0,skateLanding:0,holdT:0,obstacles:[],spawn:.9,
      x:world.width/2,y:world.height-65,camera:{x:Math.max(0,world.width/2-300),y:Math.max(0,world.height-450)},lives:3,invulnerable:.9,stunned:0,heading:0,
      hazards:Array.from({length:1+Math.floor((level-1)/2)},(_,index)=>({phase:-1.55+index*2.75,x:82,y:185,age:0})),furniture:world.furniture,crumbs:[],serverSession:Promise.resolve(sessionId)};
    if(id==='robot-vacuum'){
      // Deterministic cells spread the objective over the whole room. Furniture
      // has a clear margin so crumbs cannot spawn under an obstacle.
      const cells=[];for(let y=135;y<world.height-45;y+=38)for(let x=58;x<world.width-45;x+=38)if(!r.furniture.some(o=>x>o.x-35&&x<o.x+o.w+35&&y>o.y-30&&y<o.y+o.h+30))cells.push({x,y,active:true});
      let seed=level*193;for(let i=cells.length-1;i>0;i--){seed=(seed*1664525+1013904223)>>>0;const j=seed%(i+1);[cells[i],cells[j]]=[cells[j],cells[i]];}
      r.crumbs=cells.slice(0,30);
    }
    r.art=new Image();r.art.src=`icons/clubhouse/props/${games[id].art}`;r.pet=new Image();r.pet.src=globalThis.ChotaAppearance?.sheet?.('base')||'icons/mascot/chota-v2/chota-poses.webp';r.pet.modular=globalThis.ChotaAppearance?.enabled?.()===true;
    r.scene=buildScene(id,level,world);
    // Pad: hold buttons stay pressed while the finger is down; press buttons fire once.
    const pad=body().querySelector('.chota-pad');
    const release=(button,name)=>{button.removeAttribute('data-active');if(button.dataset.press)return;if(name==='jump')r.input.jump=false;else if(name==='aim'){if(r.input.aim){r.input.aim=false;throwDart(r);}}else r.input[name]=false;};
    pad.querySelectorAll('[data-hold],[data-press]').forEach(button=>{
      const name=button.dataset.hold||button.dataset.press;
      button.addEventListener('pointerdown',event=>{if(round!==r)return;event.preventDefault();try{button.setPointerCapture?.(event.pointerId);}catch{}button.setAttribute('data-active','');
        if(button.dataset.press)r.input[name]=true;else{r.input[name]=true;if(name==='jump')skateJump(r);}});
      ['pointerup','pointercancel','lostpointercapture'].forEach(type=>button.addEventListener(type,()=>{if(round===r&&button.hasAttribute('data-active'))release(button,name);}));
      button.addEventListener('contextmenu',event=>event.preventDefault());
    });
    const stick=pad.querySelector('[data-stick]');
    if(stick){
      const knob=stick.querySelector('span');let owner=null;
      const set=(x,y)=>{r.input.stick={x,y};knob.style.transform=`translate(${x*46}px,${y*46}px)`;stick.setAttribute('aria-valuetext',Math.hypot(x,y)<.15?'Quieta':'En marcha');};
      const move=event=>{const b=stick.getBoundingClientRect(),cx=b.left+b.width/2,cy=b.top+b.height/2;let x=(event.clientX-cx)/(b.width/2-14),y=(event.clientY-cy)/(b.height/2-14);const m=Math.hypot(x,y);if(m>1){x/=m;y/=m;}set(m<.15?0:x,m<.15?0:y);};
      stick.addEventListener('pointerdown',event=>{if(round!==r)return;event.preventDefault();owner=event.pointerId;try{stick.setPointerCapture?.(event.pointerId);}catch{}stick.setAttribute('data-active','');move(event);});
      stick.addEventListener('pointermove',event=>{if(owner===event.pointerId){event.preventDefault();move(event);}});
      ['pointerup','pointercancel','lostpointercapture'].forEach(type=>stick.addEventListener(type,event=>{if(owner!==event.pointerId)return;owner=null;stick.removeAttribute('data-active');set(0,0);}));
    }
    // Keyboard: arrows move, space/enter acts.
    const keyName=event=>({ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down',' ':'act',Enter:'act'})[event.key];
    stage.addEventListener('keydown',event=>{const k=keyName(event);if(!k||round!==r)return;event.preventDefault();if(event.repeat)return;r.input.keys.add(k);
      if(k==='act'){if(id==='football')r.input.kick=true;else if(id==='skateboard'){r.input.jump=true;skateJump(r);}else if(id==='darts')r.input.aim=true;}});
    stage.addEventListener('keyup',event=>{const k=keyName(event);if(!k||round!==r)return;r.input.keys.delete(k);
      if(k==='act'){if(id==='skateboard')r.input.jump=false;else if(id==='darts'&&r.input.aim){r.input.aim=false;throwDart(r);}}});
    body().querySelector('[data-abandon]').addEventListener('click',()=>{r.endReason='abandoned';finish(r);});stage.focus({preventScroll:true});
    const scoreLabel=body().querySelector('[data-score]'),clockLabel=body().querySelector('[data-clock]'),goalProgress=body().querySelector('[data-level-progress]'),livesLabel=body().querySelector('[data-lives]');let shownLives=3;
    const loop=now=>{
      if(round!==r||token!==serial||!dialog)return;
      if(r.actor!==user()){close();return;}
      const dt=r.last?Math.min((now-r.last)/1000,.04):0;r.last=now;r.time+=dt;
      update(r,dt);if(round!==r)return;draw(ctx,r);
      const scoreText=`${r.score} / ${rules.goal}`;if(scoreLabel.textContent!==scoreText)scoreLabel.textContent=scoreText;if(goalProgress.value!==Math.min(r.score,rules.goal))goalProgress.value=Math.min(r.score,rules.goal);
      if(livesLabel&&shownLives!==r.lives){shownLives=r.lives;livesLabel.setAttribute('aria-label',`${r.lives} ${r.lives===1?'vida restante':'vidas restantes'}`);livesLabel.querySelectorAll('svg').forEach((heart,index)=>heart.classList.toggle('is-lost',index>=r.lives));}
      const seconds=String(Math.max(0,Math.ceil(rules.duration-r.time)));if(clockLabel.textContent!==seconds)clockLabel.textContent=seconds;
      const goal=r.score>=rules.goal;
      if((id!=='football'&&goal)||r.time>=rules.duration){r.completed=true;r.endReason=goal?'goal':'time';finish(r);return;}
      frame=requestAnimationFrame(loop);
    };frame=requestAnimationFrame(loop);
  }
  function pop(r,x,y,text,good=true){r.pops.push({x,y,text,good,age:0});}
  // Floatier jumps on the slower levels: a tap clears a box with ~0.3 s of
  // margin and a held jump clears a barrier with ~0.5 s on every level.
  const skateLift=[400,410,420,430,440],skateGravity=[820,900,980,1060,1150];
  // A press just before landing is kept for a moment and fires on touchdown.
  function skateJump(r){if(r.jump===0&&r.skateLanding<.08){r.vy=skateLift[r.level-1];r.jump=.01;r.skateAir=0;r.holdT=0;r.skateLanding=0;r.jumpQueued=-1;}else r.jumpQueued=r.time;}
  const obstacleKinds={caja:{w:45,h:43},cono:{w:26,h:34},banco:{w:70,h:28},barrera:{w:30,h:72}};
  const obstaclePool=[['caja','cono'],['caja','cono','banco'],['caja','cono','banco','barrera'],['caja','banco','barrera','cono','barrera'],['barrera','caja','banco','barrera','cono']];
  function update(r,dt){
    const difficulty=r.level-1,input=r.input,keys=input.keys;
    for(const p of r.pops)p.age+=dt;r.pops=r.pops.filter(p=>p.age<.9);
    if(r.id==='football'){
      // Move El Chota under the ball; a kick only lands when the ball is in reach.
      // Kicks get shorter on later levels so the higher goals fit in 30 seconds.
      const dir=(input.right||keys.has('right')?1:0)-(input.left||keys.has('left')?1:0);
      if(dir)r.facing=dir;
      r.px=Math.max(70,Math.min(530,r.px+dir*(290+difficulty*14)*dt));
      r.kickT=Math.max(0,r.kickT-dt);
      const wind=Math.sin(r.time*(1.2+difficulty*.2))*(22+difficulty*22);r.wind=wind;
      const b=r.ball;b.vy+=(500+difficulty*70)*dt;b.vx+=wind*dt;b.y+=b.vy*dt;b.x+=b.vx*dt;
      if(b.x<30||b.x>570){b.x=Math.max(30,Math.min(570,b.x));b.vx*=-.85;}
      if(b.y<34){b.y=34;b.vy=Math.abs(b.vy)*.5;}
      const reach=64-difficulty*3;r.inReach=Math.abs(b.x-r.px)<reach&&b.y>215&&b.y<372;
      if(input.kick){input.kick=false;
        if(r.time-r.lastKick>.2&&r.inReach){r.lastKick=r.time;r.kickT=.18;b.vy=-[440,442,448,426,390][difficulty];b.vx=Math.max(-260,Math.min(260,(b.x-r.px)*3+dir*110+(Math.random()-.5)*(40+difficulty*14)));r.score++;pop(r,b.x,b.y-40,'+1');}
        else if(r.time-r.lastKick>.2)pop(r,r.px,270,'Lejos',false);
      }
      if(b.y>400){r.misses++;pop(r,b.x,380,'Caída',false);r.ball={x:120+Math.random()*360,y:60,vy:0,vx:(Math.random()<.5?-1:1)*(70+difficulty*20)};}
    }
    if(r.id==='skateboard'){
      r.skateLanding=Math.max(0,r.skateLanding-dt);
      if(r.jump>0){
        r.skateAir+=dt;
        // Holding the button while rising keeps the lift going: higher and longer.
        const holding=input.jump&&r.vy>0&&r.holdT<.24;if(holding)r.holdT+=dt;
        const gravity=skateGravity[difficulty];r.vy-=(holding?gravity*.42:gravity)*dt;r.jump=Math.max(0,r.jump+r.vy*dt);
        if(r.jump===0){r.skateLanding=.16;r.vy=0;}
      }
      if(r.jump===0&&r.skateLanding<.08&&r.jumpQueued>=0&&r.time-r.jumpQueued<.25)skateJump(r);
      const speed=220+difficulty*32;r.trackX=(r.trackX||0)+speed*dt;
      r.spawn-=dt;if(r.spawn<=0){const pool=obstaclePool[difficulty],kind=pool[Math.floor(Math.random()*pool.length)];r.obstacles.push({x:660,kind,...obstacleKinds[kind],passed:false});r.spawn=(kind==='banco'||kind==='barrera'?1.6:1.3)-difficulty*.1+Math.random()*.45;}
      for(const o of r.obstacles){o.x-=speed*dt;if(!o.passed&&o.x+o.w<153-24){o.passed=true;r.score++;pop(r,153,280,'+1');}
        // The hitbox is the rider's feet, not the whole deck, so near misses feel fair.
        if(o.x<153+24&&o.x+o.w>153-24&&r.jump<o.h-3){r.completed=true;r.endReason='collision';finish(r);return;}}
      r.obstacles=r.obstacles.filter(o=>o.x>-120);
    }
    if(r.id==='darts'){
      // Holding steadies the aim while there is breath; releasing throws.
      const steady=input.aim&&r.breath>0;
      if(steady)r.breath=Math.max(0,r.breath-dt);else if(!input.aim)r.breath=Math.min(1.6,r.breath+.5*dt);
      const speed=1+difficulty*.28,b=r.board;r.aimPhase+=dt*(steady?.22:1);
      b.x=r.level>=4?300+Math.sin(r.time*(.7+difficulty*.12))*(r.level===5?150:110):300;
      r.aim.x=b.x+Math.sin(r.aimPhase*1.9*speed)*125+Math.sin(r.aimPhase*.7*speed+1)*35;
      r.aim.y=b.y+Math.sin(r.aimPhase*1.3*speed+.8)*95;
    }
    if(r.id==='robot-vacuum'){
      r.stunned=Math.max(0,r.stunned-dt);r.invulnerable=Math.max(0,r.invulnerable-dt);
      let sx=input.stick.x+(keys.has('right')?1:0)-(keys.has('left')?1:0),sy=input.stick.y+(keys.has('down')?1:0)-(keys.has('up')?1:0);
      const m=Math.hypot(sx,sy);if(m>1){sx/=m;sy/=m;}
      if(m>.05){
        r.heading=Math.atan2(sy,sx);
        const v=(r.stunned>0?65:225)*dt,dx=sx*v,dy=sy*v;
        const blocked=(x,y)=>x<46||x>r.world.width-46||y<125||y>r.world.height-35||r.furniture.some(o=>x>o.x-28&&x<o.x+o.w+28&&y>o.y-21&&y<o.y+o.h+21);
        if(!blocked(r.x+dx,r.y))r.x+=dx;
        if(!blocked(r.x,r.y+dy))r.y+=dy;
      }
      for(let index=0;index<r.hazards.length;index++){
        const hazard=r.hazards[index];hazard.age+=dt;hazard.phase+=(.9+difficulty*.16+index*.08)*dt;
        hazard.x=r.world.width/2+Math.sin(hazard.phase)*(r.world.width/2-70);hazard.y=125+(r.world.height-165)/2+Math.cos(hazard.phase*1.5+index)*(r.world.height-165)/2;
        if(hazard.age>.7&&r.invulnerable<=0&&Math.hypot(hazard.x-r.x,hazard.y-r.y)<39){
          r.lives--;r.invulnerable=1.5;r.stunned=.6;pop(r,r.x,r.y-40,'¡Polvo!',false);
          if(r.lives===0){r.completed=true;r.endReason='dust';finish(r);return;}
        }
      }
      for(const c of r.crumbs)if(c.active&&Math.hypot(c.x-r.x,c.y-r.y)<26){c.active=false;r.score++;pop(r,c.x,c.y-20,'+1');}
      const follow=Math.min(1,dt*9);r.camera.x+=(Math.max(0,Math.min(r.world.width-600,r.x-300))-r.camera.x)*follow;r.camera.y+=(Math.max(0,Math.min(r.world.height-450,r.y-225))-r.camera.y)*follow;
    }
  }
  // Seeded randomness keeps each level's scenery identical between attempts.
  const seeded=seed=>()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const layer=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
  function buildScene(id,level,world){
    const rand=seeded(level*977+id.length*31);
    if(id==='robot-vacuum')return {floor:roomCanvas(level,world,rand)};
    if(id==='skateboard')return skateLayers(level,rand);
    const c=layer(600,450),g=c.getContext('2d');
    if(id==='football')footballScene(g,level,rand);else dartsScene(g,level,rand);
    return {back:c};
  }
  const sky=(g,stops,h=450)=>{const s=g.createLinearGradient(0,0,0,h);stops.forEach(([o,c])=>s.addColorStop(o,c));g.fillStyle=s;g.fillRect(0,0,600,h);};
  function skyline(g,rand,{base,minH,maxH,color,windows,lit=.3,x0=0,x1=600}){let x=x0;while(x<x1){const w=26+rand()*44,h=minH+rand()*(maxH-minH);g.fillStyle=color;g.fillRect(x,base-h,w,h);if(windows)for(let wy=base-h+8;wy<base-8;wy+=12)for(let wx=x+5;wx<x+w-6;wx+=9)if(rand()<lit){g.fillStyle=windows;g.fillRect(wx,wy,4,6);}x+=w+2;}}
  function footballScene(g,level,rand){
    if(level===1){ // The club house lounge: posters, window, sofa and rug.
      g.fillStyle='#2a2e3a';g.fillRect(0,0,600,450);g.fillStyle='#3a3226';g.fillRect(0,255,600,195);for(let x=0;x<600;x+=60){g.fillStyle='#352d22';g.fillRect(x,260,2,190);}
      for(let y=0;y<255;y+=36){g.fillStyle=y%72?'#2d3240':'#282c38';g.fillRect(0,y,600,36);}
      g.fillStyle='#4e3a26';g.fillRect(0,250,600,10);
      g.fillStyle='#10161f';g.fillRect(380,40,170,130);g.fillStyle='#1c2a3e';g.fillRect(388,48,154,114);skyline(g,rand,{base:162,minH:30,maxH:90,color:'#0e1520',windows:'#f2c66b',x0:388,x1:540});g.strokeStyle='#4e3a26';g.lineWidth=6;g.strokeRect(380,40,170,130);g.beginPath();g.moveTo(465,40);g.lineTo(465,170);g.stroke();
      for(const [x,y,w,h,c] of [[50,50,80,104,'#b8473a'],[150,70,64,84,'#3f7fb0'],[234,46,90,62,'#e0b45a']]){g.fillStyle='#1a1a1e';g.fillRect(x-4,y-4,w+8,h+8);g.fillStyle=c;g.fillRect(x,y,w,h);g.fillStyle='#ffffff30';g.fillRect(x+8,y+8,w-16,10);}
      g.fillStyle='#5b2f2f';g.fillRect(20,190,150,62);g.fillStyle='#6e3a38';g.fillRect(28,178,134,26);g.fillStyle='#4a2526';g.fillRect(14,196,16,56);g.fillRect(160,196,16,56);
      g.fillStyle='#3d4a63';g.beginPath();g.ellipse(300,415,250,28,0,0,Math.PI*2);g.fill();g.strokeStyle='#5b6a88';g.lineWidth=3;g.beginPath();g.ellipse(300,415,232,22,0,0,Math.PI*2);g.stroke();
    }
    if(level===2){ // Rooftop terrace at sunset with string lights.
      sky(g,[[0,'#2b1d4a'],[.45,'#c4527a'],[.7,'#f39a5a']],400);g.fillStyle='#ffd68a';g.beginPath();g.arc(470,250,46,0,Math.PI*2);g.fill();
      skyline(g,rand,{base:330,minH:60,maxH:170,color:'#3a2140',windows:'#ffcf86',lit:.18});skyline(g,rand,{base:345,minH:30,maxH:90,color:'#2a1730'});
      g.fillStyle='#8a6a4a';g.fillRect(0,345,600,105);for(let x=0;x<600;x+=40){g.fillStyle='#7a5b3e';g.fillRect(x,345,2,105);}
      g.strokeStyle='#3b2a2a';g.lineWidth=3;g.beginPath();g.moveTo(0,318);g.lineTo(600,318);g.stroke();for(let x=10;x<600;x+=28){g.beginPath();g.moveTo(x,318);g.lineTo(x,345);g.stroke();}
      g.strokeStyle='#2a1a1a';g.lineWidth=1.5;g.beginPath();g.moveTo(0,60);g.quadraticCurveTo(150,110,300,62);g.quadraticCurveTo(450,110,600,60);g.stroke();
      for(let i=0;i<14;i++){const x=i*44+20,t=(x%300)/300,y=60+Math.sin(t*Math.PI)*36;g.fillStyle='#ffe2a0';g.beginPath();g.arc(x,y+6,4,0,Math.PI*2);g.fill();g.fillStyle='#ffe2a033';g.beginPath();g.arc(x,y+6,11,0,Math.PI*2);g.fill();}
      for(const x of [40,560]){g.fillStyle='#7a3a2a';g.fillRect(x-18,300,36,46);g.fillStyle='#3e7a46';g.beginPath();g.arc(x,292,26,0,Math.PI*2);g.fill();}
    }
    if(level===3){ // Park: trees, clouds, a flag that shows the wind.
      sky(g,[[0,'#6fb3e8'],[1,'#cbe6f5']],330);
      for(let i=0;i<5;i++){const x=rand()*600,y=30+rand()*90;g.fillStyle='#ffffffd0';for(let k=0;k<4;k++){g.beginPath();g.arc(x+k*22,y+(k%2)*6,18+rand()*8,0,Math.PI*2);g.fill();}}
      g.fillStyle='#5f8f5a';g.beginPath();g.moveTo(0,300);g.quadraticCurveTo(200,250,600,290);g.lineTo(600,330);g.lineTo(0,330);g.fill();
      for(const x of [70,170,450,540]){g.fillStyle='#5a3d28';g.fillRect(x-6,240,12,90);g.fillStyle='#2f6b36';g.beginPath();g.arc(x,230,44,0,Math.PI*2);g.fill();g.fillStyle='#3d8244';g.beginPath();g.arc(x-14,214,26,0,Math.PI*2);g.fill();}
      g.fillStyle='#4f9a4a';g.fillRect(0,330,600,120);for(let x=0;x<600;x+=60){g.fillStyle='#48904399';g.fillRect(x,330,30,120);}
      g.fillStyle='#c9c4b8';g.fillRect(286,120,4,210);
    }
    if(level===4){ // Night rooftop: stars, moon, antenna and a neon sign.
      sky(g,[[0,'#070a1a'],[1,'#1a2240']],360);for(let i=0;i<80;i++){g.fillStyle=`rgba(255,255,255,${.3+rand()*.7})`;g.fillRect(rand()*600,rand()*260,1.5,1.5);}
      g.fillStyle='#f4efd8';g.beginPath();g.arc(90,70,28,0,Math.PI*2);g.fill();g.fillStyle='#070a1a';g.beginPath();g.arc(102,64,24,0,Math.PI*2);g.fill();
      skyline(g,rand,{base:300,minH:40,maxH:150,color:'#0d1226',windows:'#7fb6ff',lit:.22});
      g.fillStyle='#262b38';g.fillRect(0,300,600,150);g.fillStyle='#1d2130';for(let x=0;x<600;x+=50)g.fillRect(x,300,2,150);
      g.fillStyle='#2e3445';g.fillRect(470,190,70,110);g.fillStyle='#3a4256';g.beginPath();g.ellipse(505,190,36,12,0,0,Math.PI*2);g.fill();
      g.strokeStyle='#5a6070';g.lineWidth=3;g.beginPath();g.moveTo(60,300);g.lineTo(60,150);g.moveTo(40,180);g.lineTo(80,180);g.moveTo(46,205);g.lineTo(74,205);g.stroke();
      g.fillStyle='#120f1e';g.fillRect(200,180,200,50);g.font='bold 30px system-ui';g.textAlign='center';g.fillStyle='#ff4fa3';g.shadowColor='#ff4fa3';g.shadowBlur=18;g.fillText('BIG BOY',300,216);g.shadowBlur=0;g.textAlign='start';
    }
    if(level===5){ // Stadium: crowd, floodlights and pitch stripes.
      sky(g,[[0,'#0b1022'],[1,'#202a48']],200);
      for(let row=0;row<6;row++){g.fillStyle=row%2?'#2a2f45':'#24283b';g.fillRect(0,110+row*22,600,22);for(let x=4;x<600;x+=9){g.fillStyle=['#d84b4b','#f1f1f1','#4b7bd8','#e8c14a','#3fae6a'][Math.floor(rand()*5)];g.beginPath();g.arc(x+rand()*3,118+row*22,3,0,Math.PI*2);g.fill();}}
      for(const x of [60,540]){g.fillStyle='#3a3f50';g.fillRect(x-4,20,8,90);g.fillStyle='#fff8d8';g.fillRect(x-26,10,52,18);g.fillStyle='#fff8d822';g.beginPath();g.moveTo(x-26,28);g.lineTo(x-140,250);g.lineTo(x+140,250);g.lineTo(x+26,28);g.fill();}
      for(let i=0;i<8;i++){g.fillStyle=i%2?'#3f9a4c':'#46a855';g.fillRect(0,242+i*26,600,26);}
      g.strokeStyle='#ffffffcc';g.lineWidth=3;g.strokeRect(150,262,300,150);g.beginPath();g.arc(300,262,50,0,Math.PI);g.stroke();
      g.strokeStyle='#f4f4f4';g.lineWidth=5;g.strokeRect(220,200,160,62);g.strokeStyle='#ffffff55';g.lineWidth=1;for(let x=224;x<380;x+=10){g.beginPath();g.moveTo(x,204);g.lineTo(x,262);g.stroke();}
    }
  }
  function dartsScene(g,level,rand){
    if(level===1){ // Cork wall of the club, pinned photos and a lamp.
      g.fillStyle='#8a6440';g.fillRect(0,0,600,450);for(let i=0;i<900;i++){g.fillStyle=rand()<.5?'#7a5636':'#9a7350';g.fillRect(rand()*600,rand()*450,2,2);}
      for(let i=0;i<7;i++){const x=rand()<.5?20+rand()*110:470+rand()*110,y=20+rand()*380;g.save();g.translate(x,y);g.rotate((rand()-.5)*.3);g.fillStyle='#f4f1ea';g.fillRect(-26,-20,52,44);g.fillStyle=['#5a7fb0','#b05a5a','#5ab07a','#b0995a'][i%4];g.fillRect(-21,-15,42,28);g.restore();g.fillStyle='#d23b3b';g.beginPath();g.arc(x,y-18,4,0,Math.PI*2);g.fill();}
    }
    if(level===2){ // Irish bar: wood panels and bottle shelves.
      g.fillStyle='#3b2416';g.fillRect(0,0,600,450);for(let x=0;x<600;x+=75){g.fillStyle='#4a2e1c';g.fillRect(x+4,0,67,450);g.strokeStyle='#2a1810';g.lineWidth=2;g.strokeRect(x+12,30,51,180);g.strokeRect(x+12,240,51,180);}
      for(const y of [70,150]){g.fillStyle='#6a4428';g.fillRect(0,y+40,110,8);g.fillRect(490,y+40,110,8);for(let i=0;i<5;i++)for(const x0 of [6,496]){const x=x0+i*21;g.fillStyle=['#2e6a3a','#7a3a1a','#c9a04a','#3a4a7a'][(i+y)%4];g.fillRect(x,y+8,12,32);g.fillRect(x+3,y,6,10);}}
      g.fillStyle='#ffd28a33';g.beginPath();g.arc(300,0,240,0,Math.PI);g.fill();
    }
    if(level===3){ // Neon pub: brick wall and glowing signs.
      g.fillStyle='#2a1618';g.fillRect(0,0,600,450);for(let y=0;y<450;y+=20)for(let x=(y/20)%2?-20:0;x<600;x+=40){g.fillStyle=rand()<.5?'#4a2422':'#3e1e1d';g.fillRect(x+1,y+1,38,18);}
      const neon=(t,x,y,c,s)=>{g.font=`bold ${s}px system-ui`;g.fillStyle=c;g.shadowColor=c;g.shadowBlur=20;g.fillText(t,x,y);g.shadowBlur=0;};
      neon('DARTS',30,80,'#4ff0ff',34);neon('OPEN',470,70,'#ff4f8b',30);neon('★',60,380,'#ffe14f',44);neon('180',470,390,'#8bff4f',40);
    }
    if(level===4){ // Garage: pegboard with tools and a hanging work light.
      g.fillStyle='#4a4f57';g.fillRect(0,0,600,450);for(let y=10;y<450;y+=18)for(let x=10;x<600;x+=18){g.fillStyle='#3a3e45';g.beginPath();g.arc(x,y,2,0,Math.PI*2);g.fill();}
      const tool=(x,y,w,h,c)=>{g.fillStyle=c;g.fillRect(x,y,w,h);};tool(40,60,10,90,'#c94a3a');tool(30,60,30,14,'#8a8f99');tool(90,70,60,10,'#e0c040');tool(510,60,14,100,'#3a6ac9');tool(540,80,40,40,'#8a8f99');tool(60,330,90,24,'#c97a3a');tool(470,340,100,16,'#8a8f99');
      g.fillStyle='#fff6d0';g.fillRect(270,0,60,14);g.fillStyle='#fff6d018';g.beginPath();g.moveTo(270,14);g.lineTo(140,450);g.lineTo(460,450);g.lineTo(330,14);g.fill();
    }
    if(level===5){ // The grand final: stage, spotlights and a crowd.
      g.fillStyle='#0a0a14';g.fillRect(0,0,600,450);
      for(const [x,c] of [[80,'#ff4f8b'],[300,'#4ff0ff'],[520,'#ffe14f']]){g.fillStyle=c+'22';g.beginPath();g.moveTo(x-10,0);g.lineTo(x-120,450);g.lineTo(x+120,450);g.lineTo(x+10,0);g.fill();}
      g.fillStyle='#1a1a26';g.fillRect(0,380,600,70);for(let x=10;x<600;x+=22){g.fillStyle='#05050a';g.beginPath();g.arc(x+rand()*6,400+rand()*8,12,0,Math.PI*2);g.fill();g.fillRect(x-10+rand()*6,404,20,46);}
      g.font='bold 20px system-ui';g.fillStyle='#ffffffaa';g.textAlign='center';g.fillText('GRAN FINAL DEL CLUB',300,40);g.textAlign='start';
    }
  }
  function skateLayers(level,rand){
    // Two looping strips scrolled at different speeds give the street depth.
    const far=layer(1200,400),near=layer(1200,400),f=far.getContext('2d'),n=near.getContext('2d');
    const themes=[
      {sky:[[0,'#7fc2f0'],[1,'#d8eefa']],far:'#9db4c8',farWin:null,near:'#a8573f',nearWin:'#f4e3b0',ground:'#6d6a66',kerb:'#b9b4ac'},
      {sky:[[0,'#3b414c'],[1,'#5b616c']],far:'#4a505a',farWin:null,near:'#6b7078',nearWin:'#f4f0c0',ground:'#55585e',kerb:'#e2c740'},
      {sky:[[0,'#5fa8d8'],[1,'#f2d9a8']],far:'#4a7fa8',farWin:null,near:'#c9563a',nearWin:null,ground:'#7a6b5a',kerb:'#d8d0c0'},
      {sky:[[0,'#070a1a'],[1,'#2a1a40']],far:'#141a33',farWin:'#7fb6ff',near:'#1e1530',nearWin:'#ff4fa3',ground:'#2a2a33',kerb:'#4ff0ff'},
      {sky:[[0,'#2b1d4a'],[.6,'#e2685a'],[1,'#f6b46a']],far:'#3a2140',farWin:'#ffcf86',near:'#5a3a4a',nearWin:'#ffcf86',ground:'#5a5050',kerb:'#e0b0a0'}
    ][level-1];
    const s=f.createLinearGradient(0,0,0,400);themes.sky.forEach(([o,c])=>s.addColorStop(o,c));f.fillStyle=s;f.fillRect(0,0,1200,400);
    if(level===4)for(let i=0;i<120;i++){f.fillStyle='#ffffffaa';f.fillRect(rand()*1200,rand()*200,1.5,1.5);}
    if(level===3){f.fillStyle='#3a74a8';f.fillRect(0,300,1200,100);for(let x=0;x<1200;x+=180){f.strokeStyle='#d8c040';f.lineWidth=6;f.beginPath();f.moveTo(x+40,300);f.lineTo(x+40,120);f.lineTo(x+150,120);f.moveTo(x+40,150);f.lineTo(x+120,120);f.stroke();}}
    else{let x=0;while(x<1200){const w=50+rand()*70,h=90+rand()*170;f.fillStyle=themes.far;f.fillRect(x,330-h,w,h+70);if(themes.farWin)for(let wy=340-h;wy<320;wy+=14)for(let wx=x+6;wx<x+w-8;wx+=12)if(rand()<.3){f.fillStyle=themes.farWin;f.fillRect(wx,wy,5,7);}x+=w+6;}}
    if(level===5){f.strokeStyle='#2a1530';f.lineWidth=6;f.beginPath();f.moveTo(0,250);for(let x=0;x<=1200;x+=300){f.lineTo(x+150,150);f.lineTo(x+300,250);}f.stroke();f.lineWidth=2;for(let x=0;x<1200;x+=24){const top=150+Math.abs(((x%300)-150))/150*100;f.beginPath();f.moveTo(x,top);f.lineTo(x,330);f.stroke();}}
    let x=0;while(x<1200){
      if(level===2){n.fillStyle='#7d828a';n.fillRect(x,120,40,270);n.fillStyle='#e2c740';n.fillRect(x,330,40,10);x+=220;continue;}
      if(level===3){if(x===0){n.fillStyle='#7a7468';n.fillRect(0,330,1200,60);n.fillStyle='#5a554c';n.fillRect(0,330,1200,5);}const c=['#c9563a','#3a7ac9','#3aa86a','#d8a03a'][Math.floor(rand()*4)];n.fillStyle=c;n.fillRect(x,270,110,60);n.fillRect(x+20,215,110,55);n.strokeStyle='#00000033';n.lineWidth=2;for(let k=x+6;k<x+110;k+=12){n.beginPath();n.moveTo(k,272);n.lineTo(k,328);n.stroke();}x+=200+rand()*80;continue;}
      const w=90+rand()*90,h=120+rand()*130;n.fillStyle=themes.near;n.fillRect(x,390-h,w,h);
      if(themes.nearWin)for(let wy=400-h;wy<360;wy+=26)for(let wx=x+10;wx<x+w-20;wx+=26)if(rand()<.55){n.fillStyle=themes.nearWin+(level===4?'':'cc');n.fillRect(wx,wy,14,16);}
      if(level===1){n.fillStyle='#2e3a4a';n.fillRect(x+w/2-12,350,24,40);}
      x+=w+30+rand()*60;
    }
    return {far,near,theme:themes};
  }
  function roomCanvas(level,world,rand){
    const c=layer(world.width,world.height),g=c.getContext('2d'),[,,trim]=world.palette;
    g.fillStyle='#202631';g.fillRect(0,0,world.width,world.height);g.fillStyle='#2c3444';g.fillRect(0,0,world.width,100);
    for(let x=20;x<world.width;x+=140){g.fillStyle='#ffffff10';g.fillRect(x,22,90,56);}
    // Each room has its own floor: parquet, tiles, carpet runner, concrete, marble.
    const floorY=100,fw=world.width,fh=world.height-100;
    if(level===1){g.fillStyle='#4a3422';g.fillRect(0,floorY,fw,fh);for(let y=floorY;y<world.height;y+=22)for(let x=(y/22)%2?-60:0;x<fw;x+=120){g.fillStyle=['#7a5636','#6e4d30','#835d3b'][Math.floor(rand()*3)];g.fillRect(x+1,y+1,118,20);}}
    if(level===2){for(let y=floorY;y<world.height;y+=40)for(let x=0;x<fw;x+=40){g.fillStyle=((x+y)/40)%2?'#d8d2c4':'#b8b0a0';g.fillRect(x,y,40,40);}}
    if(level===3){g.fillStyle='#5a4a3c';g.fillRect(0,floorY,fw,fh);g.fillStyle='#7a2f35';g.fillRect(60,floorY+20,fw-120,fh-40);g.strokeStyle='#d8b46a';g.lineWidth=4;g.strokeRect(74,floorY+34,fw-148,fh-68);}
    if(level===4){g.fillStyle='#6a6d70';g.fillRect(0,floorY,fw,fh);for(let i=0;i<14;i++){g.fillStyle='#2a2a2a55';g.beginPath();g.ellipse(rand()*fw,floorY+rand()*fh,20+rand()*30,10+rand()*14,rand()*3,0,Math.PI*2);g.fill();}g.strokeStyle='#58595c';g.lineWidth=2;for(let x=0;x<fw;x+=160){g.beginPath();g.moveTo(x,floorY);g.lineTo(x,world.height);g.stroke();}}
    if(level===5){for(let y=floorY;y<world.height;y+=80)for(let x=0;x<fw;x+=80){g.fillStyle=((x+y)/80)%2?'#e6e1d8':'#cfc8bb';g.fillRect(x,y,80,80);g.strokeStyle='#b8b0a0';g.lineWidth=1;g.beginPath();g.moveTo(x+rand()*80,y);g.lineTo(x+rand()*80,y+80);g.stroke();}g.fillStyle='#3e2e49';g.fillRect(fw/2-180,floorY+60,360,fh-120);g.strokeStyle='#c99b67';g.lineWidth=5;g.strokeRect(fw/2-166,floorY+74,332,fh-148);}
    g.strokeStyle=trim;g.lineWidth=6;g.strokeRect(3,floorY,fw-6,fh-3);
    world.furniture.forEach((o,i)=>furniture(g,o,i,rand));
    return c;
  }
  // Top-down furniture chosen by shape: sofas and tables, shelves, plants.
  function furniture(g,o,i,rand){
    const wide=o.w>o.h*1.35,tall=o.h>o.w*1.3,plant=!wide&&!tall&&i%3!==1;
    g.fillStyle='#0b0f1655';if(plant){g.beginPath();g.ellipse(o.x+o.w/2+4,o.y+o.h/2+6,Math.min(o.w,o.h)*.42,Math.min(o.w,o.h)*.36,0,0,Math.PI*2);g.fill();}else g.fillRect(o.x+5,o.y+8,o.w,o.h);
    if(wide&&i%2===0){ // Sofa: backrest, cushions, armrests.
      g.fillStyle='#5b3a4a';g.fillRect(o.x,o.y,o.w,o.h);g.fillStyle='#4a2e3c';g.fillRect(o.x,o.y,o.w,o.h*.32);g.fillRect(o.x,o.y,o.w*.12,o.h);g.fillRect(o.x+o.w*.88,o.y,o.w*.12,o.h);
      const n=Math.max(2,Math.round(o.w/60));for(let k=0;k<n;k++){g.fillStyle='#6e4a5c';g.fillRect(o.x+o.w*.13+k*(o.w*.74/n)+2,o.y+o.h*.36,o.w*.74/n-4,o.h*.56);}
    }else if(wide||(!tall&&i%3===1)){ // Table with grain and a couple of objects.
      g.fillStyle='#8a5f3a';g.fillRect(o.x,o.y,o.w,o.h);g.strokeStyle='#6e4a2c';g.lineWidth=1;for(let y=o.y+6;y<o.y+o.h;y+=7){g.beginPath();g.moveTo(o.x+3,y);g.lineTo(o.x+o.w-3,y+(rand()-.5)*3);g.stroke();}
      g.fillStyle='#e8e2d4';g.beginPath();g.arc(o.x+o.w*.3,o.y+o.h*.45,7,0,Math.PI*2);g.fill();g.fillStyle='#3a6ac9';g.fillRect(o.x+o.w*.55,o.y+o.h*.3,o.w*.22,o.h*.3);
    }else if(tall){ // Bookshelf seen from above with coloured spines.
      g.fillStyle='#5a3d28';g.fillRect(o.x,o.y,o.w,o.h);for(let y=o.y+6;y<o.y+o.h-6;y+=9){g.fillStyle=['#c94a3a','#3a6ac9','#e0c040','#3aa86a','#e8e2d4'][Math.floor(rand()*5)];g.fillRect(o.x+6,y,o.w-12,6);}
    }else{ // Plant in a pot.
      g.fillStyle='#7a3a2a';g.beginPath();g.arc(o.x+o.w/2,o.y+o.h/2,Math.min(o.w,o.h)*.32,0,Math.PI*2);g.fill();
      for(let k=0;k<9;k++){const a=k/9*Math.PI*2,rr=Math.min(o.w,o.h)*.42;g.fillStyle=k%2?'#3d8244':'#2f6b36';g.beginPath();g.ellipse(o.x+o.w/2+Math.cos(a)*rr*.5,o.y+o.h/2+Math.sin(a)*rr*.5,rr*.45,rr*.2,a,0,Math.PI*2);g.fill();}
    }
  }
  function draw(ctx,r){
    ctx.clearRect(0,0,600,450);
    const image=(img,x,y,w,h)=>{if(img.complete&&img.naturalWidth)ctx.drawImage(img,x,y,w,h);};
    const pet=(x,y,w,h,flip=false)=>{if(!(r.pet.complete&&r.pet.naturalWidth))return;ctx.save();if(flip){ctx.translate(x+w,y);ctx.scale(-1,1);x=0;y=0;}ctx.drawImage(r.pet,0,0,r.pet.naturalWidth/6,r.pet.naturalHeight/4,x,y,w,h);ctx.restore();};
    if(r.id==='football')drawFootball(ctx,r,image,pet);
    if(r.id==='skateboard'){
      const s=r.scene,t=r.trackX||0;
      for(const [img,speed] of [[s.far,.25],[s.near,.6]]){const off=(t*speed)%1200;ctx.drawImage(img,-off,0);ctx.drawImage(img,1200-off,0);}
      ctx.fillStyle=s.theme.ground;ctx.fillRect(0,387,600,63);ctx.fillStyle=s.theme.kerb;ctx.fillRect(0,385,600,5);
      ctx.fillStyle='#ffffff22';const track=t%100;for(let x=-100;x<650;x+=100)ctx.fillRect(x-track,415,46,3);
      drawSkater(ctx,r);
      for(const o of r.obstacles)drawObstacle(ctx,o);
    }
    if(r.id==='darts'){ctx.drawImage(r.scene.back,0,0);drawDarts(ctx,r,pet);}
    if(r.id==='robot-vacuum'){
      ctx.save();ctx.translate(-r.camera.x,-r.camera.y);ctx.drawImage(r.scene.floor,0,0);
      for(const c of r.crumbs)if(c.active){ctx.fillStyle='#e4bd6b';ctx.beginPath();ctx.arc(c.x,c.y,4.5,0,Math.PI*2);ctx.fill();ctx.fillStyle='#b8893f';ctx.fillRect(c.x-1,c.y-1,2,2);ctx.fillStyle='#e4bd6b';ctx.fillRect(c.x+7,c.y+3,3,3);ctx.fillStyle=`rgba(255,240,200,${.25+.25*Math.sin(r.time*4+c.x)})`;ctx.beginPath();ctx.arc(c.x,c.y,9,0,Math.PI*2);ctx.fill();}
      for(const hazard of r.hazards){ctx.save();ctx.globalAlpha=Math.min(1,hazard.age/.7);ctx.fillStyle='#a99c88';for(let i=0;i<7;i++){ctx.beginPath();ctx.arc(hazard.x+Math.cos(i+hazard.phase*2)*13,hazard.y+Math.sin(i+hazard.phase*2)*10,10,0,Math.PI*2);ctx.fill();}ctx.fillStyle='#fff';for(const dx of [-6,6]){ctx.beginPath();ctx.arc(hazard.x+dx,hazard.y-3,3.5,0,Math.PI*2);ctx.fill();}ctx.fillStyle='#222';for(const dx of [-6,6]){ctx.beginPath();ctx.arc(hazard.x+dx+1,hazard.y-3,1.6,0,Math.PI*2);ctx.fill();}ctx.restore();}
      ctx.save();ctx.globalAlpha=r.invulnerable>0&&r.time>.9?.55+.35*Math.abs(Math.sin(r.time*20)):1;
      ctx.fillStyle='#00000040';ctx.beginPath();ctx.ellipse(r.x,r.y+16,34,10,0,0,Math.PI*2);ctx.fill();image(r.art,r.x-40,r.y-27,80,54);
      if(Math.hypot(r.input.stick.x,r.input.stick.y)>.15||r.input.keys.size){ctx.fillStyle='#8ee2d4';ctx.beginPath();ctx.arc(r.x+Math.cos(r.heading)*44,r.y+Math.sin(r.heading)*32,4,0,Math.PI*2);ctx.fill();}
      ctx.restore();
      drawPops(ctx,r);ctx.restore();
      if(r.world.width>600){
        // A compact map shows offscreen crumbs while the camera follows the roomba.
        const scale=.105,mw=r.world.width*scale,mh=r.world.height*scale,mx=585-mw,my=14;
        ctx.save();ctx.fillStyle='#0d141ee8';ctx.fillRect(mx-5,my-5,mw+10,mh+10);ctx.strokeStyle='#ffffff40';ctx.lineWidth=1;ctx.strokeRect(mx,my,mw,mh);
        ctx.fillStyle='#987a5c';for(const o of r.furniture)ctx.fillRect(mx+o.x*scale,my+o.y*scale,o.w*scale,o.h*scale);
        ctx.fillStyle='#e9c77e';for(const c of r.crumbs)if(c.active)ctx.fillRect(mx+c.x*scale-1,my+c.y*scale-1,2,2);
        ctx.strokeStyle='#cbd5e366';ctx.strokeRect(mx+r.camera.x*scale,my+r.camera.y*scale,600*scale,450*scale);ctx.fillStyle='#8ee2d4';ctx.beginPath();ctx.arc(mx+r.x*scale,my+r.y*scale,3,0,Math.PI*2);ctx.fill();ctx.restore();
      }
      return;
    }
    drawPops(ctx,r);
  }
  function drawPops(ctx,r){ctx.save();ctx.font='bold 20px system-ui';ctx.textAlign='center';for(const p of r.pops){ctx.globalAlpha=1-p.age/.9;ctx.fillStyle='#0008';ctx.fillText(p.text,p.x+1,p.y-p.age*36+1);ctx.fillStyle=p.good?'#ffffff':'#ffb0a0';ctx.fillText(p.text,p.x,p.y-p.age*36);}ctx.restore();}
  function drawFootball(ctx,r,image,pet){
    ctx.drawImage(r.scene.back,0,0);
    const b=r.ball,ground=400;
    // Landing shadow: shows where the ball will come down.
    const height=Math.max(0,ground-b.y),shade=Math.max(.12,.45-height/900);ctx.fillStyle=`rgba(0,0,0,${shade})`;ctx.beginPath();ctx.ellipse(b.x,ground+2,Math.max(10,30-height/22),6,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#00000040';ctx.beginPath();ctx.ellipse(r.px,ground+4,48,8,0,0,Math.PI*2);ctx.fill();
    const lift=r.kickT>0?Math.sin(r.kickT/.18*Math.PI)*10:0;
    pet(r.px-70,262-lift,140,140,r.facing<0);
    // Reach ring above El Chota: white and solid when a kick would land.
    ctx.save();ctx.strokeStyle=r.inReach?'#ffffff':'#ffffff55';ctx.lineWidth=r.inReach?4:2;ctx.setLineDash(r.inReach?[]:[6,6]);ctx.beginPath();ctx.ellipse(r.px,292,64-(r.level-1)*3,78,0,0,Math.PI*2);ctx.stroke();ctx.restore();
    image(r.art,b.x-30,b.y-30,60,60);
    // Wind flag in the corner.
    const w=r.wind||0;ctx.save();ctx.translate(560,40);ctx.fillStyle='#d8d4c8';ctx.fillRect(-2,-10,3,46);ctx.fillStyle=Math.abs(w)>60?'#e05050':'#f0f0f0';ctx.beginPath();ctx.moveTo(0,-10);ctx.lineTo(Math.sign(w||1)*(14+Math.abs(w)*.25),-4+Math.sin(r.time*9)*2);ctx.lineTo(0,4);ctx.fill();ctx.restore();
    ctx.font='15px system-ui';ctx.fillStyle='#ffffffdd';ctx.fillText(`Caídas: ${r.misses}`,18,30);
  }
  function drawObstacle(ctx,o){
    const y=387-o.h;ctx.fillStyle='#00000040';ctx.fillRect(o.x+4,385,o.w,5);
    if(o.kind==='caja'){ctx.fillStyle='#bb8648';ctx.fillRect(o.x,y,o.w,o.h);ctx.strokeStyle='#6c4828';ctx.lineWidth=4;ctx.strokeRect(o.x+3,y+3,o.w-6,o.h-6);ctx.beginPath();ctx.moveTo(o.x+5,y+5);ctx.lineTo(o.x+o.w-5,y+o.h-5);ctx.stroke();}
    if(o.kind==='cono'){ctx.fillStyle='#f06a28';ctx.beginPath();ctx.moveTo(o.x+o.w/2,y);ctx.lineTo(o.x+o.w,387);ctx.lineTo(o.x,387);ctx.fill();ctx.fillStyle='#f4f4f4';ctx.fillRect(o.x+o.w*.28,y+o.h*.45,o.w*.44,6);ctx.fillStyle='#2a2a2a';ctx.fillRect(o.x-4,383,o.w+8,5);}
    if(o.kind==='banco'){ctx.fillStyle='#7a5636';ctx.fillRect(o.x,y,o.w,8);ctx.fillRect(o.x,y+12,o.w,6);ctx.fillStyle='#3a3a3e';ctx.fillRect(o.x+6,y,6,o.h);ctx.fillRect(o.x+o.w-12,y,6,o.h);}
    if(o.kind==='barrera'){ctx.fillStyle='#2a2a2e';ctx.fillRect(o.x,y+8,o.w,o.h-8);for(let k=0;k<4;k++){ctx.fillStyle=k%2?'#f4f4f4':'#e03a3a';ctx.fillRect(o.x,y+8+k*(o.h-8)/4,o.w,(o.h-8)/4);}ctx.fillStyle='#ffb02a';ctx.beginPath();ctx.arc(o.x+o.w/2,y+4,5,0,Math.PI*2);ctx.fill();}
  }
  // A throw scores where the reticle is at that instant: 3 bull, 2 inner ring, 1 outer ring.
  function throwDart(r){
    if(r.time-r.lastThrow<.4)return;r.lastThrow=r.time;
    const b=r.board,distance=Math.hypot(r.aim.x-b.x,r.aim.y-b.y);
    const points=distance<b.r*.2?3:distance<b.r*.6?2:distance<b.r?1:0;
    r.score+=points;if(!points)r.misses++;
    r.darts.push({dx:r.aim.x-b.x,dy:r.aim.y-b.y,hit:points>0,x:r.aim.x,y:r.aim.y});if(r.darts.length>12)r.darts.shift();
    pop(r,r.aim.x,r.aim.y-26,points?`+${points}`:'Fuera',points>0);
  }
  function drawDarts(ctx,r,pet){
    const b=r.board;
    pet(18,300,140,140);
    ctx.save();ctx.fillStyle='#0008';ctx.beginPath();ctx.arc(b.x+6,b.y+8,b.r+10,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#2b2119';ctx.beginPath();ctx.arc(b.x,b.y,b.r+8,0,Math.PI*2);ctx.fill();
    for(let i=0;i<20;i++){ctx.fillStyle=i%2?'#14110f':'#e8d9b0';ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.arc(b.x,b.y,b.r,i*Math.PI/10-Math.PI/2-Math.PI/20,(i+1)*Math.PI/10-Math.PI/2-Math.PI/20);ctx.closePath();ctx.fill();}
    for(const [radius,width] of [[b.r*.97,b.r*.08],[b.r*.6,b.r*.07]])for(let i=0;i<20;i++){ctx.strokeStyle=i%2?'#2f8a4a':'#c7372f';ctx.lineWidth=width;ctx.beginPath();ctx.arc(b.x,b.y,radius,i*Math.PI/10-Math.PI/2-Math.PI/20,(i+1)*Math.PI/10-Math.PI/2-Math.PI/20);ctx.stroke();}
    ctx.fillStyle='#2f8a4a';ctx.beginPath();ctx.arc(b.x,b.y,b.r*.2,0,Math.PI*2);ctx.fill();ctx.fillStyle='#c7372f';ctx.beginPath();ctx.arc(b.x,b.y,b.r*.1,0,Math.PI*2);ctx.fill();
    for(const d of r.darts){const x=d.hit?b.x+d.dx:d.x,y=d.hit?b.y+d.dy:d.y;ctx.strokeStyle='#d8d1c2';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+14,y-14);ctx.stroke();ctx.fillStyle='#e8e8ec';ctx.fillRect(x+12,y-19,7,7);}
    const steady=r.input.aim&&r.breath>0;
    ctx.strokeStyle=steady?'#ffffff':'#ffffffd9';ctx.lineWidth=steady?3.5:2.5;ctx.beginPath();ctx.arc(r.aim.x,r.aim.y,13,0,Math.PI*2);ctx.moveTo(r.aim.x-22,r.aim.y);ctx.lineTo(r.aim.x-6,r.aim.y);ctx.moveTo(r.aim.x+6,r.aim.y);ctx.lineTo(r.aim.x+22,r.aim.y);ctx.moveTo(r.aim.x,r.aim.y-22);ctx.lineTo(r.aim.x,r.aim.y-6);ctx.moveTo(r.aim.x,r.aim.y+6);ctx.lineTo(r.aim.x,r.aim.y+22);ctx.stroke();
    // Breath meter: how long the aim can stay steady.
    ctx.fillStyle='#0009';ctx.fillRect(420,418,160,14);ctx.fillStyle=r.breath<.3?'#ff8a7a':'#8ee2d4';ctx.fillRect(422,420,156*(r.breath/1.6),10);ctx.font='12px system-ui';ctx.fillStyle='#ffffffcc';ctx.fillText('Aire',386,429);
    ctx.font='15px system-ui';ctx.fillStyle='#fff2d9';ctx.fillText(`Fallos: ${r.misses}`,18,30);
    ctx.restore();
  }
  function drawSkater(ctx,r){
    const airborne=r.jump>0;
    const approach=r.obstacles.some(o=>o.x>205&&o.x<310);
    const landing=r.skateLanding>0?Math.sin(r.skateLanding/.25*Math.PI):0;
    const pop=airborne?Math.max(0,1-r.skateAir/.16):0;
    const tuck=airborne?Math.sin(Math.min(1,r.skateAir/.8)*Math.PI)*.38:0;
    const crouch=Math.min(1,(approach&&!airborne?.32:0)+landing*.85+pop*.8+tuck);
    const ride=airborne?0:Math.sin(r.time*13)*.8;
    // One local coordinate system keeps the shoes, deck and body together.
    const tilt=airborne?Math.max(-.2,Math.min(.16,-r.vy*.0004)):Math.sin(r.time*8)*.009;
    ctx.save();ctx.fillStyle=`rgba(0,0,0,${.27-r.jump*.0012})`;ctx.beginPath();ctx.ellipse(153,390,57-r.jump*.13,6-r.jump*.018,0,0,Math.PI*2);ctx.fill();ctx.restore();
    ctx.save();ctx.translate(153,375-r.jump+ride);ctx.rotate(tilt);
    // A side-on pixel deck gives both shoes a visible, level contact surface.
    for(const x of [-36,36]){
      ctx.fillStyle='#16151a';ctx.fillRect(x-4,1,8,5);ctx.fillStyle='#8e2020';ctx.beginPath();ctx.arc(x,5,7,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#f16945';ctx.lineWidth=2;ctx.stroke();
      ctx.save();ctx.translate(x,5);ctx.rotate(r.time*22);ctx.strokeStyle='#f5bd92';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-3,0);ctx.lineTo(3,0);ctx.moveTo(0,-3);ctx.lineTo(0,3);ctx.stroke();ctx.restore();
    }
    ctx.fillStyle='#a86d34';ctx.beginPath();ctx.moveTo(-60,-12);ctx.lineTo(-48,-7);ctx.lineTo(48,-7);ctx.lineTo(60,-12);ctx.lineTo(57,-7);ctx.lineTo(46,-2);ctx.lineTo(-46,-2);ctx.lineTo(-57,-7);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#29282d';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-58,-12);ctx.lineTo(-46,-8);ctx.lineTo(46,-8);ctx.lineTo(58,-12);ctx.stroke();
    const hipY=-51+crouch*15,lean=airborne?-5:Math.sin(r.time*3)*2;
    if(r.pet.modular&&r.pet.complete&&r.pet.naturalWidth){
      // A complete dressed cell is the unit of animation: torso, knees and feet
      // never come from different poses or from the old baked blue jeans.
      const fw=r.pet.naturalWidth/6,fh=r.pet.naturalHeight/4,index=airborne?14:crouch>.5?13:12;
      ctx.save();ctx.translate(lean,-9);ctx.rotate(airborne?-.07:Math.sin(r.time*4)*.015);
      ctx.drawImage(r.pet,index%6*fw,Math.floor(index/6)*fh,fw,fh,-82,-153,164,164);ctx.restore();
    }else{
    // Articulated jeans bend at the knee; the original Jordan pixels stay on deck.
    const leg=(hipX,kneeX,footX,colour)=>{
      ctx.lineJoin='bevel';ctx.lineCap='butt';ctx.strokeStyle='#182336';ctx.lineWidth=22;ctx.beginPath();ctx.moveTo(hipX+lean,hipY-5);ctx.lineTo(kneeX,hipY+18-crouch*5);ctx.lineTo(footX,-15);ctx.stroke();
      ctx.strokeStyle=colour;ctx.lineWidth=16;ctx.stroke();ctx.strokeStyle='#6390bb';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(hipX+lean-3,hipY);ctx.lineTo(kneeX-4,hipY+17-crouch*5);ctx.stroke();
    };
    leg(6,29+crouch*10,25,'#315b89');leg(-13,-27-crouch*12,-25,'#3f6d9e');
    if(r.pet.complete&&r.pet.naturalWidth){
      const fw=r.pet.naturalWidth/6,fh=r.pet.naturalHeight/4;
      const cut=(col,x,y,w,h,dx,dy,dw,dh)=>ctx.drawImage(r.pet,col*fw+x/256*fw,2*fh+y/256*fh,w/256*fw,h/256*fh,dx,dy,dw,dh);
      // Anticipation, balance in the air, and landing use distinct original poses.
      // Never crossfade pixel faces: one solid sprite stays sharp in every frame.
      ctx.save();ctx.translate(lean,hipY);ctx.rotate(airborne?-.07:Math.sin(r.time*4)*.015);
      if(crouch>.5)cut(1,26,44,200,158,-66,-88,112,88);
      else if(airborne)cut(2,26,18,200,170,-66,-95,112,95);
      else cut(0,26,24,200,162,-66,-91,112,91);
      ctx.restore();
      // Shoe samples from the idle sprite retain the mascot's exact footwear.
      ctx.drawImage(r.pet,82/256*fw,212/256*fh,54/256*fw,30/256*fh,-43,-23,34,18);
      ctx.drawImage(r.pet,139/256*fw,212/256*fh,61/256*fw,30/256*fh,10,-23,38,18);
    }
    }
    ctx.restore();
    if(landing>.3){ctx.save();ctx.globalAlpha=landing*.35;ctx.strokeStyle='#dfb67d';ctx.lineWidth=2;for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(153+side*49,384);ctx.lineTo(153+side*(61+(1-landing)*17),380);ctx.stroke();}ctx.restore();}
  }
  async function finish(r){
    if(round!==r)return;
    if(r.actor!==user()){close();return;}
    const score=r.score,token=r.token,actor=r.actor,game=r.id;stop();
    const best=save(game,score);
    const won=r.endReason==='goal';
    const outcome=won?`Nivel ${r.level} superado`:r.endReason==='dust'?'Sin vidas':r.endReason==='collision'?'Te has chocado':r.endReason==='time'?'Objetivo pendiente':'Partida terminada';
    body().innerHTML=`<section class="chota-arcade-result"><p>${outcome}</p><h2>${score}<small>de ${r.rules.goal} ${games[game].unit}</small></h2><p class="chota-arcade-result-level">Nivel ${r.level} · ${r.rules.name}</p><p>Tu mejor marca: <strong>${best}</strong></p><p data-reward>Guardando partida…</p><button type="button" class="chota-arcade-secondary" data-retry-save hidden>Reintentar guardado</button><div class="chota-arcade-results-actions">${won&&r.level<maxLevel?'<button type="button" data-next disabled>Guardando nivel…</button>':''}<button type="button" data-again>${won?'Repetir nivel':'Reintentar nivel'}</button><button type="button" class="chota-arcade-secondary" data-levels>Ver niveles</button></div>${won&&r.level===maxLevel?'<p>Has completado los cinco niveles.</p>':''}<div class="chota-duel-challenge" data-duel-challenge></div><div class="chota-arcade-ranking" data-ranking></div></section>`;
    body().querySelector('[data-again]').addEventListener('click',()=>start(game,r.level));body().querySelector('[data-levels]').addEventListener('click',()=>levels(game));body().querySelector('[data-next]')?.addEventListener('click',()=>start(game,r.level+1));
    const reward=body().querySelector('[data-reward]');
    const unlockNext=data=>{if(data?.level_completed){cacheProgress({...levelProgress,[game]:Math.max(Number(levelProgress[game])||0,Number(data.highest_completed)||r.level)});}const next=body()?.querySelector('[data-next]');if(next&&serial===token&&reward.isConnected&&unlocked(game)>r.level){next.disabled=false;next.textContent='Siguiente nivel';}};
    if(!config.submitScore&&!config.rpc){if(won)unlockNext({level_completed:true,highest_completed:r.level});reward.textContent='Partida guardada en este dispositivo.';return;}
    const ranking=body().querySelector('[data-ranking]');ranking.textContent='Cargando marcas del club…';
    const retry=body().querySelector('[data-retry-save]');
    let saving=false, confirmed=false;
    async function persist(){
    if(saving||user()!==actor)return;
    saving=true;retry.hidden=true;
    try{
      const sessionId=await r.serverSession;
      if(user()!==actor)return;
      if(!sessionId)throw new Error('No server session');
      const result=config.rpc?await rpc('submit_chota_level_score',{game_session_id:sessionId,submitted_score:score,completed_round:r.completed,level_won:won}):await config.submitScore(game,score,sessionId,r.completed);
      if(user()===actor){unlockNext(result);if(result?.reward_status==='awarded')void globalThis.DailyPacks?.refresh(true);globalThis.ClubCoinMissions?.activity({coins:result?.awarded_coins});}
      confirmed=true;
      if(score>0&&serial===token&&user()===actor)void challenge(body()?.querySelector('[data-duel-challenge]'),sessionId);
      if(result?.reward_status==='awarded'){if(reward.isConnected)reward.textContent='¡1 sobre ganado! Ya está en tus sobres.';}
      else if(result?.reward_status==='already_claimed'){if(reward.isConnected)reward.textContent='Ya tienes el sobre de este juego de hoy. Vuelve mañana por otro.';}
      else if(reward.isConnected)reward.textContent=r.completed?'Partida guardada. El sobre diario requiere al menos 12 segundos de juego.':'Partida guardada. Termina un nivel para conseguir el sobre diario.';
      if(serial!==token||user()!==actor||!ranking.isConnected)return;
      if(!config.leaderboard){ranking.textContent='';return;}
      const rows=await config.leaderboard(game);
      if(serial!==token||user()!==actor||!ranking.isConnected)return;
      const valid=(Array.isArray(rows)?rows:[]).filter(row=>Number.isFinite(Number(row.score))).slice(0,5);
      ranking.innerHTML=`<h3>Marcas del club</h3>${valid.length?`<ol>${valid.map(row=>`<li><span>${esc(row.name||'Miembro')}</span><strong>${Math.max(0,Math.floor(Number(row.score)))}</strong></li>`).join('')}</ol>`:'<p>Aún no hay marcas compartidas.</p>'}`;
    }catch{if(!confirmed&&reward.isConnected){reward.textContent='No se pudo confirmar el sobre. Reintenta guardar esta partida.';retry.hidden=false;}if(ranking.isConnected)ranking.textContent='Tu marca está guardada en este dispositivo. El ranking no está disponible ahora.';}
    finally{saving=false;}
    }
    retry.addEventListener('click',persist);
    await persist();
  }
  async function openGame(id){if(!games[id])return;const actor=user();await open();if(!dialog||actor!==user())return;const token=serial,inventory=await owned();if(!dialog||token!==serial||actor!==user())return;if(inventory.has(id))levels(id);else briefing(id,true);}
  function initialize(options={}){config=options;}
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&round){round.endReason='abandoned';finish(round);}});
  let appearanceLoad=0;
  globalThis.addEventListener('chota-appearance-change',()=>{
    const active=round;if(!active)return;const version=++appearanceLoad,image=new Image();image.src=globalThis.ChotaAppearance?.sheet?.('base')||'icons/mascot/chota-v2/chota-poses.webp';image.modular=globalThis.ChotaAppearance?.enabled?.()===true;
    void image.decode().then(()=>{if(round===active&&version===appearanceLoad)active.pet=image;}).catch(()=>{});
  });
  // Local development only: lets play-tests read the round state.
  if(location.hostname==='localhost')globalThis.__chotaRound=()=>round;
  globalThis.ChotaGames=Object.freeze({initialize,mount,open,openGame,mountWeeklyChallenge:weeklyChallenge,reset:()=>close({immediate:true})});
})();
