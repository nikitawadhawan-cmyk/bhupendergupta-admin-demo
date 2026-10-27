// The story editor. A story is a list of blocks: text, single photos and (from the old site) photo groups.
const data = JSON.parse(document.getElementById('editor-data').textContent);
const $ = (id) => document.getElementById(id);
const blocksEl = $('blocks');
const photos = data.photos; // id -> {thumb, large}
const state = {
  id: data.post?.id ?? null,
  status: data.post?.status ?? 'draft',
  coverId: data.post?.cover_photo_id ?? null,
  dirty: false,
  saving: false,
  lastSaved: null,
};
let caret = null; // where photos will be inserted: {block, child}

document.execCommand('defaultParagraphSeparator', false, 'p');

/* ---------- Building blocks ---------- */

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function button(label, onClick, className = 'btn btn-small') {
  const b = el('button', { type: 'button', className, textContent: label });
  b.addEventListener('mousedown', (e) => e.preventDefault()); // keep the text selection
  b.addEventListener('click', onClick);
  return b;
}

function blockControls(block) {
  return el('div', { className: 'block-controls' },
    button('↑ Move up', () => { block.previousElementSibling?.before(block); changed(); block.scrollIntoView({ block: 'nearest' }); }),
    button('↓ Move down', () => { block.nextElementSibling?.after(block); changed(); block.scrollIntoView({ block: 'nearest' }); }),
    button('Remove', () => removeBlock(block), 'btn btn-small btn-quiet-danger'),
  );
}

function removeBlock(block) {
  const what = { text: 'this text', photo: 'this photo from the story', gallery: 'this group of photos from the story' }[block.dataset.type];
  const empty = block.dataset.type === 'text' && !block.querySelector('.rte').textContent.trim();
  if (!empty && !confirm(`Remove ${what}?`)) return;
  block.remove();
  if (!blocksEl.children.length) blocksEl.append(textBlock(''));
  changed();
}

