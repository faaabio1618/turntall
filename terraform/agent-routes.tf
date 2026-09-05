resource "aws_cloudfront_function" "site_request" {
  name    = "${local.resource_name}-site-request"
  runtime = "cloudfront-js-2.0"
  comment = "Negotiate HTML/Markdown before cache lookup and reject unknown pages"
  publish = true
  code    = file("${path.module}/functions/site-request.js")
}

resource "aws_cloudfront_function" "site_response" {
  name    = "${local.resource_name}-site-response"
  runtime = "cloudfront-js-2.0"
  comment = "Set Markdown MIME type and representation-aware downstream caching"
  publish = true
  code    = file("${path.module}/functions/site-response.js")
}
