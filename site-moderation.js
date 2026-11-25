/* Filtro de lo que se publica en la web: palabrotas e insultos, estafas típicas y enlaces.
   Las listas y las reglas son las mismas que site_blocked_words(), site_text_ok(),
   site_invite_ok() y site_map_ok() en la base de datos; scripts/site-content-db.test.mjs
   comprueba que coinciden. Si cambias una lista aquí, cámbiala también en la migración. */
(root => {
  'use strict';
  // Whole words, matched after lowering, removing accents (ñ stays) and undoing 0→o, 1→i, 3→e,
  // 4→a, 5→s, 7→t, @→a, $→s, !→i. Each letter may be repeated (puuuta) and a plural s added;
  // a space stands for any gap (v-bucks, vbucks). Doubled letters must stay doubled (polla, not Pola).
  const SWEAR = [
    'puta', 'puto', 'putada', 'puton', 'putero', 'putera', 'putear', 'puteo', 'hijoputa', 'hijaputa', 'hdp',
    'mierda', 'mierdon', 'comemierda', 'joder', 'jodido', 'jodida', 'jodete', 'jodeos', 'jodiendo',
    'coño', 'coñazo', 'cabron', 'cabrona', 'cabrones', 'cabronazo', 'gilipollas', 'gilipolla', 'gilipolas',
    'polla', 'pollon', 'pollazo', 'soplapollas', 'comepollas', 'chupapollas', 'tontopolla',
    'follar', 'folla', 'follando', 'follada', 'follamos', 'cojones', 'cojon', 'capullo', 'zorra',
    'maricon', 'maricones', 'maricona', 'mariconazo', 'marica', 'bujarra', 'bujarron', 'tortillera', 'travelo',
    'negrata', 'sudaca', 'subnormal', 'subnormales', 'mongolo', 'mongola', 'retrasado mental', 'imbecil', 'imbeciles',
    'pendejo', 'pendeja', 'verga', 'chingar', 'chingada', 'chingado', 'chinga', 'malparido', 'malparida', 'culero',
    'mamon', 'mamona', 'mamones', 'porno',
    'fuck', 'fucking', 'fucker', 'motherfucker', 'shit', 'bullshit', 'bitch', 'cunt', 'asshole',
    'nigger', 'nigga', 'faggot', 'whore', 'slut',
  ];
  // The usual bait: free Nitro, skins and currency, easy money, crypto.
  const SCAM = [
    'nitro gratis', 'free nitro', 'discord nitro', 'skins gratis', 'free skins', 'pavos gratis', 'v bucks gratis', 'free v bucks',
    'robux gratis', 'free robux', 'regalo steam', 'steam gift', 'gift card', 'tarjeta regalo', 'gana dinero', 'dinero facil',
    'bitcoin', 'cripto', 'crypto', 'airdrop', 'onlyfans',
  ];

  const LEET_FROM = '013457@$!', LEET_TO = 'oieastasi';
  const normal = text => String(text || '').toLowerCase().replace(/ñ/g, '\u0001').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\u0001/g, 'ñ').replace(/[013457@$!]/g, c => LEET_TO[LEET_FROM.indexOf(c)]);
  const words = list => new RegExp(`(^|[^a-zñ])(${list.map(w => w.replace(/[a-zñ]/g, '$&+').replace(/ /g, '[^a-zñ]*')).join('|')})s*(?=$|[^a-zñ])`);
  const swear = words(SWEAR), scam = words(SCAM);
  // Links in free text: an address, www., or a domain. Domains that are also Spanish words
  // (es, me, de…) only count when a path follows, so «bien.es caro» is fine and «t.me/x» is not.
  const LINK = /(https?:|www\.|[a-z0-9-]+\.(com|net|org|io|gg|ly|xyz|ru|info|biz|link|app|site|online|top|click|shop|store|co|tk|ml|ga|cf|cn|cc|gl|pw|win|vip|live|fun|icu|cam|bet|casino|zip|mov|ws|su|sh|lol|gift|gifts)($|[^a-z0-9])|[a-z0-9-]+\.(es|me|de|to|it|be|us|eu|fr|pt|uk|tv)\/)/;
  // Group invites only (not wa.me: that opens a chat with someone's number).
  const INVITE = /^https:\/\/(chat\.whatsapp\.com|t\.me|telegram\.me|discord\.gg|discord\.com\/invite)\/[A-Za-z0-9_+=-]+\/?$/;
  // Google or Apple Maps, nothing else.
  const MAP = /^https:\/\/(maps\.app\.goo\.gl\/|goo\.gl\/maps\/|(www\.)?google\.(com|es)\/maps([/?]|$)|maps\.google\.(com|es)([/?]|$)|maps\.apple\.com\/)[A-Za-z0-9._~:/?#@!$&'()*+,;=%-]*$/;

  // null when the texts are fine; otherwise why not.
  const problem = (...texts) => {
    for (const text of texts.flat()) {
      if (!text) continue;
      const n = normal(text);
      if (swear.test(n)) return 'palabrota';
      if (scam.test(n)) return 'estafa';
      if (LINK.test(String(text).toLowerCase())) return 'enlace';
    }
    return null;
  };
  const MESSAGES = {
    palabrota: 'Quita las palabrotas o insultos para poder publicar.',
    estafa: 'Eso parece spam o una estafa, así que no se puede publicar.',
    enlace: 'No se pueden poner enlaces en el texto.',
  };
  const api = {SWEAR, SCAM, BLOCKED: [...SWEAR, ...SCAM], problem, message: kind => MESSAGES[kind] || '',
    inviteOk: url => !url || (url.length <= 200 && INVITE.test(url)), mapOk: url => !url || (url.length <= 300 && MAP.test(url))};
  root.BBModeration = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window === 'object' ? window : globalThis);
