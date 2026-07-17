// CDP browser navigation tool - navigate and screenshot
import http from 'http';

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:9225${path}`, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch(e) { resolve(d); }
      });
    }).on('error', reject);
  });
}

async function main() {
  // List targets
  const targets = await get('/json');
  console.log('CDP targets:', targets.map(t => ({id: t.id, url: t.url, title: t.title})));

  // Find the browser page (not the vibeide renderer UI)
  const page = targets.find(t => t.url.startsWith('http') || t.url.startsWith('https'));
  if (!page) {
    console.log('No browser page found, using first page');
    const first = targets[0];
    console.log('Page:', first?.url);
  } else {
    console.log('Active page:', page.url);
  }
}

main().catch(e => console.error('Error:', e.message));
