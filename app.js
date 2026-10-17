'use strict';

/* =========================================================================
   FrameMobile: mobile catalogue browser in the style of frameXTV.
   Data: TMDB (movies + series, needs a free API key) or TVmaze (series only,
   no key) as fallback. No streams: the detail page shows the trailer.
   ========================================================================= */

const PER_PAGE = 24; // items per page for TVmaze and "Meine Liste" (TMDB pages are 20)
const TMDB_MAX_PAGES = 500; // TMDB refuses page > 500
const view = document.getElementById('view');

/* ---------- storage (localStorage can throw in private mode) ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem('fm.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('fm.' + k, JSON.stringify(v)); } catch { /* ignore */ } },
};
const hasKey = () => !!store.get('tmdbKey', '').trim();

/* ---------- helpers ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const stripHtml = (s) => String(s ?? '').replace(/<[^>]*>/g, '').trim();
const year = (d) => (d ? String(d).slice(0, 4) : '');

async function getJSON(url, init) {
  const r = await fetch(url, init);
  if (r.status === 404) return null;
  if (!r.ok) {
    const e = new Error('HTTP ' + r.status);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

/* =========================================================================
   TMDB provider
   ========================================================================= */
const TMDB_IMG = 'https://image.tmdb.org/t/p/';
const TMDB_LISTS = {
  trending: { title: 'Trending', sub: 'Was diese Woche alle schauen', path: '/trending/all/week' },
  movies: { title: 'Beliebte Filme', sub: 'Publikumslieblinge und Blockbuster', path: '/movie/popular', type: 'movie' },
  tv: { title: 'Beliebte Serien', sub: 'Drama, Krimi und Serien zum Durchschauen', path: '/tv/popular', type: 'tv' },
  anime: { title: 'Anime', sub: 'Japanische Animationsserien', path: '/discover/tv', type: 'tv', params: { with_genres: 16, with_original_language: 'ja', sort_by: 'popularity.desc' } },
  upcoming: { title: 'Neu im Kino', sub: 'Aktuelle Kinostarts', path: '/movie/now_playing', type: 'movie' },
  top: { title: 'Top bewertet', sub: 'Die bestbewerteten Filme aller Zeiten', path: '/movie/top_rated', type: 'movie' },
};

async function tmdb(path, params = {}) {
  const key = store.get('tmdbKey', '').trim();
  const url = new URL('https://api.themoviedb.org/3' + path);
  url.searchParams.set('language', 'de-DE');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const init = {};
  // v4 read-access tokens are JWTs ("eyJ..."); v3 keys are 32 hex chars
  if (key.startsWith('eyJ')) init.headers = { Authorization: 'Bearer ' + key };
  else url.searchParams.set('api_key', key);
  try {
    return await getJSON(url, init);
  } catch (e) {
    if (e.status === 401) throw new Error('TMDB-Schlüssel ungültig. Bitte in den Einstellungen prüfen.');
    throw e;
  }
}

function tmdbItem(r, forcedType) {
  const type = r.media_type || forcedType;
  if (type !== 'movie' && type !== 'tv') return null; // drops "person" results
  return {
    src: 'tmdb',
    id: r.id,
    type,
    title: r.title || r.name || 'Ohne Titel',
    year: year(r.release_date || r.first_air_date),
    rating: r.vote_count ? r.vote_average : null,
    poster: r.poster_path ? TMDB_IMG + 'w342' + r.poster_path : '',
    backdrop: r.backdrop_path ? TMDB_IMG + 'w1280' + r.backdrop_path : '',
    overview: r.overview || '',
  };
}

