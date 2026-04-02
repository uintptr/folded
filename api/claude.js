// api/claude.js
// Calls the Claude API to generate CSS/JS from a natural language prompt.
// Runs in the popup context (no CORS restrictions, API key never exposed to page).

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL          = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `You are a browser customization assistant. The user wants to modify how a specific website looks or behaves using injected CSS and JavaScript.

Rules:
- Respond with ONLY a CSS code block and/or a JavaScript code block. No prose, no explanation.
- CSS goes in a \`\`\`css block. JavaScript goes in a \`\`\`javascript block.
- If only CSS is needed, omit the JavaScript block and vice versa.
- CSS must use !important where needed to override site styles.
- JavaScript must be safe. Wrap everything in an IIFE: (function() { ... })();
- Do not use document.write(). Do not modify window.location. Do not make network requests.
- Selectors must match the real page structure. Use the DOM snapshot provided.
- If the request cannot be fulfilled safely, respond with: CANNOT_FULFILL: <one sentence reason>`;

function buildUserMessage({ pageUrl, pageTitle, domSnapshot, userPrompt }) {
  let hostname = '';
  try { hostname = new URL(pageUrl).hostname; } catch {}

  return `Website: ${hostname}
URL: ${pageUrl}
Page title: ${pageTitle || '(unknown)'}

DOM snapshot (top elements, id/class only):
${domSnapshot || '(not available)'}

User request: ${userPrompt}`;
}

function parseBlocks(text) {
  const cssMatch = text.match(/```css\n([\s\S]*?)```/);
  const jsMatch  = text.match(/```(?:javascript|js)\n([\s\S]*?)```/);
  return {
    css: cssMatch ? cssMatch[1].trim() : '',
    js:  jsMatch  ? jsMatch[1].trim()  : '',
  };
}

/**
 * Generate CSS/JS customization via Claude.
 *
 * @param {object} opts
 * @param {string}   opts.apiKey     - Anthropic API key
 * @param {string}   opts.pageUrl    - Current page URL
 * @param {string}   opts.pageTitle  - Current page title
 * @param {string}   opts.domSnapshot- Compact DOM snapshot string
 * @param {string}   opts.userPrompt - Natural language request
 * @param {function} opts.onChunk    - Called with each streamed text delta
 * @param {AbortSignal} [opts.signal]- Optional AbortSignal to cancel
 *
 * @returns {Promise<{css: string, js: string, rawText: string}>}
 */
async function generateCustomization({ apiKey, pageUrl, pageTitle, domSnapshot, userPrompt, onChunk, signal }) {
  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type':                         'application/json',
      'x-api-key':                            apiKey,
      'anthropic-version':                    '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: 8192,
      stream:     true,
      system:     SYSTEM_PROMPT,
      messages: [
        {
          role:    'user',
          content: buildUserMessage({ pageUrl, pageTitle, domSnapshot, userPrompt }),
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 401) throw new Error('Invalid API key. Check your key in Settings.');
    if (response.status === 429) throw new Error('Rate limit reached. Please wait a moment and try again.');
    throw new Error(`API error ${response.status}: ${body}`);
  }

  // Stream the response.
  const reader  = response.body.getReader();
  const decoder = new TextDecoder();
  let rawText   = '';
  let buffer    = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep incomplete line in buffer

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') break;

      let event;
      try { event = JSON.parse(data); } catch { continue; }

      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        const chunk = event.delta.text;
        rawText += chunk;
        if (onChunk) onChunk(chunk);
      }

      if (event.type === 'message_stop') break;
    }
  }

  if (rawText.startsWith('CANNOT_FULFILL:')) {
    const reason = rawText.replace('CANNOT_FULFILL:', '').trim();
    throw new Error(`Cannot fulfill: ${reason}`);
  }

  const blocks = parseBlocks(rawText);
  if (!blocks.css && !blocks.js) {
    const err = new Error('Unexpected response — no CSS or JS blocks found.');
    err.rawText = rawText;
    throw err;
  }

  return { ...blocks, rawText };
}
