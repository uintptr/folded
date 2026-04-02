// popup/popup.js

let currentTab      = null;
let generatedCSS    = '';
let generatedJS     = '';
let abortController = null;

function $(id) { return document.getElementById(id); }

// --- State machine ---

function setState(name) {
  for (const s of ['idle', 'generating', 'review']) {
    $(`state-${s}`).classList.toggle('hidden', s !== name);
  }
  if (name === 'idle') clearError();
}

// --- Inline error display ---

function showError(msg) {
  const el = $('error-msg');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function clearError() {
  const el = $('error-msg');
  if (el) { el.textContent = ''; el.classList.add('hidden'); }
}

// --- Snapshot ---

async function getSnapshot(tabId) {
  try {
    const response = await browser.tabs.sendMessage(tabId, { type: 'GET_SNAPSHOT' });
    return response?.snapshot || '';
  } catch {
    return '';
  }
}

// --- Generate ---

async function onGenerate() {
  clearError();

  const prompt = $('prompt').value.trim();
  if (!prompt) {
    showError('Please describe what you want to change.');
    return;
  }

  const apiKey = await browser.storage.local.get('folded_api_key')
    .then(r => r.folded_api_key || null);

  if (!apiKey) {
    $('no-key-warning').classList.remove('hidden');
    return;
  }

  const domSnapshot = await getSnapshot(currentTab.id);

  setState('generating');
  $('stream-output').textContent = '';
  generatedCSS = '';
  generatedJS  = '';

  abortController = new AbortController();

  let rawText = '';

  try {
    const result = await generateCustomization({
      apiKey,
      pageUrl:    currentTab.url,
      pageTitle:  currentTab.title,
      domSnapshot,
      userPrompt: prompt,
      signal:     abortController.signal,
      onChunk(chunk) {
        rawText += chunk;
        $('stream-output').textContent = rawText;

        // Live-preview CSS as it streams in.
        const cssMatch = rawText.match(/```css\n([\s\S]*?)```/);
        if (cssMatch) {
          browser.tabs.sendMessage(currentTab.id, {
            type: 'PREVIEW_CSS',
            css:  cssMatch[1].trim(),
          });
        }
      },
    });

    generatedCSS = result.css;
    generatedJS  = result.js;

    if (generatedCSS) {
      browser.tabs.sendMessage(currentTab.id, { type: 'PREVIEW_CSS', css: generatedCSS });
    }
    if (generatedJS) {
      browser.tabs.sendMessage(currentTab.id, { type: 'PREVIEW_JS', js: generatedJS });
    }

    setState('review');
  } catch (err) {
    if (err.name === 'AbortError') {
      browser.tabs.sendMessage(currentTab.id, { type: 'DISCARD_PREVIEW' });
      setState('idle');
      return;
    }
    setState('idle');
    if (err.rawText) console.log('[Folded] raw API response:', err.rawText);
    showError(err.message);
  }
}

// --- Save ---

async function doSave(replaceExisting) {
  const hostname = new URL(currentTab.url).hostname;
  const rules    = await browser.storage.local.get('folded_rules')
    .then(r => r.folded_rules || {});

  const existing   = rules[hostname];
  const now        = Date.now();
  let   savedKey   = hostname;

  if (existing && !replaceExisting) {
    // Keep both: save under hostname + timestamp key.
    savedKey = `${hostname}__${now}`;
  }

  const rule = {
    id:        savedKey,
    hostname,
    label:     hostname,
    enabled:   true,
    css:       generatedCSS,
    js:        generatedJS,
    prompt:    $('prompt').value.trim(),
    createdAt: (existing && replaceExisting) ? existing.createdAt : now,
    updatedAt: now,
  };

  rules[savedKey] = rule;
  await browser.storage.local.set({ folded_rules: rules });
  browser.runtime.sendMessage({ type: 'RULE_SAVED', hostname, rule });

  $('prompt').value = '';
  setState('idle');
}

async function onSave() {
  const hostname = new URL(currentTab.url).hostname;
  const rules    = await browser.storage.local.get('folded_rules')
    .then(r => r.folded_rules || {});

  const existing = rules[hostname];
  if (existing) {
    generatedCSS = [existing.css, generatedCSS].filter(Boolean).join('\n\n');
    generatedJS  = [existing.js,  generatedJS ].filter(Boolean).join('\n\n');
  }

  await doSave(true);
}

// --- Discard ---

function onDiscard() {
  browser.tabs.sendMessage(currentTab.id, { type: 'DISCARD_PREVIEW' });
  setState('idle');
}

// --- Cancel ---

function onCancel() {
  if (abortController) abortController.abort();
}

// --- Init ---

document.addEventListener('DOMContentLoaded', async () => {
  const tabId = parseInt(new URLSearchParams(window.location.search).get('tabId'));
  currentTab  = tabId ? await browser.tabs.get(tabId) : null;
  if (!currentTab) { window.close(); return; }

  let hostname = '';
  try { hostname = new URL(tab.url).hostname; } catch {}
  $('hostname').textContent = hostname;

  const apiKey = await browser.storage.local.get('folded_api_key')
    .then(r => r.folded_api_key || null);
  if (!apiKey) {
    $('no-key-warning').classList.remove('hidden');
  }

  function openOptions(e) {
    e.preventDefault();
    browser.runtime.openOptionsPage();
    window.close();
  }

  $('open-options').addEventListener('click', openOptions);
  $('btn-settings').addEventListener('click', openOptions);

  $('btn-generate').addEventListener('click', onGenerate);
  $('btn-save').addEventListener('click', onSave);
  $('btn-discard').addEventListener('click', onDiscard);
  $('btn-cancel').addEventListener('click', onCancel);

window.addEventListener('unload', () => {
    const reviewing = !$('state-review').classList.contains('hidden');
    if (reviewing && currentTab) {
      browser.tabs.sendMessage(currentTab.id, { type: 'DISCARD_PREVIEW' });
    }
  });

  setState('idle');
});
