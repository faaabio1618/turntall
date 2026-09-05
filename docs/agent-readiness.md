# Agent readiness implementation and release

The homepage contains useful HTML before JavaScript runs. The editor replaces
that fallback when it mounts. About, Contact, and Privacy are static pages with
HTML and Markdown representations; no media or editor state is sent to a server.

## HTTP behavior

The CloudFront viewer-request function in `terraform/functions/site-request.js`
selects HTML or Markdown using Accept quality values, specificity, and exclusion
rules. Absent or wildcard Accept prefers HTML. Unsupported requests receive 406.
The function rewrites to distinct object keys **before cache lookup**, separating
HTML and Markdown in the managed CloudFront cache. The viewer-response function
sets `Vary: Accept, Accept-Encoding` for downstream caches and Markdown MIME.
Vite preview runs the same request function, with SPA fallback disabled.

Unknown page paths receive a Markdown 404 directly at the edge. Missing asset
objects fall through to S3; both S3 403 and 404 map to `/404.md` with status 404.
S3 may conceal a missing private object as 403, which is why both are mapped.
Deployment explicitly sets Markdown MIME on S3, including the error document:
CloudFront viewer-response functions do not run for origin error responses.

## Release order

1. Review these changes independently of any unrelated editor/desktop work.
2. Deploy the static bundle, including all `public/` files, with the updated
   CI upload step that gives `.md` files `text/markdown; charset=utf-8` metadata.
3. Review and apply the Terraform plan to publish and associate both functions
   and replace the old 200 error mappings. An AWS administrator must grant the
   new scoped function permissions before a role lacking them can apply the
   infrastructure changes. Do not assume the existing deploy role can grant
   itself additional permissions.
4. Invalidate CloudFront and run the live verifier below. The local tests do not
   prove that production infrastructure has been applied.

```sh
npm run check
npm run test:e2e:production
node scripts/verify-agent-readiness.mjs https://turntall.com
```

For the audit's minimal status check:

```sh
curl -s -o /dev/null -w "%{http_code}" https://turntall.com/some-path-that-does-not-exist
```

It must print `404`. The verifier also probes negotiated pages repeatedly,
machine-readable files, trust pages, GET/HEAD errors, MIME types, and 406.

## Decisions and external work

- Search ranking cannot be guaranteed by source changes. The actual brand is
  **turntall.com**; “No Watermark” is a feature description. Titles now lead
  with the brand. A site owner should verify Search Console ownership, submit
  the sitemap, and request indexing after release.
- Confirm operator identity, any public business address, and applicable email
  retention details before adding them. No address, phone number, legal entity,
  retention promise, or third-party endorsement has been invented.
- External listings, press outreach, and search-provider credentials require
  the owner's accounts and choices. Maintain the same brand and canonical
  domain wherever the owner chooses to list the service.

## Protocol references

- [Accept negotiation](https://acceptmarkdown.com/guides/accept-parsing)
- [llms.txt format](https://llmstxt.org/)
- [Sitemap XML](https://www.sitemaps.org/protocol.html)
- [CloudFront event structure and error limitations](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/functions-event-structure.html)
