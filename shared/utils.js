// shared/utils.js
// Loaded as a plain script in background and imported via <script> in pages.

function hostnameFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function matchesHostname(rule, hostname) {
  return rule.hostname === hostname;
}

function ruleId(hostname) {
  return hostname;
}
