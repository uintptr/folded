// background/background.js
// Injects saved CSS/JS into matching tabs on page load.
// Depends on shared/utils.js and shared/storage.js (loaded before this in manifest).

// Inject a rule's CSS and JS into a tab.
async function injectRule(tabId, rule) {
  if (!rule.enabled) return;

  if (rule.css) {
    try {
      await browser.tabs.insertCSS(tabId, { code: rule.css, runAt: 'document_start' });
    } catch (e) {
      console.warn('[Folded] insertCSS failed for tab', tabId, e.message);
    }
  }

  if (rule.js) {
    try {
      await browser.tabs.executeScript(tabId, { code: `(function(){try{${rule.js}}catch(e){console.warn('[Folded] injected JS error:', e)}})()`, runAt: 'document_idle' });
    } catch (e) {
      console.warn('[Folded] executeScript failed for tab', tabId, e.message);
    }
  }
}

// Apply rules to a tab by URL.
async function applyRulesToTab(tabId, url) {
  const hostname = hostnameFromUrl(url);
  if (!hostname) return;
  const rule = await getRule(hostname);
  if (rule) await injectRule(tabId, rule);
}

// Listen for tab navigation completing.
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    applyRulesToTab(tabId, tab.url);
  }
});

// Handle messages from popup (save rule → re-inject into matching open tabs).
browser.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'RULE_SAVED') {
    browser.tabs.query({}).then(tabs => {
      for (const tab of tabs) {
        if (tab.url && hostnameFromUrl(tab.url) === message.hostname) {
          browser.tabs.reload(tab.id);
        }
      }
    });
  }
});

// Open popup as a persistent window so it stays open when the user clicks away.
let popupWindowId = null;

browser.browserAction.onClicked.addListener(async (tab) => {
  if (popupWindowId !== null) {
    try {
      await browser.windows.update(popupWindowId, { focused: true });
      return;
    } catch {
      popupWindowId = null; // window was closed
    }
  }

  const win = await browser.windows.create({
    url:    browser.runtime.getURL(`popup/popup.html?tabId=${tab.id}`),
    type:   'popup',
    width:  420,
    height: 260,
  });
  popupWindowId = win.id;
});

browser.windows.onRemoved.addListener((windowId) => {
  if (windowId === popupWindowId) popupWindowId = null;
});

// Init.
