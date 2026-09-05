// app.js — Wavelength frontend (vanilla JS, no framework)

const API = '/api';
const state = {
  me: null,
  view: 'home',
  posts: [],
  users: [],
  suggested: [],
  activeChatUser: null,
  chatPollTimer: null,
  lastMsgId: 0,
  reelsCategory: '',
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function timeAgo(iso) {
  const then = new Date(iso.replace(' ', 'T') + 'Z');
  const diff = Math.max(0, (Date.now() - then.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function formatCount(num) {
  if (!num) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2200);
}

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Request failed');
  }
  return res.json();
}

const TAG_COLORS = {
  music: 'var(--accent-violet)', photo: 'var(--accent-teal)', food: 'var(--accent-amber)',
  life: 'var(--accent-coral)', code: 'var(--accent-teal)', art: 'var(--accent-violet)',
  climbing: 'var(--accent-amber)', ceramics: 'var(--accent-coral)',
};
function tagColor(tag) { return TAG_COLORS[tag] || 'var(--text-dim)'; }

// ---------- Bootstrap ----------
async function init() {
  state.me = await api('/me');
  renderChrome();
  await loadSuggested();
  renderTagCloud();
  await loadConversationsBadge();
  setView('home');

  $$('.rail-link, .icon-btn[data-view], #navMsgBtn').forEach((el) => {
    el.addEventListener('click', () => {
      if (el.id === 'navMsgBtn' || el.dataset.view === 'messages') return openDrawer();
      setView(el.dataset.view);
    });
  });
  $('#navProfileBtn').addEventListener('click', () => setView('profile'));
  $('#drawerClose').addEventListener('click', closeDrawer);
  $('#drawerBackdrop').addEventListener('click', closeDrawer);
  $('#drawerBack').addEventListener('click', showConversationList);
  $('#meCard').addEventListener('click', () => setView('profile'));

  // Wire left rail sub-category chips
  $$('#leftRailSubcats .subcat-chip').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      selectReelsCategory(btn.dataset.cat);
    });
  });

  $('#searchInput').addEventListener('input', (e) => handleSearch(e.target.value));
}

function renderChrome() {
  $('#topAvatar').src = state.me.avatar;
  $('#meAvatar').src = state.me.avatar;
  $('#meName').textContent = state.me.name;
  $('#meHandle').textContent = '@' + state.me.username;
  $('#meStats').innerHTML = `
    <div><b>${state.me.postCount}</b> posts</div>
    <div><b>${state.me.followers}</b> followers</div>
    <div><b>${state.me.following}</b> following</div>
  `;
}

async function loadSuggested() {
  state.suggested = await api('/users/suggested');
  const list = $('#suggestedList');
  if (!state.suggested.length) {
    list.innerHTML = `<div style="font-size:12.5px;color:var(--text-faint)">You're following everyone already 🎉</div>`;
    return;
  }
  list.innerHTML = state.suggested.map((u) => `
    <div class="suggested-row" data-user="${u.id}">
      <img src="${u.avatar}" alt="" data-open-profile="${u.id}" />
      <div class="info" data-open-profile="${u.id}">
        <div class="name">${escapeHtml(u.name)}</div>
        <div class="handle">@${escapeHtml(u.username)}</div>
      </div>
      <button class="follow-btn" data-follow="${u.id}">Follow</button>
    </div>
  `).join('');
  list.querySelectorAll('[data-follow]').forEach((btn) => {
    btn.addEventListener('click', () => toggleFollow(Number(btn.dataset.follow), btn));
  });
  list.querySelectorAll('[data-open-profile]').forEach((el) => {
    el.addEventListener('click', () => openProfile(Number(el.dataset.openProfile)));
  });
}

function renderTagCloud() {
  const tags = Object.keys(TAG_COLORS);
  $('#tagCloud').innerHTML = tags.map((t) => `<span class="tag-chip" data-tag="${t}">#${t}</span>`).join('');
  $$('.tag-chip', $('#tagCloud')).forEach((chip) => {
    chip.addEventListener('click', () => { setView('explore'); });
  });
}

async function toggleFollow(userId, btnEl) {
  const wasFollowing = btnEl.classList.contains('following');
  const updated = await api(`/users/${userId}/${wasFollowing ? 'unfollow' : 'follow'}`, { method: 'POST' });
  btnEl.classList.toggle('following', updated.isFollowing);
  btnEl.textContent = updated.isFollowing ? 'Following' : 'Follow';
  state.me = await api('/me');
  renderChrome();
  toast(updated.isFollowing ? `Following @${updated.username}` : `Unfollowed @${updated.username}`);
}

