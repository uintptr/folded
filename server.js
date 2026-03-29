const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;
const REDDIT = 'https://old.reddit.com';

// Serve our CSS
app.use('/folded.css', express.static(path.join(__dirname, 'content.css')));

// Forward both GET and POST through the proxy
app.use(express.urlencoded({ extended: true }));

async function proxyRequest(req, res) {
  const targetUrl = REDDIT + req.url;

  try {
    const response = await axios({
      method: req.method,
      url: targetUrl,
      data: req.method === 'POST' ? req.body : undefined,
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0',
        'Accept': req.headers['accept'] || 'text/html',
        'Accept-Language': req.headers['accept-language'] || 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate',
        'Cookie': req.headers['cookie'] || '',
        'Referer': req.headers['referer']
          ? req.headers['referer'].replace(/http:\/\/localhost:\d+/, REDDIT)
          : undefined,
      },
      responseType: 'arraybuffer',
      maxRedirects: 0, // handle redirects manually so we can rewrite Location
      validateStatus: () => true,
    });

    const contentType = response.headers['content-type'] || '';

    // Forward cookies
    if (response.headers['set-cookie']) {
      res.setHeader(
        'Set-Cookie',
        response.headers['set-cookie'].map(c => c.replace(/Domain=[^;]+;?/gi, ''))
      );
    }

    // Rewrite redirect Location headers
    if (response.status >= 300 && response.status < 400 && response.headers['location']) {
      const loc = response.headers['location']
        .replace(/https?:\/\/(old\.|www\.)?reddit\.com/g, '');
      return res.redirect(response.status, loc || '/');
    }

    // Only rewrite HTML — pass everything else (images, JSON, JS, CSS) straight through
    if (!contentType.includes('text/html')) {
      res.setHeader('Content-Type', contentType);
      return res.status(response.status).send(response.data);
    }

    const html = response.data.toString('utf-8');
    const $ = cheerio.load(html);

    // Inject our stylesheet last so it wins over Reddit's styles
    $('head').append('<link rel="stylesheet" href="/folded.css">');

    // Rewrite all Reddit links to stay on the proxy
    $('a[href], form[action], link[href]').each((_, el) => {
      const attr = el.tagName === 'form' ? 'action' : 'href';
      const val = $(el).attr(attr);
      if (val) {
        $(el).attr(attr,
          val.replace(/https?:\/\/(old\.|www\.)?reddit\.com/g, '')
        );
      }
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(response.status).send($.html());

  } catch (err) {
    console.error('Proxy error:', err.message);
    res.status(502).send(`<pre>Proxy error: ${err.message}</pre>`);
  }
}

app.get('*', proxyRequest);
app.post('*', proxyRequest);

app.listen(PORT, () => {
  console.log(`Folded proxy → http://localhost:${PORT}`);
});