function textBlock(html) {
  const rte = el('div', { className: 'rte', contentEditable: 'true', spellcheck: true });
  rte.setAttribute('role', 'textbox');
  rte.setAttribute('aria-multiline', 'true');
  rte.setAttribute('aria-label', 'Story text');
  rte.innerHTML = html || '<p><br></p>';
  rte.addEventListener('paste', onPaste);
  rte.addEventListener('input', changed);

  const isHeading = () => /^h[23]$/i.test(document.queryCommandValue('formatBlock'));
  const toolbar = el('div', { className: 'toolbar' },
    button('B  Bold', () => document.execCommand('bold'), 'btn btn-small btn-tool bold'),
    button('I  Italic', () => document.execCommand('italic'), 'btn btn-small btn-tool italic'),
    button('Heading', () => { document.execCommand('formatBlock', false, isHeading() ? 'p' : 'h2'); changed(); }, 'btn btn-small btn-tool'),
    button('Link', () => {
      const url = prompt('Paste the web address for the link (it starts with https://)');
      if (url && /^https?:\/\//i.test(url.trim())) document.execCommand('createLink', false, url.trim());
      changed();
    }, 'btn btn-small btn-tool'),
  );
  const block = el('div', { className: 'block block-text' }, toolbar, rte);
  block.dataset.type = 'text';
  block.append(blockControls(block));
  return block;
}

function photoBlock(id, caption) {
  const caps = el('input', { className: 'caption', value: caption || '', placeholder: 'Write a caption, e.g. Tiger at Rajbagh Lake' });
  caps.addEventListener('input', changed);
  const block = el('div', { className: 'block block-photo' },
    el('img', { src: photos[id]?.thumb || '', alt: '' }),
    el('label', { className: 'caption-label' }, 'Caption', caps, el('span', { className: 'hint', textContent: 'A caption helps readers, and helps Google find your photo.' })),
  );
  block.dataset.type = 'photo';
  block.dataset.id = id;
  block.append(blockControls(block));
  return block;
}

function galleryBlock(items) {
  const grid = el('div', { className: 'gallery-grid' });
  const block = el('div', { className: 'block block-gallery' }, el('p', { className: 'block-label', textContent: 'Group of photos, shown side by side' }), grid);
  block.dataset.type = 'gallery';
  for (const it of items) {
    const caps = el('input', { className: 'caption', value: it.caption || '', placeholder: 'Caption (optional)' });
    caps.addEventListener('input', changed);
    const item = el('div', { className: 'gallery-item' }, el('img', { src: photos[it.id]?.thumb || '', alt: '' }), caps);
    item.dataset.id = it.id;
    item.append(button('Remove photo', () => {
      if (!confirm('Remove this photo from the story?')) return;
      item.remove();
      if (!grid.children.length) block.remove();
      changed();
    }, 'btn btn-small btn-quiet-danger'));
    grid.append(item);
  }
  block.append(blockControls(block));
  return block;
}

function serialize() {
  return [...blocksEl.children].map((b) => {
    if (b.dataset.type === 'text') return { type: 'text', html: b.querySelector('.rte').innerHTML };
    if (b.dataset.type === 'photo') return { type: 'photo', id: +b.dataset.id, caption: b.querySelector('.caption').value };
    if (b.dataset.type === 'gallery') {
      return { type: 'gallery', items: [...b.querySelectorAll('.gallery-item')].map((i) => ({ id: +i.dataset.id, caption: i.querySelector('.caption').value })) };
    }
    return null;
  }).filter(Boolean);
}

function photoIdsInStory() {
  return [...blocksEl.querySelectorAll('[data-id]')].map((n) => +n.dataset.id);
}

/* ---------- Pasting text from Word or email ---------- */

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function onPaste(e) {
  e.preventDefault();
  const text = e.clipboardData.getData('text/plain').replace(/\r\n/g, '\n');
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (paras.length <= 1) {
    document.execCommand('insertText', false, text);
  } else {
    document.execCommand('insertHTML', false, paras.map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join(''));
  }
  changed();
}

/* ---------- Remember where the cursor is, so photos go there ---------- */

document.addEventListener('selectionchange', () => {
  const node = document.getSelection()?.anchorNode;
  const rte = node && (node.nodeType === 1 ? node : node.parentElement)?.closest('.rte');
  if (!rte) return;
  let child = node;
  while (child && child.parentNode !== rte) child = child.parentNode;
  caret = { block: rte.closest('.block'), child: child === rte ? null : child };
});
blocksEl.addEventListener('focusin', (e) => {
  if (!e.target.closest('.rte')) caret = { block: e.target.closest('.block'), child: null };
});

/** Splits the text at the cursor (if needed) and returns the block that new photos go after. */
function insertionPoint() {
  if (!caret || !caret.block?.isConnected) return blocksEl.lastElementChild;
  const { block, child } = caret;
  if (block.dataset.type !== 'text' || !child) return block;
  const rest = [];
  for (let n = child.nextSibling; n; n = n.nextSibling) rest.push(n);
  if (!rest.some((n) => n.textContent.trim())) return block;
  const tail = textBlock('');
  const rte = tail.querySelector('.rte');
  rte.innerHTML = '';
  rte.append(...rest);
  block.after(tail);
  return block;
}

/* ---------- Photos ---------- */

async function shrink(file) {
  // Big camera photos are made smaller here first, so they upload quickly.
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const canvas = el('canvas', { width: Math.round(bmp.width * scale), height: Math.round(bmp.height * scale) });
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
    return blob || file;
  } catch {
    return file;
  }
}

async function uploadOne(file) {
  const form = new FormData();
  form.append('photo', await shrink(file), 'photo.jpg');
  form.append('name', file.name);
  const res = await fetch('/admin/?do=upload', { method: 'POST', body: form, headers: { 'X-CSRF': data.csrf, Accept: 'application/json' } });
  const json = await res.json().catch(() => ({ error: 'The website did not answer. Please check the internet connection and try again.' }));
  if (!res.ok || json.error) throw new Error(json.error || 'The photo could not be uploaded.');
  photos[json.id] = { thumb: json.thumb, large: json.large };
  return json;
}

