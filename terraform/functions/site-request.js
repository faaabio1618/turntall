// CloudFront Functions runtime 2.0. Also executed by Vite and the route tests.
function splitOutsideQuotes(value, delimiter) {
  var parts = [];
  var current = '';
  var quoted = false;
  for (var index = 0; index < value.length; index++) {
    var character = value.charAt(index);
    if (character === '"') {
      quoted = !quoted;
      current += character;
    } else if (character === delimiter && !quoted) {
      parts.push(current);
      current = '';
    } else {
      current += character;
    }
  }
  parts.push(current);
  return parts;
}

function negotiate(accept) {
  if (!accept || !accept.trim()) return 'html';
  var ranges = splitOutsideQuotes(accept, ',').map(function (item, order) {
    var parts = splitOutsideQuotes(item, ';');
    var type = parts.shift().trim().toLowerCase();
    var quality = 1;
    var parameters = 0;
    var supported = true;
    parts.forEach(function (part) {
      var pair = part.trim().split('=');
      var name = pair[0].trim().toLowerCase();
      var value = (pair[1] || '').trim();
      if (name === 'q') {
        quality = /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(value) ? Number(value) : 0;
      } else {
        parameters++;
        if (name !== 'charset' || value.replace(/^"|"$/g, '').toLowerCase() !== 'utf-8') supported = false;
      }
    });
    return { type: type, quality: quality, order: order, parameters: parameters, supported: supported };
  });
  var candidates = ['html', 'markdown'].map(function (format, preference) {
    var best = null;
    ranges.forEach(function (range) {
      var specificity = range.type === 'text/' + format ? 2 : range.type === 'text/*' ? 1 : range.type === '*/*' ? 0 : -1;
      if (!range.supported || specificity < 0) return;
      if (!best || specificity > best.specificity || (specificity === best.specificity && range.parameters > best.parameters)) {
        best = { format: format, quality: range.quality, specificity: specificity, parameters: range.parameters, order: range.order, preference: preference };
      }
    });
    return best;
  }).filter(function (item) { return item && item.quality > 0; });
  candidates.sort(function (a, b) {
    return b.quality - a.quality || b.specificity - a.specificity || b.parameters - a.parameters || a.order - b.order || a.preference - b.preference;
  });
  return candidates.length ? candidates[0].format : null;
}

function errorResponse(request, status) {
  return {
    statusCode: status,
    headers: {
      'content-type': { value: 'text/markdown; charset=utf-8' },
      'vary': { value: 'Accept, Accept-Encoding' },
      'cache-control': { value: 'no-store' },
      'x-content-type-options': { value: 'nosniff' }
    },
    body: request.method === 'HEAD' ? '' : status === 406
      ? '# 406 — Not acceptable\n\nRequest text/html or text/markdown.\n'
      : '# 404 — Page not found\n\nThis resource does not exist. See the [sitemap](https://turntall.com/sitemap.xml), [agent guide](https://turntall.com/llms.txt), or [editor](https://turntall.com/).\n'
  };
}

function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var pages = { '/': '/index', '/index.html': '/index' };
  ['about', 'contact', 'privacy'].forEach(function (name) {
    pages['/' + name] = '/' + name + '/index';
    pages['/' + name + '/'] = '/' + name + '/index';
    pages['/' + name + '/index.html'] = '/' + name + '/index';
  });
  if (Object.prototype.hasOwnProperty.call(pages, uri)) {
    var header = request.headers.accept;
    var accept = header ? (header.multiValue || [header]).map(function (item) { return item.value; }).join(',') : '';
    var representation = negotiate(accept);
    if (!representation) return errorResponse(request, 406);
    // Rewriting before cache lookup separates the representations even with
    // CloudFront's managed cache policy. Vary also protects downstream caches.
    request.uri = pages[uri] + (representation === 'markdown' ? '.md' : '.html');
    return request;
  }
  if (/^\/(?:index\.md|llms\.txt|robots\.txt|sitemap\.xml|favicon\.svg|og-image\.png|agent-pages\.css|agent-instructions\.md|404\.(?:html|md)|(?:about|contact|privacy)\/index\.md)$/.test(uri) || /^\/(?:assets|ffmpeg)\/.+/.test(uri)) return request;
  return errorResponse(request, 404);
}
