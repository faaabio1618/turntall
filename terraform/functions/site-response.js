function handler(event) {
  var response = event.response;
  var uri = event.request.uri;
  response.headers.vary = { value: 'Accept, Accept-Encoding' };
  response.headers.link = { value: '</llms.txt>; rel="describedby"' };
  if (/\.md$/.test(uri)) {
    response.headers['content-type'] = { value: 'text/markdown; charset=utf-8' };
  }
  return response;
}