// ---------- View routing ----------
function setActiveNav(view) {
  $$('.rail-link').forEach((l) => l.classList.toggle('active', l.dataset.view === view));
  const ep = $('#explorePanel');
  const tp = $('#tagsPanel');
  const rp = $('#reelsCatPanel');
  const lsc = $('#leftRailSubcats');
  if (view === 'reels') {
    if (ep) ep.hidden = true;
    if (tp) tp.hidden = true;
    if (rp) {
      rp.hidden = false;
      renderReelsCategories();
    }
    if (lsc) lsc.hidden = false;
  } else {
    if (ep) ep.hidden = false;
    if (tp) tp.hidden = false;
    if (rp) rp.hidden = true;
    if (lsc) lsc.hidden = true;
  }
}

const REEL_CATEGORIES = ['All', 'Motivation', 'Comedy', 'Serious', 'Gym Freak', 'Yoga', 'Exercise', 'Competitive Exam', 'Job'];

function getCategoryEmoji(cat) {
  const map = {
    'All': '✨',
    'Motivation': '⚡',
    'Comedy': '😂',
    'Serious': '💭',
    'Gym Freak': '🏋️‍♂️',
    'Yoga': '🧘‍♀️',
    'Exercise': '👟',
    'Competitive Exam': '📚',
    'Job': '💼'
  };
  return map[cat] || '🎬';
}

function selectReelsCategory(cat) {
  state.reelsCategory = (cat === 'All' ? '' : cat);

  // Sync left sidebar sub-category buttons
  $$('.subcat-chip').forEach(b => {
    const isAct = (b.dataset.cat === cat) || (!state.reelsCategory && b.dataset.cat === 'All');
    b.classList.toggle('active', isAct);
  });

  // Sync right sidebar buttons
  $$('.reel-cat-btn').forEach(b => {
    const isAct = (b.dataset.cat === cat) || (!state.reelsCategory && b.dataset.cat === 'All');
    b.classList.toggle('active', isAct);
  });

  // Sync top horizontal chips
  $$('.reels-cat-chip').forEach(c => {
    const isAct = (c.dataset.cat === cat) || (!state.reelsCategory && c.dataset.cat === 'All');
    c.classList.toggle('active', isAct);
  });

  toast(`Filtered: ${cat} ${getCategoryEmoji(cat)}`);
  renderReels(true);
}

function renderReelsCategories() {
  const list = $('#reelsCategoryList');
  if (list.innerHTML) {
    // Keep active state synchronized
    $$('.reel-cat-btn').forEach(b => {
      const isAct = (b.dataset.cat === state.reelsCategory) || (!state.reelsCategory && b.dataset.cat === 'All');
      b.classList.toggle('active', isAct);
    });
    return;
  }
  list.innerHTML = REEL_CATEGORIES.map((c) => {
    const isAct = (!state.reelsCategory && c === 'All') || (state.reelsCategory === c);
    return `
      <button class="rail-link reel-cat-btn ${isAct ? 'active' : ''}" data-cat="${c}">
        <span class="rail-dot" style="background:var(--accent-teal)"></span> ${getCategoryEmoji(c)} ${c}
      </button>
    `;
  }).join('');
  list.querySelectorAll('.reel-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => selectReelsCategory(btn.dataset.cat));
  });
}

async function setView(view, arg) {
  if (state.view === 'reels' && view !== 'reels' && currentActiveReel) {
    stopReelMedia(currentActiveReel);
    currentActiveReel = null;
  }
  state.view = view;
  setActiveNav(view);
  const main = $('#mainCol');
  main.innerHTML = `<div class="empty-state">Loading…</div>`;

  if (view === 'home') return renderHome();
  if (view === 'explore') return renderExplore();
  if (view === 'reels') return renderReels();
  if (view === 'profile') return renderProfile(arg || state.me.id);
}