async function addPhotos(files) {
  files = [...files].filter((f) => f.type.startsWith('image/'));
  if (!files.length) return;
  let after = insertionPoint();
  for (const [i, file] of files.entries()) {
    const holder = el('div', { className: 'block block-uploading', textContent: `Uploading photo ${i + 1} of ${files.length}: ${file.name} …` });
    after ? after.after(holder) : blocksEl.append(holder);
    after = holder;
    if (i === 0) holder.scrollIntoView({ block: 'center', behavior: 'smooth' });
    try {
      const photo = await uploadOne(file);
      const block = photoBlock(photo.id, '');
      holder.replaceWith(block);
      after = block;
    } catch (err) {
      holder.className = 'block block-error';
      holder.textContent = `“${file.name}” could not be added: ${err.message} `;
      holder.append(button('OK', () => holder.remove()));
    }
  }
  changed();
}

$('add-photos').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', (e) => { addPhotos(e.target.files); e.target.value = ''; });
$('add-text').addEventListener('click', () => {
  const block = textBlock('');
  blocksEl.append(block);
  block.querySelector('.rte').focus();
  changed();
});

const editorCard = blocksEl.closest('.card');
editorCard.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); editorCard.classList.add('dropping'); } });
editorCard.addEventListener('dragleave', () => editorCard.classList.remove('dropping'));
editorCard.addEventListener('drop', (e) => {
  if (!e.dataTransfer.files.length) return;
  e.preventDefault();
  editorCard.classList.remove('dropping');
  addPhotos(e.dataTransfer.files);
});

/* ---------- Cover photo ---------- */

function renderCoverChoices() {
  const ids = [...new Set([...photoIdsInStory(), ...(state.coverId ? [state.coverId] : [])])].filter((id) => photos[id]);
  const box = $('cover-choices');
  box.innerHTML = '';
  if (!ids.length) {
    box.append(el('p', { className: 'hint', textContent: 'Add photos to your story first. The first photo becomes the cover unless you choose another.' }));
    return;
  }
  const chosen = ids.includes(state.coverId) ? state.coverId : ids[0];
  for (const id of ids) {
    const b = el('button', { type: 'button', className: 'cover-choice' + (id === chosen ? ' chosen' : '') }, el('img', { src: photos[id].thumb, alt: '', loading: 'lazy' }));
    if (id === chosen) b.append(el('span', { textContent: '✓ Cover' }));
    b.setAttribute('aria-pressed', String(id === chosen));
    b.addEventListener('click', () => { state.coverId = id; renderCoverChoices(); changed(); });
    box.append(b);
  }
}

/* ---------- Country and trip ---------- */

function fillSelect(select, options, selected, newLabel, placeholder) {
  select.innerHTML = '';
  if (placeholder) select.append(el('option', { value: '', textContent: placeholder }));
  for (const o of options) select.append(el('option', { value: o.id, textContent: o.name, selected: String(o.id) === String(selected) }));
  select.append(el('option', { value: 'new', textContent: newLabel }));
}

function fillTrips(selected) {
  const destId = $('destination').value;
  const trips = data.trips.filter((t) => String(t.destination_id) === destId);
  const choice = selected ?? (trips.length === 1 ? trips[0].id : null);
  fillSelect($('trip'), trips, choice, '+ Start a new trip…', trips.length ? 'Choose a trip…' : '— same as country —');
  $('new-trip-wrap').hidden = $('trip').value !== 'new';
}

$('destination').addEventListener('change', () => {
  $('new-destination-wrap').hidden = $('destination').value !== 'new';
  if ($('destination').value === 'new') $('new-destination').focus();
  fillTrips();
  changed();
});
$('trip').addEventListener('change', () => {
  $('new-trip-wrap').hidden = $('trip').value !== 'new';
  if ($('trip').value === 'new') $('new-trip').focus();
  changed();
});

