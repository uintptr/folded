# Folded

A Firefox extension that lets you customize any website with natural language. Describe what you want to change, and Folded uses Claude to generate and inject the CSS and JavaScript for you.

## How it works

1. Click the Folded toolbar button on any page.
2. Describe the change you want (e.g. "hide the sidebar", "make the font larger", "remove ads").
3. Folded sends a snapshot of the page's DOM structure to Claude, which returns the CSS and/or JavaScript needed.
4. Preview the change, then accept or discard it.

Accepted customizations are saved per-hostname and re-applied automatically on future visits. You can view, edit, and delete rules from the extension's settings page.

## Setup

1. Install from [Firefox Add-ons](https://addons.mozilla.org) or load as a temporary extension via `about:debugging`.
2. Open the extension settings and paste your [Anthropic API key](https://console.anthropic.com).

Your API key is stored locally in browser storage and is only ever sent directly to `api.anthropic.com` — it is never exposed to any web page.

## Requirements

- Firefox
- An Anthropic API key

## License

MIT — see [LICENSE](LICENSE).