// ---------- Home / Feed ----------
async function renderHome() {
  state.posts = await api('/posts');
  const main = $('#mainCol');
  main.innerHTML = `
    <h1 class="view-title">Your feed</h1>
    <p class="view-sub">What everyone's tuned into right now.</p>
    <div class="composer" id="composer">
      <img class="me-avatar" src="${state.me.avatar}" alt="" />
      <div class="composer-body">
        <textarea id="postText" placeholder="What's on your wavelength?" rows="2"></textarea>
        <div class="composer-row">
          <select class="tag-select" id="postTag">
            ${Object.keys(TAG_COLORS).map((t) => `<option value="${t}">#${t}</option>`).join('')}
          </select>
          <button class="post-btn" id="postBtn">Broadcast</button>
        </div>
      </div>
    </div>
    <div id="feedList" style="display:flex;flex-direction:column;gap:18px;"></div>
  `;
  $('#postBtn').addEventListener('click', submitPost);
  renderFeedList($('#feedList'), state.posts);
}

async function submitPost() {
  const textEl = $('#postText');
  const content = textEl.value.trim();
  if (!content) return;
  const tag = $('#postTag').value;
  const useImage = Math.random() < 0.3;
  const body = { content, tag };
  if (useImage) body.image = `https://picsum.photos/seed/new${Date.now()}/800/600`;
  const post = await api('/posts', { method: 'POST', body: JSON.stringify(body) });
  state.posts.unshift(post);
  textEl.value = '';
  state.me = await api('/me');
  renderChrome();
  renderFeedList($('#feedList'), state.posts);
  toast('Posted to your feed');
}

function renderFeedList(container, posts) {
  if (!posts.length) {
    container.innerHTML = `<div class="empty-state"><div class="em-title">Nothing here yet</div>Be the first to broadcast something.</div>`;
    return;
  }
  container.innerHTML = posts.map(postCardHtml).join('');
  posts.forEach((p) => wirePostCard(container, p.id));
}

function postCardHtml(p) {
  return `
  <article class="post-card" data-post="${p.id}">
    <div class="post-head">
      <img class="avatar" src="${p.author.avatar}" alt="" data-open-profile="${p.author.id}" />
      <div class="who" data-open-profile="${p.author.id}">
        <div class="name">${escapeHtml(p.author.name)}</div>
        <div class="meta">
          @${escapeHtml(p.author.username)} · ${timeAgo(p.createdAt)}
          ${p.tag ? `<span class="freq-tag"><span class="dot" style="background:${tagColor(p.tag)}"></span>${p.tag}</span>` : ''}
        </div>
      </div>
    </div>
    <div class="post-content">${escapeHtml(p.content)}</div>
    ${p.image ? `<img class="post-image" src="${p.image}" alt="" loading="lazy" />` : ''}
    <div class="post-actions">
      <button class="pact-btn like-btn ${p.likedByMe ? 'liked' : ''}" data-action="like">
        <svg viewBox="0 0 24 24"><path d="M12 20s-7-4.35-9.5-8.8C.7 7.7 2.4 4.5 5.7 4.1c2-.24 3.6.8 4.5 2.2.9-1.4 2.5-2.44 4.5-2.2 3.3.4 5 3.6 3.2 7.1C19 15.65 12 20 12 20Z" ${p.likedByMe ? '' : 'fill="none"'} stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
        <span class="like-count">${p.likeCount}</span>
      </button>
      <button class="pact-btn" data-action="comment">
        <svg viewBox="0 0 24 24" fill="none"><path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
        <span>${p.commentCount}</span>
      </button>
    </div>
    <div class="comments-wrap" data-comments="${p.id}"></div>
  </article>`;
}

function wirePostCard(root, postId) {
  const card = root.querySelector(`.post-card[data-post="${postId}"]`);
  if (!card) return;
  card.querySelector('[data-action="like"]').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const updated = await api(`/posts/${postId}/like`, { method: 'POST' });
    btn.classList.toggle('liked', updated.likedByMe);
    btn.querySelector('.like-count').textContent = updated.likeCount;
  });
  card.querySelector('[data-action="comment"]').addEventListener('click', () => toggleComments(card, postId));
  card.querySelectorAll('[data-open-profile]').forEach((el) => {
    el.addEventListener('click', () => openProfile(Number(el.dataset.openProfile)));
  });
}

