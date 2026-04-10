// options/options.js

let currentHostname = null;

// --- Helpers ---

function $(id) { return document.getElementById(id); }

function showEditor(show) {
  $('editor-empty').classList.toggle('hidden', show);
  $('editor-form').classList.toggle('hidden', !show);
}

function showToast(msg, type = '') {
  const el = $('toast');
  el.textContent = msg;
  el.className = 'toast' + (type ? ' ' + type : '');
  el.classList.remove('hidden');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add('hidden'), 2000);
}

// --- Rule list rendering ---

async function loadRules() {
  const result = await browser.storage.local.get('folded_rules');
  return result.folded_rules || {};
}

async function renderList() {
  const rules = await loadRules();
  const list  = $('rule-list');
  list.innerHTML = '';

  for (const [hostname, rule] of Object.entries(rules)) {
    const li = document.createElement('li');
    li.dataset.hostname = hostname;
    li.classList.toggle('enabled', rule.enabled);
    if (hostname === currentHostname) li.classList.add('active');

    const dot = document.createElement('span');
    dot.className = 'dot';

    const label = document.createElement('span');
    label.textContent = rule.label || hostname;

    li.appendChild(dot);
    li.appendChild(label);
    li.addEventListener('click', () => selectRule(hostname, rule));
    list.appendChild(li);
  }
}

function selectRule(hostname, rule) {
  currentHostname = hostname;
  resetDeleteBtn();
  showEditor(true);
  $('field-hostname').value   = hostname;
  $('field-enabled').checked  = rule.enabled;
  $('field-css').value        = rule.css || '';
  $('field-js').value         = rule.js  || '';
  renderList();
}

// --- Save / Delete ---

async function saveCurrentRule() {
  if (!currentHostname) return;
  const rules   = await loadRules();
  const existing = rules[currentHostname] || {};
  const updated  = {
    ...existing,
    hostname:  currentHostname,
    label:     existing.label || currentHostname,
    enabled:   $('field-enabled').checked,
    css:       $('field-css').value,
    js:        $('field-js').value,
    updatedAt: Date.now(),
  };
  rules[currentHostname] = updated;
  await browser.storage.local.set({ folded_rules: rules });
  browser.runtime.sendMessage({ type: 'RULE_SAVED', hostname: currentHostname, rule: updated });

  showToast('Rule saved', 'success');
  renderList();
}

function resetDeleteBtn() {
  const btn = $('btn-delete-rule');
  btn.textContent = 'Delete';
  btn.classList.remove('btn-danger-confirm');
  delete btn.dataset.confirming;
  clearTimeout(btn._timer);
}

async function deleteCurrentRule() {
  if (!currentHostname) return;
  const btn = $('btn-delete-rule');

  if (btn.dataset.confirming) {
    // Second click — actually delete
    resetDeleteBtn();
    const rules = await loadRules();
    delete rules[currentHostname];
    await browser.storage.local.set({ folded_rules: rules });
    currentHostname = null;
    showEditor(false);
    renderList();
  } else {
    // First click — ask for confirmation
    btn.textContent = 'Confirm delete?';
    btn.dataset.confirming = '1';
    btn._timer = setTimeout(resetDeleteBtn, 3000);
  }
}

// --- Add site (inline form) ---

function addSite() {
  $('btn-add').classList.add('hidden');
  $('add-site-form').classList.remove('hidden');
  $('new-hostname').value = '';
  $('new-hostname').focus();
}

function confirmAddSite() {
  const raw   = $('new-hostname').value.trim();
  const clean = raw.replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();
  if (!clean) return;
  hideAddForm();
  currentHostname = clean;
  showEditor(true);
  $('field-hostname').value  = clean;
  $('field-enabled').checked = true;
  $('field-css').value       = '';
  $('field-js').value        = '';
  renderList();
}

function cancelAddSite() {
  hideAddForm();
}

function hideAddForm() {
  $('btn-add').classList.remove('hidden');
  $('add-site-form').classList.add('hidden');
}

// --- Export / Import ---

async function exportRules() {
  const rules = await loadRules();
  const blob  = new Blob([JSON.stringify(rules, null, 2)], { type: 'application/json' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href      = url;
  a.download  = 'folded-rules.json';
  a.click();
  URL.revokeObjectURL(url);
}

async function importRules(file) {
  const text = await file.text();
  let incoming;
  try {
    incoming = JSON.parse(text);
  } catch {
    showToast('Invalid JSON file');
    return;
  }
  const rules = await loadRules();
  let conflicts = 0;
  for (const [hostname, rule] of Object.entries(incoming)) {
    if (rules[hostname]) conflicts++;
    rules[hostname] = { ...rules[hostname], ...rule, hostname };
  }
  await browser.storage.local.set({ folded_rules: rules });
  showToast(conflicts > 0 ? `Imported (${conflicts} merged)` : 'Imported', 'success');
  renderList();
}

// --- API Key ---

async function loadApiKey() {
  const result = await browser.storage.local.get('folded_api_key');
  const key    = result.folded_api_key;
  if (key) {
    $('field-api-key').placeholder = key.slice(0, 14) + '••••••••';
    $('key-status').textContent    = 'Key saved';
  }
}

async function saveApiKey() {
  const val = $('field-api-key').value.trim();
  if (!val) return;
  await browser.storage.local.set({ folded_api_key: val });
  $('field-api-key').value       = '';
  $('field-api-key').placeholder = val.slice(0, 14) + '••••••••';
  $('key-status').textContent    = 'Saved!';
  setTimeout(() => { $('key-status').textContent = 'Key saved'; }, 2000);
}

// --- Init ---

document.addEventListener('DOMContentLoaded', () => {
  renderList();
  loadApiKey();

  $('btn-add').addEventListener('click', addSite);
  $('btn-add-confirm').addEventListener('click', confirmAddSite);
  $('btn-add-cancel').addEventListener('click', cancelAddSite);
  $('new-hostname').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmAddSite();
    if (e.key === 'Escape') cancelAddSite();
  });

  $('btn-save-rule').addEventListener('click', saveCurrentRule);
  $('btn-delete-rule').addEventListener('click', deleteCurrentRule);
  $('btn-export').addEventListener('click', exportRules);
  $('btn-import').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', (e) => {
    if (e.target.files[0]) importRules(e.target.files[0]);
  });
  $('btn-save-key').addEventListener('click', saveApiKey);
  $('field-api-key').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveApiKey();
  });
});