const TMDBProvider = {
  async list(kind, page) {
    const def = TMDB_LISTS[kind];
    const d = await tmdb(def.path, { ...(def.params || {}), page });
    return {
      items: (d.results || []).map((r) => tmdbItem(r, def.type)).filter(Boolean),
      totalPages: Math.min(d.total_pages || 1, TMDB_MAX_PAGES),
      totalResults: d.total_results,
    };
  },
  async search(q, page) {
    const d = await tmdb('/search/multi', { query: q, page, include_adult: 'false' });
    return {
      items: (d.results || []).map((r) => tmdbItem(r)).filter(Boolean),
      totalPages: Math.min(d.total_pages || 1, TMDB_MAX_PAGES),
      totalResults: d.total_results,
    };
  },
  async detail(type, id) {
    const d = await tmdb(`/${type}/${id}`, {
      append_to_response: 'videos,credits',
      include_video_language: 'de,en,null',
    });
    if (!d) return null;
    const vids = (d.videos?.results || []).filter((v) => v.site === 'YouTube');
    const trailer = vids.find((v) => v.type === 'Trailer' && v.iso_639_1 === 'de')
      || vids.find((v) => v.type === 'Trailer') || vids.find((v) => v.type === 'Teaser') || vids[0];
    return {
      ...tmdbItem(d, type),
      genres: (d.genres || []).map((g) => g.name),
      runtime: d.runtime || d.episode_run_time?.[0] || null,
      seasons: d.number_of_seasons || null,
      tagline: d.tagline || '',
      cast: (d.credits?.cast || []).slice(0, 8).map((c) => c.name),
      trailerKey: trailer ? trailer.key : null,
    };
  },
};

/* =========================================================================
   TVmaze provider (no key, series only)
   ========================================================================= */
const MAZE = 'https://api.tvmaze.com';
const MAZE_PAGE = 250; // TVmaze /shows returns up to 250 shows per page
const mazeCache = new Map();

function mazeItem(s) {
  return {
    src: 'maze',
    id: s.id,
    type: 'tv',
    title: s.name,
    year: year(s.premiered),
    rating: s.rating?.average ?? null,
    poster: s.image?.medium || '',
    backdrop: s.image?.original || '',
    overview: stripHtml(s.summary),
  };
}

function mazeShowsPage(n) {
  if (!mazeCache.has(n)) mazeCache.set(n, getJSON(`${MAZE}/shows?page=${n}`).then((d) => d || []));
  return mazeCache.get(n);
}

// TVmaze has no total count. HEAD requests are cheap (no body), so binary-search
// the last existing /shows page with them, then GET only that page for its length.
async function mazeTotal() {
  const cached = store.get('mazeLast', null);
  if (cached && Date.now() - cached.at < 7 * 864e5) return cached.n.total;
  const exists = async (n) => (await fetch(`${MAZE}/shows?page=${n}`, { method: 'HEAD' })).ok;
  let lo = 0, hi = 256;
  while (await exists(hi)) { lo = hi; hi *= 2; }
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (await exists(mid)) lo = mid; else hi = mid;
  }
  const n = { last: lo, total: lo * MAZE_PAGE + (await mazeShowsPage(lo)).length };
  store.set('mazeLast', { at: Date.now(), n });
  return n.total;
}

const MazeProvider = {
  async list(_kind, page) {
    const total = await mazeTotal();
    const start = (page - 1) * PER_PAGE;
    const first = Math.floor(start / MAZE_PAGE);
    const last = Math.floor((start + PER_PAGE - 1) / MAZE_PAGE);
    const chunks = await Promise.all(
      Array.from({ length: last - first + 1 }, (_, i) => mazeShowsPage(first + i)));
    const offset = start - first * MAZE_PAGE;
    return {
      items: chunks.flat().slice(offset, offset + PER_PAGE).map(mazeItem),
      totalPages: Math.ceil(total / PER_PAGE),
      totalResults: total,
    };
  },
  async search(q) {
    const d = (await getJSON(`${MAZE}/search/shows?q=${encodeURIComponent(q)}`)) || [];
    return { items: d.map((r) => mazeItem(r.show)), totalPages: 1, totalResults: d.length };
  },
  async detail(_type, id) {
    const s = await getJSON(`${MAZE}/shows/${id}?embed[]=seasons&embed[]=cast`);
    if (!s) return null;
    return {
      ...mazeItem(s),
      genres: s.genres || [],
      runtime: s.averageRuntime || s.runtime || null,
      seasons: s._embedded?.seasons?.length || null,
      tagline: s.status === 'Running' ? 'Läuft noch' : s.status === 'Ended' ? 'Beendet' : '',
      cast: (s._embedded?.cast || []).slice(0, 8).map((c) => c.person.name),
      trailerKey: null,
    };
  },
};