/* ---------- How it looks on Google ---------- */

function storyStartText() {
  const first = blocksEl.querySelector('.rte');
  return first ? first.textContent.replace(/\s+/g, ' ').trim() : '';
}

function countHint(id, length, ideal, note = '') {
  const hint = $(id);
  hint.textContent = length ? `${length} letters${note} — best under ${ideal}` : '';
  hint.classList.toggle('too-long', length > ideal);
}

function updateSerp() {
  const title = $('seo-title').value.trim() || $('title').value.trim() || 'Untitled story';
  const desc = $('seo-description').value.trim() || $('summary').value.trim() || storyStartText();
  const slug = state.slug || title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
  $('serp-url').textContent = `bhupendergupta.com › ${slug}`;
  $('serp-title').textContent = `${title} | Bhupender Gupta`.slice(0, 70) + (`${title} | Bhupender Gupta`.length > 70 ? '…' : '');
  $('serp-desc').textContent = desc.length > 158 ? desc.slice(0, 155) + '…' : desc;
  $('seo-title').placeholder = $('title').value.trim();
  $('seo-description').placeholder = ($('summary').value.trim() || storyStartText()).slice(0, 155);
  const own = $('seo-title').value.trim();
  countHint('seo-title-count', own ? `${own} | Bhupender Gupta`.length : 0, 65, ' with “| Bhupender Gupta”');
  countHint('seo-description-count', $('seo-description').value.trim().length, 155);
}

/* ---------- Saving ---------- */

function payload(status) {
  const dest = $('destination').value;
  const trip = $('trip').value;
  return {
    id: state.id,
    status,
    title: $('title').value,
    destination_id: dest === 'new' ? null : dest || null,
    new_destination: dest === 'new' ? $('new-destination').value : '',
    trip_id: trip === 'new' ? null : trip || null,
    new_trip: trip === 'new' ? $('new-trip').value : '',
    is_wildlife: document.querySelector('input[name=wildlife]:checked').value === '1',
    published_on: $('date').value,
    summary: $('summary').value,
    seo_title: $('seo-title').value,
    seo_description: $('seo-description').value,
    cover_photo_id: state.coverId,
    body: serialize(),
  };
}

function setStatus(text, kind = '') {
  $('status').textContent = text;
  $('status').className = 'status ' + kind;
}

function showMessage(title, text, actions) {
  $('message-title').textContent = title;
  $('message-text').textContent = text;
  const box = $('message-actions');
  box.innerHTML = '';
  for (const [label, action, cls] of actions) {
    box.append(button(label, () => { $('message').close(); action?.(); }, 'btn ' + (cls || 'btn-secondary')));
  }
  $('message').showModal();
}

function updateButtons() {
  const live = state.status === 'published';
  $('save-draft').textContent = live ? 'Hide from website' : 'Save as draft';
  $('publish').textContent = live ? 'Save changes' : 'Publish to website';
}

function changed() {
  state.dirty = true;
  setStatus(state.status === 'published' ? 'You have changes that are not saved yet' : 'Not saved yet', 'warn');
  clearTimeout(changed.cover);
  changed.cover = setTimeout(() => { renderCoverChoices(); updateSerp(); }, 300);
}