async function toggleComments(card, postId) {
  const wrap = card.querySelector(`.comments-wrap[data-comments="${postId}"]`);
  const opening = !wrap.classList.contains('open');
  if (opening && !wrap.dataset.loaded) {
    const comments = await api(`/posts/${postId}/comments`);
    wrap.innerHTML = comments.map(commentRowHtml).join('') + `
      <form class="comment-form" data-postid="${postId}">
        <input type="text" placeholder="Add a comment…" required />
        <button type="submit">Post</button>
      </form>`;
    wrap.dataset.loaded = '1';
    wrap.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = e.target.querySelector('input');
      const content = input.value.trim();
      if (!content) return;
      const c = await api(`/posts/${postId}/comments`, { method: 'POST', body: JSON.stringify({ content }) });
      const form = wrap.querySelector('form');
      form.insertAdjacentHTML('beforebegin', commentRowHtml(c));
      input.value = '';
      const countEl = card.querySelector('[data-action="comment"] span');
      countEl.textContent = Number(countEl.textContent) + 1;
    });
  }
  wrap.classList.toggle('open', opening);
}

function commentRowHtml(c) {
  return `
    <div class="comment-row">
      <img src="${c.author.avatar}" alt="" />
      <div class="comment-bubble"><b>${escapeHtml(c.author.name)}</b>${escapeHtml(c.content)}</div>
    </div>`;
}

// ---------- Explore ----------
let explorePage = 1;
let exploreLoading = false;
let exploreEnd = false;
async function renderExplore(reset = true) {
  if (reset) {
    explorePage = 1;
    exploreEnd = false;
    const main = $('#mainCol');
    main.innerHTML = `
      <h1 class="view-title">Explore</h1>
      <p class="view-sub">Everything being broadcast across Wavelength.</p>
      <div class="explore-grid" id="exploreGrid"></div>
      <div id="exploreSentinel" style="height:20px;"></div>
    `;
    $('#exploreGrid').addEventListener('click', (e) => {
      const tile = e.target.closest('.explore-tile');
      if (tile) jumpToPostInFeed(Number(tile.dataset.post));
    });
    
    const sentinel = $('#exploreSentinel');
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !exploreLoading && !exploreEnd && state.view === 'explore') {
        explorePage++;
        renderExplore(false);
      }
    }, { rootMargin: '200px' });
    observer.observe(sentinel);
  }
  
  if (exploreLoading || exploreEnd) return;
  exploreLoading = true;
  const posts = await api(`/posts?page=${explorePage}`);
  if (posts.length === 0) {
    exploreEnd = true;
    exploreLoading = false;
    return;
  }
  
  const grid = $('#exploreGrid');
  const html = posts.map((p) => `
    <div class="explore-tile" data-post="${p.id}">
      ${p.image ? `<img src="${p.image}" alt="" loading="lazy"/>` : `<div class="no-image">${escapeHtml(p.content.slice(0, 60))}</div>`}
      <div class="overlay">❤ ${p.likeCount} · 💬 ${p.commentCount}</div>
    </div>
  `).join('');
  grid.insertAdjacentHTML('beforeend', html);
  exploreLoading = false;
}

async function jumpToPostInFeed(postId) {
  await setView('home');
  setTimeout(() => {
    const card = document.querySelector(`.post-card[data-post="${postId}"]`);
    if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); card.style.borderColor = 'var(--accent-teal)'; }
  }, 60);
}

// ---------- Reels ----------
let reelsLoading = false;
let currentActiveReel = null;
let reelsObserver = null;
const loadedReelIds = new Set();
let recentUrls = [];

function playReelMedia(item) {
  if (!item) return;
  const iframe = item.querySelector('iframe');
  const video = item.querySelector('video');

  if (iframe) {
    const target = iframe.dataset.src;
    if (target && iframe.src !== target) {
      iframe.src = target;
    }
  }

  if (video) {
    const target = video.dataset.src;
    if (target && video.src !== target) {
      video.src = target;
    }
    video.muted = false;
    video.currentTime = 0;
    video.play().catch(() => {});
  }
}

function stopReelMedia(item) {
  if (!item) return;
  const iframe = item.querySelector('iframe');
  const video = item.querySelector('video');

  if (iframe) {
    iframe.src = 'about:blank';
  }

  if (video) {
    video.pause();
    video.muted = true;
  }
}