const api = () => (hasKey() ? TMDBProvider : MazeProvider);

/* =========================================================================
   Watchlist ("Meine Liste")
   ========================================================================= */
const same = (a, b) => a.src === b.src && a.type === b.type && a.id === b.id;
const list = {
  all: () => store.get('list', []),
  has: (item) => list.all().some((x) => same(x, item)),
  toggle(item) {
    const cur = list.all();
    const i = cur.findIndex((x) => same(x, item));
    if (i >= 0) cur.splice(i, 1);
    else cur.unshift({ src: item.src, id: item.id, type: item.type, title: item.title, year: item.year, rating: item.rating, poster: item.poster });
    store.set('list', cur);
    return i < 0;
  },
};

/* =========================================================================
   Rendering pieces
   ========================================================================= */
// TVmaze and TMDB ids are different number spaces: the link carries the source,
// otherwise a TVmaze id would open an unrelated TMDB title.
const titleHref = (it) => `#/title/${it.type}/${it.id}${it.src === 'maze' ? '?src=maze' : ''}`;

function card(it) {
  const rate = it.rating != null ? `<span class="badge rate">★ ${Number(it.rating).toFixed(1)}</span>` : '';
  const img = it.poster
    ? `<img src="${esc(it.poster)}" alt="" loading="lazy" decoding="async">`
    : `<div class="noimg">${esc(it.title)}</div>`;
  return `<a class="card" href="${titleHref(it)}">
    <div class="poster">${img}<span class="badge type">${it.type === 'movie' ? 'FILM' : 'SERIE'}</span>${rate}</div>
    <div class="t">${esc(it.title)}</div>
    <div class="meta">${esc(it.year || '—')} • ${it.type === 'movie' ? 'Film' : 'Serie'}</div>
  </a>`;
}

// Page numbers at the bottom: ‹ 1 … 4 5 6 … 500 ›
function pager(cur, total, hrefFor) {
  if (total <= 1) return '';
  // kept to at most 7 numbers so the row fits one line on a 360px phone
  const nums = new Set([1, total, cur - 1, cur, cur + 1]);
  if (cur <= 3) [2, 3, 4].forEach((n) => nums.add(n));
  if (cur >= total - 2) [total - 2, total - 1].forEach((n) => nums.add(n)); // fewer: end numbers are wide
  const sorted = [...nums].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  let html = `<a class="${cur === 1 ? 'off' : ''}" href="${hrefFor(Math.max(1, cur - 1))}" aria-label="Vorherige Seite">‹</a>`;
  let prev = 0;
  for (const n of sorted) {
    if (n - prev > 1) html += '<span>…</span>';
    html += `<a class="${n === cur ? 'cur' : ''}" href="${hrefFor(n)}"${n === cur ? ' aria-current="page"' : ''}>${n}</a>`;
    prev = n;
  }
  html += `<a class="${cur === total ? 'off' : ''}" href="${hrefFor(Math.min(total, cur + 1))}" aria-label="Nächste Seite">›</a>`;
  return `<nav class="pager" aria-label="Seiten">${html}</nav><div class="pager-info">Seite ${cur} von ${total.toLocaleString('de-DE')}</div>`;
}

const spinner = () => '<div class="spinner" role="status" aria-label="Lädt"></div>';
const errorBox = (e) => `<div class="error">Konnte nicht laden: ${esc(e.message || e)}<br><br><button class="btn" onclick="render()">Nochmal versuchen</button></div>`;
const keyNotice = () => `<div class="notice">Ohne TMDB-Schlüssel zeigt die App nur Serien (Daten von TVmaze).
  Für Filme, Anime und Trailer einen kostenlosen Schlüssel bei
  <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener">themoviedb.org</a> holen und unter
  <a href="#/settings">Einstellungen</a> eintragen.</div>`;

