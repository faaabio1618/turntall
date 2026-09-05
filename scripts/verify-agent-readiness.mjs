// Run against a preview server or the deployed site; exits nonzero on failure.
// Usage: node scripts/verify-agent-readiness.mjs https://turntall.com
const base = new URL(process.argv[2] || 'http://127.0.0.1:4174');
const pages = ['/', '/about', '/contact', '/privacy'];
const resources = {
  '/index.md': 'text/markdown',
  '/about/index.md': 'text/markdown',
  '/contact/index.md': 'text/markdown',
  '/privacy/index.md': 'text/markdown',
  '/agent-instructions.md': 'text/markdown',
  '/llms.txt': 'text/plain',
  '/robots.txt': 'text/plain',
  '/sitemap.xml': 'xml',
  '/og-image.png': 'image/png',
  '/favicon.svg': 'image/svg+xml',
  '/agent-pages.css': 'text/css',
  '/404.md': 'text/markdown',
  '/404.html': 'text/html',
};
let failures = 0;
function check(condition, message) {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${message}`);
  if (!condition) failures++;
}
async function fetchPath(path, accept, method = 'GET') {
  return fetch(new URL(path, base), { method, headers: { Accept: accept }, redirect: 'manual', signal: AbortSignal.timeout(15000) });
}
for (const path of pages) {
  // Alternate requests also expose cached representation mixups.
  for (const type of ['text/html', 'text/markdown', 'text/html']) {
    const response = await fetchPath(path, type);
    const body = await response.text();
    check(response.status === 200 && response.headers.get('content-type')?.includes(type), `${path} ${type}: status=${response.status}, type=${response.headers.get('content-type')}`);
    check(response.headers.get('vary')?.toLowerCase().split(/,\s*/).includes('accept'), `${path} Vary includes Accept`);
    const text = type === 'text/html' ? body.replace(/<head[\s\S]*?<\/head>/i, '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : body;
    check(text.length >= 500 && (type !== 'text/markdown' || /^# /.test(body)), `${path} meaningful ${type} content: ${text.length} characters`);
  }
}
for (const [path, mime] of Object.entries(resources)) {
  const response = await fetchPath(path, '*/*');
  check(response.status === 200 && response.headers.get('content-type')?.includes(mime), `${path}: status=${response.status}, type=${response.headers.get('content-type')}`);
}
for (const path of ['/agent-readiness-does-not-exist', '/agent-readiness-missing/', '/agent-readiness-missing.html', '/assets/agent-readiness-missing.js']) {
  for (const method of ['GET', 'HEAD']) {
    const response = await fetchPath(path, 'text/markdown', method);
    check(response.status === 404, `${method} ${path}: status=${response.status}`);
    if (method === 'GET') check((await response.text()).includes('https://turntall.com/llms.txt'), `${path} provides discovery links`);
  }
}
const unsupported = await fetchPath('/', 'application/json');
check(unsupported.status === 406, `unsupported Accept: status=${unsupported.status}`);
console.log(`${failures} failed checks on ${base.origin}`);
process.exitCode = failures ? 1 : 0;