async function renderReels(reset = true) {
  if (reset) {
    if (currentActiveReel) {
      stopReelMedia(currentActiveReel);
      currentActiveReel = null;
    }
    loadedReelIds.clear();
    recentUrls = [];

    const main = $('#mainCol');
    main.innerHTML = `
      <div class="reels-wrapper">
        <div class="reels-category-bar" id="reelsCategoryBar">
          ${REEL_CATEGORIES.map(c => {
            const isAct = (!state.reelsCategory && c === 'All') || (state.reelsCategory === c);
            return `
              <button class="reels-cat-chip ${isAct ? 'active' : ''}" data-cat="${c}">
                ${getCategoryEmoji(c)} ${c}
              </button>
            `;
          }).join('')}
        </div>
        <div class="reels-container" id="reelsContainer"></div>
      </div>
    `;

    // Wire top category chips
    $$('#reelsCategoryBar .reels-cat-chip').forEach(chip => {
      chip.addEventListener('click', () => selectReelsCategory(chip.dataset.cat));
    });

    const container = $('#reelsContainer');

    // Observer for single-audio playback
    reelsObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const item = entry.target;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          if (currentActiveReel && currentActiveReel !== item) {
            stopReelMedia(currentActiveReel);
          }
          currentActiveReel = item;
          playReelMedia(item);
        } else if (!entry.isIntersecting && currentActiveReel === item) {
          stopReelMedia(item);
          currentActiveReel = null;
        }
      });
    }, {
      root: container,
      threshold: [0.1, 0.65]
    });

    container.addEventListener('scroll', () => {
      if (container.scrollTop + container.clientHeight >= container.scrollHeight - 1200) {
        if (!reelsLoading) loadMoreReels();
      }
    });

    await loadMoreReels();
  }
}