/* =========================================================================
   Views
   ========================================================================= */
async function homeView() {
  if (!hasKey()) {
    const { items } = await MazeProvider.list('tv', 1);
    const hero = items.find((i) => i.backdrop) || items[0];
    return keyNotice() + heroHtml(hero) + rowHtml('Serien', 'Der komplette TVmaze-Katalog', '#/tv', items);
  }
  const kinds = Object.keys(TMDB_LISTS);
  const results = await Promise.all(kinds.map((k) => TMDBProvider.list(k, 1)));
  const hero = results[0].items.find((i) => i.backdrop) || results[0].items[0];
  return heroHtml(hero) + kinds.map((k, i) =>
    rowHtml(TMDB_LISTS[k].title, TMDB_LISTS[k].sub, '#/' + k, results[i].items)).join('');
}

function heroHtml(it) {
  if (!it) return '';
  return `<section class="hero" style="background-image:url('${esc(it.backdrop || it.poster)}')"><div>
    <div class="kicker">Highlight</div>
    <h1>${esc(it.title)}</h1>
    <div class="meta" style="margin-bottom:8px">${it.rating != null ? '★ ' + Number(it.rating).toFixed(1) + ' • ' : ''}${esc(it.year)} • ${it.type === 'movie' ? 'Film' : 'Serie'}</div>
    <p>${esc(it.overview)}</p>
    <div class="btns"><a class="btn primary" href="${titleHref(it)}">Details</a></div>
  </div></section>`;
}

function rowHtml(title, sub, href, items) {
  if (!items.length) return '';
  return `<section class="section">
    <div class="section-head"><div><h2>${esc(title)}</h2><p>${esc(sub)}</p></div><a href="${href}">Alle ›</a></div>
    <div class="row">${items.map(card).join('')}</div>
  </section>`;
}

async function listView(kind, page) {
  if (!hasKey() && kind !== 'tv') return keyNotice();
  const def = hasKey() ? TMDB_LISTS[kind] : { title: 'Serien', sub: 'Der komplette TVmaze-Katalog' };
  const p = hasKey() ? Math.min(page, TMDB_MAX_PAGES) : page;
  const { items, totalPages } = await api().list(kind, p);
  if (p > totalPages && totalPages > 0) { location.hash = `#/${kind}?page=${totalPages}`; return null; }
  return `<h1 class="page-title">${esc(def.title)}</h1><p class="page-sub">${esc(def.sub)}</p>
    ${items.length ? `<div class="grid">${items.map(card).join('')}</div>` : '<div class="empty">Keine Einträge auf dieser Seite.</div>'}
    ${pager(p, totalPages, (n) => `#/${kind}?page=${n}`)}`;
}

async function searchView(q, page) {
  q = q.trim();
  if (!q) return '<div class="empty">Tippe oben einen Titel ein.</div>';
  const { items, totalPages, totalResults } = await api().search(q, page);
  const note = hasKey() ? '' : '<p class="small">Ohne TMDB-Schlüssel findet die Suche nur Serien (max. 10 Treffer).</p>';
  return `<h1 class="page-title">Suche: „${esc(q)}“</h1>
    <p class="page-sub">${(totalResults ?? items.length).toLocaleString('de-DE')} Treffer</p>${note}
    ${items.length ? `<div class="grid">${items.map(card).join('')}</div>` : '<div class="empty">Nichts gefunden.</div>'}
    ${pager(page, totalPages, (n) => `#/search?q=${encodeURIComponent(q)}&page=${n}`)}`;
}

