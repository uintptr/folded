// content/content-bridge.js
// Injected into every page at document_start.
// Handles preview messages from the popup and DOM snapshot collection.

if (!window.__folded_injected) {
  window.__folded_injected = true;

  function applyPreviewCSS(css) {
    let el = document.getElementById('folded-preview-css');
    if (!el) {
      el = document.createElement('style');
      el.id = 'folded-preview-css';
      document.documentElement.appendChild(el);
    }
    el.textContent = css;
  }

  function applyPreviewJS(js) {
    try {
      // eslint-disable-next-line no-new-func
      (new Function(js))();
    } catch (e) {
      console.warn('[Folded] preview JS error:', e);
    }
  }

  function discardPreview() {
    const el = document.getElementById('folded-preview-css');
    if (el) el.remove();
  }

  function collectSnapshot() {
    const MAX_ELEMENTS = 200;
    const MAX_CHARS    = 2000;
    const elements     = Array.from(document.querySelectorAll('*')).slice(0, MAX_ELEMENTS);
    const lines        = [];

    for (const el of elements) {
      let depth = 0;
      let node  = el.parentElement;
      while (node && depth < 6) { depth++; node = node.parentElement; }

      const tag     = el.tagName.toLowerCase();
      const id      = el.id ? `#${el.id}` : '';
      const classes = el.classList.length
        ? '.' + Array.from(el.classList).slice(0, 3).join('.')
        : '';

      lines.push('  '.repeat(depth) + tag + id + classes);
    }

    return lines.join('\n').slice(0, MAX_CHARS);
  }

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case 'PREVIEW_CSS':
        applyPreviewCSS(message.css);
        break;
      case 'PREVIEW_JS':
        applyPreviewJS(message.js);
        break;
      case 'DISCARD_PREVIEW':
        discardPreview();
        break;
      case 'GET_SNAPSHOT':
        sendResponse({ snapshot: collectSnapshot() });
        break;
    }
  });
}