async function loadMoreReels() {
  if (reelsLoading) return;
  reelsLoading = true;

  try {
    let url = '/reels?';
    if (state.reelsCategory && state.reelsCategory !== 'All') {
      url += `category=${encodeURIComponent(state.reelsCategory)}&`;
    }
    if (loadedReelIds.size > 0) {
      url += `exclude=${Array.from(loadedReelIds).slice(-15).join(',')}&`;
    }

    const reels = await api(url);
    const container = $('#reelsContainer');
    if (!container) return;

  // Deduplicate against the most recent 6 reels to avoid back-to-back repetitions while allowing infinite scroll
  let uniqueReels = reels.filter(r => {
    if (recentUrls.slice(-6).includes(r.url)) return false;
    recentUrls.push(r.url);
    loadedReelIds.add(r.id);
    return true;
  });

  if (uniqueReels.length === 0) {
    uniqueReels = reels.slice(0, 5);
    uniqueReels.forEach(r => recentUrls.push(r.url));
  }

  const isInitialBatch = container.children.length === 0;

  const html = uniqueReels.map((r, index) => {
    const isYouTube = r.url.includes('youtube.com');
    const videoId = isYouTube ? r.url.split('/').pop().split('?')[0] : '';
    // controls=0 & modestbranding=1 & fs=0: hides playback bar & YouTube logo
    const embedUrl = isYouTube 
      ? `https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&autoplay=1&mute=0&controls=0&modestbranding=1&rel=0&iv_load_policy=3&fs=0&disablekb=1&loop=1&playlist=${videoId}`
      : r.url;

    // ONLY the very first reel of the whole feed starts playing audio; all others wait until scrolled into view!
    const isFirst = (isInitialBatch && index === 0);

    return `
    <div class="reel-item" data-reel="${r.id}">
      <!-- Top Reels Header Badge -->
      <div class="reel-top-bar">
        <div class="reel-badge">
          ${getCategoryEmoji(r.category)}
          <span>${escapeHtml(r.category || 'Reels')}</span>
        </div>
      </div>

      <!-- Media: Cropped YouTube Embed OR HTML5 Video (No YouTube Watermark Visible) -->
      <div class="reel-media-wrap">
        ${isYouTube ? `
          <iframe class="reel-video reel-iframe" 
            src="${isFirst ? embedUrl : 'about:blank'}" 
            data-src="${embedUrl}" 
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
            allowfullscreen></iframe>
        ` : `
          <video class="reel-video" 
            src="${isFirst ? embedUrl : ''}" 
            data-src="${embedUrl}" 
            ${isFirst ? 'autoplay' : ''} 
            loop playsinline preload="metadata"></video>
        `}
      </div>

      <!-- Bottom Creator & Caption Overlay -->
      <div class="reel-overlay">
        <div class="reel-author-row">
          <div class="reel-avatar-wrap" data-open-profile="${r.author.id}" style="cursor:pointer">
            <img src="${r.author.avatar}" alt="" />
          </div>
          <span class="reel-username" data-open-profile="${r.author.id}" style="cursor:pointer">@${escapeHtml(r.author.username)}</span>
          <span class="reel-verified">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="#3897f0"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
          <button class="reel-follow-btn" data-follow="${r.author.id}">Follow</button>
        </div>
        <div class="reel-caption">${escapeHtml(r.caption)}</div>
        <div class="reel-audio-bar">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
          <span>Original Audio · ${escapeHtml(r.author.name)} · Trending Reels</span>
        </div>
      </div>

      <!-- Right Floating Action Sidebar (Instagram Style) -->
      <div class="reel-sidebar">
        <button class="reel-action like-reel" data-id="${r.id}" title="Like">
          <div class="reel-icon-circle">
            <svg viewBox="0 0 24 24" width="24" height="24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="none" stroke="currentColor" stroke-width="2"/></svg>
          </div>
          <span class="rcount">${formatCount(r.likes)}</span>
        </button>

        <button class="reel-action comment-reel" title="Comments" data-open-chat="${r.author.id}">
          <div class="reel-icon-circle">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
          <span class="rcount">${formatCount(r.comments)}</span>
        </button>

        <button class="reel-action share-reel" title="Share">
          <div class="reel-icon-circle">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none"><line x1="22" y1="2" x2="11" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><polygon points="22 2 15 22 11 13 2 9 22 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
          <span class="rcount" style="font-size:11px">Share</span>
        </button>

        <button class="reel-action bookmark-reel" title="Save">
          <div class="reel-icon-circle">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
        </button>

        <div class="reel-music-disc">
          <img src="${r.author.avatar}" alt="" />
        </div>
      </div>
    </div>
    `;
  }).join('');
  
  container.insertAdjacentHTML('beforeend', html);
  
  // Bind items and register with observer
  const newItems = container.querySelectorAll('.reel-item:not(.bound)');
  newItems.forEach((item, index) => {
    item.classList.add('bound');
    
    // Register with intersection observer for single-reel audio control
    if (reelsObserver) {
      reelsObserver.observe(item);
    }

    if (isInitialBatch && index === 0) {
      currentActiveReel = item;
    }

    // Like toggle
    const likeBtn = item.querySelector('.like-reel');
    if (likeBtn) {
      likeBtn.addEventListener('click', async () => {
        const id = likeBtn.dataset.id;
        const res = await api(`/reels/${id}/like`, { method: 'POST' });
        likeBtn.classList.toggle('liked');
        likeBtn.querySelector('.rcount').textContent = formatCount(res.likes);
        toast('Liked reel ❤️');
      });
    }

    // Share button
    const shareBtn = item.querySelector('.share-reel');
    if (shareBtn) {
      shareBtn.addEventListener('click', () => {
        navigator.clipboard?.writeText(window.location.href);
        toast('Link copied to clipboard! 📋');
      });
    }

    // Bookmark button
    const bookmarkBtn = item.querySelector('.bookmark-reel');
    if (bookmarkBtn) {
      bookmarkBtn.addEventListener('click', () => {
        const svg = bookmarkBtn.querySelector('svg path');
        const isSaved = svg.getAttribute('fill') === '#ffc857';
        svg.setAttribute('fill', isSaved ? 'none' : '#ffc857');
        svg.setAttribute('stroke', isSaved ? 'currentColor' : '#ffc857');
        toast(isSaved ? 'Removed from saved' : 'Reel saved! 🔖');
      });
    }

    // Follow button
    const followBtn = item.querySelector('.reel-follow-btn');
    if (followBtn) {
      followBtn.addEventListener('click', () => {
        const isF = followBtn.classList.toggle('following');
        followBtn.textContent = isF ? 'Following' : 'Follow';
        toast(isF ? 'Followed creator' : 'Unfollowed');
      });
    }

    // Profile navigation
    item.querySelectorAll('[data-open-profile]').forEach(el => {
      el.addEventListener('click', () => openProfile(Number(el.dataset.openProfile)));
    });

    // Direct message / comment to creator
    item.querySelectorAll('[data-open-chat]').forEach(el => {
      el.addEventListener('click', () => openDrawer(Number(el.dataset.openChat)));
    });
  });
  } catch (err) {
    console.error('Failed to load reels:', err);
  } finally {
    reelsLoading = false;
  }
}