function myListView(page) {
  const all = list.all();
  if (!all.length) return '<h1 class="page-title">Meine Liste</h1><div class="empty">Noch nichts gemerkt. Tippe bei einem Titel auf „Merken“.</div>';
  const totalPages = Math.ceil(all.length / PER_PAGE);
  const p = Math.min(page, totalPages);
  return `<h1 class="page-title">Meine Liste</h1><p class="page-sub">${all.length} gemerkt</p>
    <div class="grid">${all.slice((p - 1) * PER_PAGE, p * PER_PAGE).map(card).join('')}</div>
    ${pager(p, totalPages, (n) => `#/list?page=${n}`)}`;
}

async function detailView(type, id, src) {
  if (src !== 'maze' && !hasKey()) return keyNotice();
  const d = await (src === 'maze' ? MazeProvider : TMDBProvider).detail(type, id);
  if (!d) return '<div class="empty">Titel nicht gefunden.</div>';
  const facts = [d.year, d.type === 'movie' ? 'Film' : 'Serie',
    d.runtime ? d.runtime + ' Min' : '', d.seasons ? d.seasons + ' Staffel' + (d.seasons > 1 ? 'n' : '') : '']
    .filter(Boolean).join(' • ');
  const saved = list.has(d);
  let html = `<div class="detail-top">
      <div class="poster">${d.poster ? `<img src="${esc(d.poster)}" alt="">` : `<div class="noimg">${esc(d.title)}</div>`}</div>
      <div>
        <h1>${esc(d.title)}</h1>
        <div class="meta">${d.rating != null ? '★ ' + Number(d.rating).toFixed(1) + ' • ' : ''}${esc(facts)}</div>
        ${d.tagline ? `<p class="small" style="margin:8px 0 0">${esc(d.tagline)}</p>` : ''}
        <div class="chips">${d.genres.map((g) => `<span class="chip">${esc(g)}</span>`).join('')}</div>
      </div>
    </div>
    <div class="btns" style="margin-bottom:16px">
      <button class="btn ${saved ? 'on' : ''}" id="saveBtn">${saved ? '✓ Gemerkt' : '+ Merken'}</button>
      ${d.trailerKey ? '<button class="btn primary" id="trailerBtn">▶ Trailer</button>' : ''}
    </div>
    ${d.overview ? `<p class="overview">${esc(d.overview)}</p>` : '<p class="overview small">Keine Beschreibung vorhanden.</p>'}`;

  if (d.trailerKey) {
    html += `<div class="box" id="trailer"><h3>Trailer</h3><div class="video">
      <iframe src="https://www.youtube-nocookie.com/embed/${esc(d.trailerKey)}" title="Trailer" allow="fullscreen; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe>
    </div></div>`;
  }
  if (d.cast.length) html += `<div class="box"><h3>Besetzung</h3><p class="small" style="margin:0;line-height:1.6">${d.cast.map(esc).join(', ')}</p></div>`;
  html += `<p class="small">Daten: ${d.src === 'tmdb' ? 'TMDB' : 'TVmaze'}</p>`;

  return { html, after: () => {
    document.getElementById('saveBtn').onclick = (e) => {
      const on = list.toggle(d);
      e.currentTarget.classList.toggle('on', on);
      e.currentTarget.textContent = on ? '✓ Gemerkt' : '+ Merken';
    };
    const tb = document.getElementById('trailerBtn');
    if (tb) tb.onclick = () => document.getElementById('trailer').scrollIntoView({ behavior: 'smooth' });
  } };
}

