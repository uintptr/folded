// shared/storage.js
// Typed wrappers around browser.storage.local.
// Loaded as a plain script (no ES module syntax) so it works in background scripts.

const RULES_KEY = 'folded_rules';
const API_KEY   = 'folded_api_key';

async function getRules() {
  const result = await browser.storage.local.get(RULES_KEY);
  return result[RULES_KEY] || {};
}

async function getRule(hostname) {
  const rules = await getRules();
  return rules[hostname] || null;
}

async function saveRule({ hostname, label, css, js, prompt, enabled }) {
  const rules = await getRules();
  const now = Date.now();
  const existing = rules[hostname];
  rules[hostname] = {
    id:        hostname,
    hostname,
    label:     label || hostname,
    enabled:   enabled !== undefined ? enabled : true,
    css:       css || '',
    js:        js  || '',
    prompt:    prompt || '',
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
  };
  await browser.storage.local.set({ [RULES_KEY]: rules });
  return rules[hostname];
}

async function deleteRule(hostname) {
  const rules = await getRules();
  delete rules[hostname];
  await browser.storage.local.set({ [RULES_KEY]: rules });
}

async function setRuleEnabled(hostname, enabled) {
  const rules = await getRules();
  if (rules[hostname]) {
    rules[hostname].enabled = enabled;
    rules[hostname].updatedAt = Date.now();
    await browser.storage.local.set({ [RULES_KEY]: rules });
  }
}

async function getApiKey() {
  const result = await browser.storage.local.get(API_KEY);
  return result[API_KEY] || null;
}

async function setApiKey(key) {
  await browser.storage.local.set({ [API_KEY]: key });
}

async function clearApiKey() {
  await browser.storage.local.remove(API_KEY);
}