// ---------- Profile ----------
async function openProfile(userId) { await setView('profile', userId); }

async function renderProfile(userId) {
  const user = await api(`/users/${userId}`);
  const posts = await api(`/users/${userId}/posts`);
  const main = $('#mainCol');
  main.innerHTML = `
    <div class="profile-card" style="--cover-color:${user.coverColor || '#33C2A6'}">
      <div class="profile-cover"></div>
      <div class="profile-head">
        <img class="profile-avatar" src="${user.avatar}" alt="" />
        <div class="profile-name-block">
          <div class="profile-name">${escapeHtml(user.name)}</div>
          <div class="profile-handle">@${escapeHtml(user.username)}</div>
        </div>
      </div>
      <div class="profile-bio">${escapeHtml(user.bio || '')}</div>
      <div class="profile-stats">
        <div><b>${user.postCount}</b><span>posts</span></div>
        <div><b>${user.followers}</b><span>followers</span></div>
        <div><b>${user.following}</b><span>following</span></div>
      </div>
      <div class="profile-actions">
        ${user.isSelf ? '' : `
          <button class="follow-btn ${user.isFollowing ? 'following' : ''}" id="profileFollowBtn" style="padding:9px 18px;font-size:13px;">
            ${user.isFollowing ? 'Following' : 'Follow'}
          </button>
          <button class="msg-btn" id="profileMsgBtn">Message</button>
        `}
      </div>
    </div>
    <div class="section-label">${user.isSelf ? 'Your posts' : `Posts by ${escapeHtml(user.name)}`}</div>
    <div id="profileFeed" style="display:flex;flex-direction:column;gap:18px;"></div>
  `;
  renderFeedList($('#profileFeed'), posts);

  if (!user.isSelf) {
    $('#profileFollowBtn').addEventListener('click', () => toggleFollow(userId, $('#profileFollowBtn')));
    $('#profileMsgBtn').addEventListener('click', () => openDrawer(userId));
  }
}

// ---------- Search ----------
let searchDebounce;
function handleSearch(q) {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(async () => {
    if (!q.trim()) return;
    const [users, posts] = await Promise.all([api('/users'), api('/posts')]);
    const uMatch = users.filter((u) => u.name.toLowerCase().includes(q.toLowerCase()) || u.username.toLowerCase().includes(q.toLowerCase()));
    const pMatch = posts.filter((p) => p.content.toLowerCase().includes(q.toLowerCase()) || (p.tag || '').includes(q.toLowerCase()));
    if (uMatch.length) return openProfile(uMatch[0].id);
    if (pMatch.length) return jumpToPostInFeed(pMatch[0].id);
  }, 500);
}

// ---------- Messaging drawer ----------
async function loadConversationsBadge() {
  const convos = await api('/conversations');
  $('#msgBadge').hidden = convos.length === 0;
}

async function openDrawer(userId) {
  $('#drawerBackdrop').classList.add('open');
  $('#msgDrawer').classList.add('open');
  if (userId) {
    await openChat(userId);
  } else {
    await showConversationList();
  }
}

function closeDrawer() {
  $('#drawerBackdrop').classList.remove('open');
  $('#msgDrawer').classList.remove('open');
  stopChatPolling();
}

async function showConversationList() {
  stopChatPolling();
  $('#drawerBack').hidden = true;
  $('#drawerTitle').textContent = 'Messages';
  const body = $('#drawerBody');
  body.innerHTML = `<div class="empty-state">Loading…</div>`;
  const convos = await api('/conversations');
  const bot = await api('/bot');
  const hasBot = convos.some((c) => c.user.id === bot.id);

  let html = '';
  if (!hasBot) {
    html += `
      <div class="convo-row" data-user="${bot.id}">
        <img src="${bot.avatar}" alt="" />
        <div class="info">
          <div class="name">${escapeHtml(bot.name)}</div>
          <div class="preview">Say hi — I always reply 👋</div>
        </div>
      </div>`;
  }
  html += convos.map((c) => `
    <div class="convo-row" data-user="${c.user.id}">
      <img src="${c.user.avatar}" alt="" />
      <div class="info">
        <div class="name">${escapeHtml(c.user.name)}</div>
        <div class="preview">${escapeHtml(c.lastMessage)}</div>
      </div>
    </div>
  `).join('');

  if (!convos.length && hasBot === false) {
    html += `<div class="convo-empty">No conversations yet.<br/>Try messaging the Wavelength Bot to see an auto-reply in action.</div>`;
  }
  body.innerHTML = html || `<div class="convo-empty">No conversations yet.</div>`;
  body.querySelectorAll('.convo-row').forEach((row) => {
    row.addEventListener('click', () => openChat(Number(row.dataset.user)));
  });
}