function settingsView() {
  return { html: `<h1 class="page-title">Einstellungen</h1><p class="page-sub">Wird nur auf diesem Gerät gespeichert</p>
    <div class="box">
      <div class="field">
        <label for="keyIn">TMDB API-Schlüssel (v3) oder Lese-Token (v4)</label>
        <input id="keyIn" type="text" autocomplete="off" spellcheck="false" value="${esc(store.get('tmdbKey', ''))}" placeholder="z. B. 1a2b3c…">
      </div>
      <div class="btns"><button class="btn primary" id="saveSettings">Speichern</button><span id="saveMsg" class="small" style="align-self:center"></span></div>
    </div>
    <p class="small">Den Schlüssel gibt es kostenlos unter themoviedb.org → Einstellungen → API. Ohne Schlüssel läuft die App mit TVmaze (nur Serien).</p>`,
  after: () => {
    document.getElementById('saveSettings').onclick = async () => {
      const key = document.getElementById('keyIn').value.trim();
      const msg = document.getElementById('saveMsg');
      store.set('tmdbKey', key);
      if (!key) { msg.textContent = 'Gespeichert (ohne Schlüssel: TVmaze).'; return; }
      msg.textContent = 'Prüfe Schlüssel…';
      try { await tmdb('/configuration'); msg.textContent = '✓ Schlüssel funktioniert.'; }
      catch (e) { msg.textContent = '✗ ' + e.message; }
    };
  } };
}

/* =========================================================================
   Router
   ========================================================================= */
let renderToken = 0;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '') || 'home';
  const [path, qs] = raw.split('?');
  const params = new URLSearchParams(qs || '');
  const page = Math.max(1, parseInt(params.get('page'), 10) || 1);
  return { parts: path.split('/'), params, page };
}

async function render() {
  const token = ++renderToken;
  const { parts, params, page } = parseHash();
  const [name] = parts;

  document.querySelectorAll('.tabbar a').forEach((a) => {
    const t = a.dataset.tab;
    a.classList.toggle('active', t === name
      || (t === 'movies' && ['top', 'upcoming'].includes(name))
      || (t === 'tv' && name === 'anime')
      || (t === 'home' && name === 'trending'));
  });
  const input = document.getElementById('searchInput');
  if (document.activeElement !== input) input.value = name === 'search' ? params.get('q') || '' : '';
  document.getElementById('searchClear').hidden = !input.value;

  view.innerHTML = spinner();
  window.scrollTo(0, 0);

  let out;
  try {
    if (name === 'home') out = await homeView();
    else if (TMDB_LISTS[name]) out = await listView(name, page);
    else if (name === 'search') out = await searchView(params.get('q') || '', page);
    else if (name === 'list') out = myListView(page);
    else if (name === 'title') out = await detailView(parts[1] === 'movie' ? 'movie' : 'tv', parseInt(parts[2], 10), params.get('src'));
    else if (name === 'settings') out = settingsView();
    else out = '<div class="empty">Seite nicht gefunden.</div>';
  } catch (e) {
    console.error(e);
    out = errorBox(e);
  }
  if (token !== renderToken || out == null) return; // a newer navigation won
  const { html, after } = typeof out === 'string' ? { html: out } : out;
  view.innerHTML = html;
  if (after) after();
}

/* ---------- search bar ---------- */
(() => {
  const form = document.getElementById('searchForm');
  const input = document.getElementById('searchInput');
  const clear = document.getElementById('searchClear');
  let timer;
  const go = () => {
    const q = input.value.trim();
    if (q) location.hash = `#/search?q=${encodeURIComponent(q)}&page=1`;
  };
  form.addEventListener('submit', (e) => { e.preventDefault(); clearTimeout(timer); go(); input.blur(); });
  input.addEventListener('input', () => {
    clear.hidden = !input.value;
    clearTimeout(timer);
    timer = setTimeout(go, 450); // live search while typing
  });
  clear.addEventListener('click', () => { input.value = ''; clear.hidden = true; input.focus(); });
})();

window.addEventListener('hashchange', render);
render();

// Android app (Capacitor): hardware back button goes back in the app, exits on Home
const capApp = window.Capacitor?.Plugins?.App;
if (capApp) {
  capApp.addListener('backButton', () => {
    if (parseHash().parts[0] !== 'home') history.back();
    else capApp.exitApp();
  });
}

// the APK already ships its files locally, a service worker would only cache stale copies there
if ('serviceWorker' in navigator && window.isSecureContext && !window.Capacitor?.isNativePlatform?.()) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