async function save(status, { quiet = false } = {}) {
  if (state.saving) return false;
  state.saving = true;
  setStatus('Saving…');
  try {
    const res = await fetch('/admin/?do=save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF': data.csrf },
      body: JSON.stringify(payload(status)),
    });
    const json = await res.json().catch(() => ({ error: 'The website did not answer. Please check the internet connection and try again.' }));
    if (!res.ok || json.error) throw new Error(json.error || 'Something went wrong while saving.');

    const wasLive = state.status === 'published';
    state.id = json.id;
    state.status = json.status;
    state.dirty = false;
    state.url = json.url;
    state.slug = json.slug;
    data.destinations = json.options.destinations;
    data.trips = json.options.trips;
    fillSelect($('destination'), data.destinations, json.destination_id, '+ Add a new country…', 'Choose a country…');
    $('new-destination-wrap').hidden = true;
    $('new-destination').value = '';
    fillTrips(json.trip_id);
    $('new-trip').value = '';
    history.replaceState(null, '', `editor.html?id=${json.id}`);
    updateButtons();
    setStatus((status === 'published' ? 'Saved — on the website' : quiet ? 'Draft saved automatically' : 'Draft saved') + ` at ${json.saved_at}`, 'ok');

    if (!quiet) {
      if (status === 'published' && !wasLive) {
        showMessage('Your story is on the website', 'Well done! Readers can now see it on the home page.', [
          ['View the story', () => window.open(json.url, '_blank'), 'btn-primary'],
          ['Back to my stories', () => { location.href = 'stories.html'; }],
          ['Keep editing'],
        ]);
      } else if (status === 'draft' && wasLive) {
        showMessage('Hidden from the website', 'The story is saved as a draft. Readers cannot see it until you press “Publish to website” again.', [['OK', null, 'btn-primary']]);
      }
    }
    return true;
  } catch (err) {
    setStatus('Not saved', 'error');
    if (!quiet) showMessage('Not saved', err.message, [['OK', null, 'btn-primary']]);
    return false;
  } finally {
    state.saving = false;
  }
}

$('publish').addEventListener('click', () => save('published'));
$('save-draft').addEventListener('click', () => {
  if (state.status === 'published' && !confirm('Take this story off the website? You can publish it again at any time.')) return;
  save('draft');
});
$('preview').addEventListener('click', () => {
  const form = el('form', { method: 'post', action: '/admin/?do=preview', target: '_blank' },
    el('input', { type: 'hidden', name: 'csrf', value: data.csrf }),
    el('input', { type: 'hidden', name: 'payload', value: JSON.stringify(payload(state.status)) }));
  document.body.append(form);
  form.submit();
  form.remove();
});

// Drafts save themselves every half minute, so nothing is lost if the computer is closed.
setInterval(() => {
  const hasSomething = $('title').value.trim() || photoIdsInStory().length || blocksEl.textContent.trim();
  if (state.dirty && state.status !== 'published' && hasSomething) save('draft', { quiet: true });
}, 30000);

window.addEventListener('beforeunload', (e) => {
  if (state.dirty) e.preventDefault();
});

/* ---------- Start ---------- */

const post = data.post;
$('title').value = post?.title ?? '';
fillSelect($('destination'), data.destinations, post?.destination_id, '+ Add a new country…', 'Choose a country…');
fillTrips(post?.trip_id);
document.querySelector(`input[name=wildlife][value="${post?.is_wildlife ? 1 : 0}"]`).checked = true;
$('date').value = post?.published_on ?? data.today;
$('summary').value = post?.summary ?? '';
$('seo-title').value = post?.seo_title ?? '';
$('seo-description').value = post?.seo_description ?? '';
state.slug = post?.slug ?? null;

for (const b of post?.blocks ?? []) {
  if (b.type === 'text') blocksEl.append(textBlock(b.html));
  if (b.type === 'photo') blocksEl.append(photoBlock(b.id, b.caption));
  if (b.type === 'gallery') blocksEl.append(galleryBlock(b.items));
}
if (!blocksEl.children.length) blocksEl.append(textBlock(''));

for (const id of ['title', 'new-destination', 'new-trip', 'date', 'summary', 'seo-title', 'seo-description']) $(id).addEventListener('input', changed);
document.querySelectorAll('input[name=wildlife]').forEach((r) => r.addEventListener('change', changed));

updateButtons();
renderCoverChoices();
updateSerp();
setStatus(post ? (post.status === 'published' ? 'This story is on the website' : 'Draft — not on the website yet') : 'Not saved yet');
if (!post) $('title').focus();
