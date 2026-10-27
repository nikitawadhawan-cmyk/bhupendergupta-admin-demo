// Writing-desk demo: stands in for the PHP server so the real admin screens work on GitHub Pages.
// Test stories are kept in this browser only (localStorage, photos in IndexedDB); nothing reaches the website.
(function () {
  const D = window.DEMO_DATA;
  const KEY = 'bgDemo-v1';
  const LOGIN_KEY = 'bgDemo-login';
  const PASSWORD = 'travel';
  const view = (document.body.className.match(/view-(\w+)/) || [])[1];

  /* ---------- Storage ---------- */

  function loadState() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
  }
  const st = Object.assign({ posts: {}, deleted: [], destinations: [], trips: [], nextId: 100000, nextPhoto: 900000 }, loadState());
  function saveState() {
    try {
      localStorage.setItem(KEY, JSON.stringify(st));
    } catch {
      alert('This browser has no room left to save the demo. Press "Start the demo again" at the top to clear it.');
    }
  }

  function db() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('bgDemo', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('photos', { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function putPhoto(rec) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction('photos', 'readwrite');
      tx.objectStore('photos').put(rec);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }
  async function loadUploadedPhotos() {
    try {
      const d = await db();
      const all = await new Promise((resolve) => {
        const req = d.transaction('photos').objectStore('photos').getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
      for (const r of all) {
        const url = URL.createObjectURL(r.blob);
        D.photos[r.id] = { thumb: url, large: url, width: r.width, height: r.height };
      }
    } catch { /* private window without IndexedDB: uploads simply won't survive a reload */ }
  }

  /* ---------- Stories, countries and trips (originals plus this browser's changes) ---------- */

  const destinations = () => [...D.destinations, ...st.destinations];
  const trips = () => [...D.trips, ...st.trips];
  function allPosts() {
    const base = D.posts.filter((p) => !st.deleted.includes(p.id)).map((p) => st.posts[p.id] || p);
    const added = Object.values(st.posts).filter((p) => p.id >= 100000 && !st.deleted.includes(p.id));
    return [...base, ...added];
  }
  const getPost = (id) => allPosts().find((p) => p.id === Number(id)) || null;

  const today = () => new Date().toISOString().slice(0, 10);
  const niceDate = (ymd) => (ymd ? new Date(ymd + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
  const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'story';
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const textOf = (html) => { const d = document.createElement('div'); d.innerHTML = html; return d.textContent.replace(/\s+/g, ' ').trim(); };
  const photoIds = (blocks) => blocks.flatMap((b) => (b.type === 'photo' ? [b.id] : b.type === 'gallery' ? b.items.map((i) => i.id) : []));

  /* ---------- Demo notice ---------- */

  function notice() {
    const bar = document.createElement('div');
    bar.className = 'demo-notice';
    bar.innerHTML = '<strong>Demo of Mr. Gupta’s writing desk.</strong> Nothing you do here changes the website. '
      + 'Test stories are saved only in this browser. <button type="button">Start the demo again</button>';
    bar.querySelector('button').addEventListener('click', async () => {
      if (!confirm('Remove all your test changes and start the demo again?')) return;
      localStorage.removeItem(KEY);
      try { indexedDB.deleteDatabase('bgDemo'); } catch {}
      location.href = 'stories.html';
    });
    document.body.prepend(bar);
    const css = document.createElement('style');
    css.textContent = '.demo-notice{background:#1f6f43;color:#fff;padding:12px 24px;font:500 16px/1.5 Montserrat,system-ui,sans-serif;text-align:center}'
      + '.demo-notice button{margin-left:10px;background:#fff;color:#1f6f43;border:0;border-radius:8px;padding:6px 12px;font:600 15px Montserrat,sans-serif;cursor:pointer}';
    document.head.append(css);
  }
  notice();

  /* ---------- Login ---------- */

  const params = new URLSearchParams(location.search);
  if (view === 'login') {
    if (params.has('logout')) localStorage.removeItem(LOGIN_KEY);
    else if (localStorage.getItem(LOGIN_KEY)) location.replace('stories.html');
    const form = document.querySelector('.login form');
    const hint = document.createElement('p');
    hint.className = 'alert alert-ok';
    hint.innerHTML = 'For this demo, the password is <strong>' + PASSWORD + '</strong>';
    form.before(hint);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (form.password.value.trim().toLowerCase() === PASSWORD) {
        localStorage.setItem(LOGIN_KEY, '1');
        location.href = 'stories.html';
        return;
      }
      document.querySelector('.login .alert:not(.alert-ok)')?.remove();
      const err = document.createElement('p');
      err.className = 'alert';
      err.setAttribute('role', 'alert');
      err.textContent = 'That password is not right. Please try again — check that Caps Lock is off.';
      hint.after(err);
    });
    return;
  }
  if (!localStorage.getItem(LOGIN_KEY)) {
    location.replace('index.html');
    return;
  }

  /* ---------- My stories ---------- */

  if (view === 'dashboard') {
    const list = document.getElementById('story-list');
    const posts = allPosts().sort((a, b) => (a.status === 'published') - (b.status === 'published')
      || String(b.published_on || '').localeCompare(String(a.published_on || '')) || b.id - a.id);
    const dName = (id) => destinations().find((d) => d.id === Number(id))?.name;
    const tName = (id) => trips().find((t) => t.id === Number(id))?.name;
    list.innerHTML = posts.map((p) => {
      const cover = D.photos[p.cover_photo_id];
      const meta = [dName(p.destination_id), tName(p.trip_id) !== dName(p.destination_id) ? tName(p.trip_id) : null, niceDate(p.published_on)].filter(Boolean).join(' · ');
      return `<li data-search="${esc((p.title + ' ' + (dName(p.destination_id) || '') + ' ' + (tName(p.trip_id) || '')).toLowerCase())}">
        <a class="story-row" href="editor.html?id=${p.id}">
          <span class="thumb">${cover ? `<img src="${esc(cover.thumb)}" alt="" loading="lazy">` : ''}</span>
          <span class="info"><span class="title">${esc(p.title || 'Untitled story')}</span><span class="meta">${esc(meta)}</span></span>
          ${p.status === 'published' ? '<span class="pill pill-live">On website</span>' : '<span class="pill pill-draft">Draft – not on website</span>'}
          <span class="btn btn-secondary">Open</span>
        </a></li>`;
    }).join('');
    const live = posts.filter((p) => p.status === 'published').length;
    document.querySelector('.dash-head .hint').textContent = `${live} stories on the website`;
    if (params.has('deleted')) {
      const msg = document.createElement('p');
      msg.className = 'alert alert-ok';
      msg.textContent = 'The story has been deleted.';
      document.querySelector('.dash-head').after(msg);
    }
    loadUploadedPhotos().then(() => {
      list.querySelectorAll('li').forEach((li, i) => {
        const p = posts[i];
        const cover = D.photos[p.cover_photo_id];
        const thumb = li.querySelector('.thumb');
        if (cover && !thumb.querySelector('img')) thumb.innerHTML = `<img src="${esc(cover.thumb)}" alt="">`;
      });
    });
  }

  /* ---------- Change password ---------- */

  if (view === 'password') {
    document.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      document.querySelector('.narrow .alert')?.remove();
      const msg = document.createElement('p');
      msg.className = 'alert alert-ok';
      msg.textContent = 'In this demo the password stays "travel". On the real website, this is where Mr. Gupta changes his password.';
      document.querySelector('.narrow h1').after(msg);
    });
  }

  /* ---------- Editor ---------- */

  if (view !== 'editor') return;

  function respond(obj, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } }));
  }

  async function fakeUpload(form) {
    const blob = form.get('photo');
    let width = 0, height = 0;
    try {
      const bmp = await createImageBitmap(blob);
      width = bmp.width;
      height = bmp.height;
    } catch {
      return { error: 'This file is not a photo we can read. Please choose a JPG or PNG photo.' };
    }
    const id = st.nextPhoto++;
    saveState();
    try { await putPhoto({ id, blob, width, height }); } catch {}
    const url = URL.createObjectURL(blob);
    D.photos[id] = { thumb: url, large: url, width, height };
    return { id, thumb: url, large: url, width, height };
  }

  function findOrCreate(list, match, make) {
    return list().find(match) || make();
  }

  function fakeSave(input) {
    const publish = input.status === 'published';
    const title = String(input.title || '').replace(/\s+/g, ' ').trim();
    const blocks = (input.body || []).filter((b) => b.type !== 'text' || textOf(b.html) !== '');

    let destId = Number(input.destination_id) || null;
    const newDest = String(input.new_destination || '').trim();
    if (newDest) {
      destId = findOrCreate(destinations, (d) => d.name.toLowerCase() === newDest.toLowerCase(), () => {
        const d = { id: st.nextId++, name: newDest, slug: slugify(newDest) };
        st.destinations.push(d);
        return d;
      }).id;
    }
    const makeTrip = (name) => findOrCreate(trips, (t) => t.destination_id === destId && t.name.toLowerCase() === name.toLowerCase(), () => {
      const t = { id: st.nextId++, destination_id: destId, name };
      st.trips.push(t);
      return t;
    }).id;
    let tripId = Number(input.trip_id) || null;
    const newTrip = String(input.new_trip || '').trim();
    if (destId && newTrip) tripId = makeTrip(newTrip);
    if (tripId && trips().find((t) => t.id === tripId)?.destination_id !== destId) tripId = null;
    if (destId && !tripId) {
      const ofDest = trips().filter((t) => t.destination_id === destId);
      if (!ofDest.length) tripId = makeTrip(destinations().find((d) => d.id === destId).name);
      else if (ofDest.length === 1) tripId = ofDest[0].id;
    }

    if (publish) {
      const missing = !title ? 'Please give the story a title (step 1) before publishing.'
        : !destId ? 'Please choose which country this story is about (step 2) before publishing.'
          : !tripId ? 'Please choose which trip this story belongs to (step 2), or pick “Start a new trip”.'
            : !blocks.length ? 'The story is empty. Please write something before publishing.' : null;
      if (missing) {
        saveState();
        return { status: 422, body: { error: missing } };
      }
    }

    const id = Number(input.id) || st.nextId++;
    const existing = getPost(id);
    const firstText = blocks.find((b) => b.type === 'text');
    const words = firstText ? textOf(firstText.html).split(' ') : [];
    const post = {
      ...(existing || {}),
      id,
      title,
      slug: existing?.first_published ? existing.slug : slugify(title || `draft-${id}`),
      status: publish ? 'published' : 'draft',
      destination_id: destId,
      trip_id: tripId,
      is_wildlife: !!input.is_wildlife,
      published_on: /^\d{4}-\d{2}-\d{2}$/.test(input.published_on || '') ? input.published_on : today(),
      summary: String(input.summary || '').trim() || words.slice(0, 35).join(' ') + (words.length > 35 ? '…' : ''),
      seo_title: String(input.seo_title || '').trim(),
      seo_description: String(input.seo_description || '').trim(),
      cover_photo_id: Number(input.cover_photo_id) || photoIds(blocks)[0] || null,
      first_published: !!existing?.first_published || publish,
      blocks,
    };
    st.posts[id] = post;
    saveState();
    return {
      status: 200,
      body: {
        id,
        slug: post.slug,
        status: post.status,
        url: `preview.html?id=${id}`,
        destination_id: destId,
        trip_id: tripId,
        options: { destinations: destinations(), trips: trips() },
        saved_at: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase(),
      },
    };
  }

  // The editor talks to the server with fetch() and two form posts; answer them here instead.
  const realFetch = window.fetch.bind(window);
  window.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.includes('do=upload')) {
      const res = await fakeUpload(opts.body);
      return respond(res, res.error ? 422 : 200);
    }
    if (u.includes('do=save')) {
      const res = fakeSave(JSON.parse(opts.body));
      return respond(res.body, res.status);
    }
    return realFetch(url, opts);
  };
  const realSubmit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function () {
    if ((this.getAttribute('action') || '').includes('do=preview')) {
      localStorage.setItem('bgDemo-preview', this.querySelector('[name=payload]').value);
      window.open('preview.html?draft=1', '_blank');
      return;
    }
    return realSubmit.call(this);
  };
  document.addEventListener('submit', (e) => {
    const form = e.target;
    if (e.defaultPrevented || !(form.getAttribute('action') || '').includes('do=delete')) return;
    e.preventDefault();
    const id = Number(form.querySelector('[name=id]').value);
    st.deleted.push(id);
    delete st.posts[id];
    saveState();
    location.href = 'stories.html?deleted=1';
  });

  // Put the story into the page the way the server would, then start the real editor.
  const id = Number(params.get('id'));
  const post = id ? getPost(id) : null;
  if (id && !post) {
    location.replace('stories.html');
    return;
  }
  loadUploadedPhotos().then(() => {
    const el = document.getElementById('editor-data');
    const data = JSON.parse(el.textContent);
    data.csrf = 'demo';
    data.photos = D.photos;
    data.destinations = destinations();
    data.trips = trips();
    data.today = today();
    data.post = post && { ...post, blocks: post.blocks };
    el.textContent = JSON.stringify(data);
    if (post) document.querySelector('.editor-head h1').textContent = 'Edit story';
    if (post && !document.querySelector('.danger-zone')) {
      // The editor page was rendered for a new story; add the delete button an existing story has.
      const zone = document.createElement('section');
      zone.className = 'card danger-zone';
      zone.innerHTML = `<form method="post" action="/admin/?do=delete">
        <input type="hidden" name="id" value="${post.id}">
        <button class="btn btn-danger" type="submit">Delete this story</button></form>`;
      zone.querySelector('form').addEventListener('submit', (e) => {
        if (!confirm('Delete this story for ever? This cannot be undone.\n\nTip: to only take it off the website, press “Hide from website” instead.')) e.preventDefault();
      });
      document.querySelector('.savebar').before(zone);
    }
    const s = document.createElement('script');
    s.src = 'editor.js';
    document.body.append(s);
  });
})();