async function openChat(userId) {
  state.activeChatUser = userId;
  $('#drawerBack').hidden = false;
  const user = await api(`/users/${userId}`);
  $('#drawerTitle').textContent = user.name;
  const body = $('#drawerBody');
  body.innerHTML = `
    <div class="chat-thread" id="chatThread"></div>
    <div class="chat-input-row">
      <input type="text" id="chatInput" placeholder="Message @${escapeHtml(user.username)}…" />
      <button class="chat-send" id="chatSend" aria-label="Send">
        <svg viewBox="0 0 20 20" fill="none"><path d="M2 10l16-8-5 16-3-6-8-2Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
      </button>
    </div>
  `;
  const messages = await api(`/messages/${userId}`);
  renderChatThread(messages);
  state.lastMsgId = messages.length ? messages[messages.length - 1].id : 0;

  $('#chatSend').addEventListener('click', () => sendChatMessage(userId));
  $('#chatInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChatMessage(userId);
  });

  startChatPolling(userId);
}

function renderChatThread(messages) {
  const thread = $('#chatThread');
  if (!thread) return;
  if (!messages.length) {
    thread.innerHTML = `<div class="empty-state" style="padding:30px 10px;"><div class="em-title">Say hello</div>Start the conversation below.</div>`;
    return;
  }
  thread.innerHTML = messages.map((m) => `
    <div class="chat-bubble-row ${m.fromMe ? 'mine' : ''}">
      <div class="chat-bubble">${escapeHtml(m.content)}</div>
    </div>
  `).join('');
  thread.scrollTop = thread.scrollHeight;
}

async function sendChatMessage(userId) {
  const input = $('#chatInput');
  const content = input.value.trim();
  if (!content) return;
  input.value = '';
  const msg = await api(`/messages/${userId}`, { method: 'POST', body: JSON.stringify({ content }) });
  state.lastMsgId = msg.id;
  const thread = $('#chatThread');
  const emptyState = thread.querySelector('.empty-state');
  if (emptyState) thread.innerHTML = '';
  thread.insertAdjacentHTML('beforeend', `
    <div class="chat-bubble-row mine"><div class="chat-bubble">${escapeHtml(content)}</div></div>
  `);
  thread.scrollTop = thread.scrollHeight;
  showTypingIndicator();
}

function showTypingIndicator() {
  const thread = $('#chatThread');
  if (!thread || thread.querySelector('.chat-typing-row')) return;
  thread.insertAdjacentHTML('beforeend', `
    <div class="chat-bubble-row chat-typing-row">
      <div class="chat-bubble chat-typing"><span></span><span></span><span></span></div>
    </div>
  `);
  thread.scrollTop = thread.scrollHeight;
}
function removeTypingIndicator() {
  const row = document.querySelector('.chat-typing-row');
  if (row) row.remove();
}

function startChatPolling(userId) {
  stopChatPolling();
  state.chatPollTimer = setInterval(async () => {
    if (state.activeChatUser !== userId) return;
    const updates = await api(`/messages/${userId}/since/${state.lastMsgId}`);
    if (updates.length) {
      removeTypingIndicator();
      const thread = $('#chatThread');
      const emptyState = thread && thread.querySelector('.empty-state');
      if (emptyState) thread.innerHTML = '';
      updates.forEach((m) => {
        state.lastMsgId = Math.max(state.lastMsgId, m.id);
        thread.insertAdjacentHTML('beforeend', `
          <div class="chat-bubble-row ${m.fromMe ? 'mine' : ''}"><div class="chat-bubble">${escapeHtml(m.content)}</div></div>
        `);
      });
      thread.scrollTop = thread.scrollHeight;
      loadConversationsBadge();
    }
  }, 1500);
}
function stopChatPolling() {
  clearInterval(state.chatPollTimer);
  state.chatPollTimer = null;
  state.activeChatUser = null;
}

init();
