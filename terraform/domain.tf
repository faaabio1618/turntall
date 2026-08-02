locals {
  site_domain_names = toset(concat(
    [var.domain_name],
    var.include_www_domain ? ["www.${var.domain_name}"] : [],
  ))
}

# CloudFront only accepts ACM viewer certificates issued in us-east-1.
resource "aws_acm_certificate" "site" {
  provider = aws.us_east_1

  domain_name               = var.domain_name
  subject_alternative_names = var.include_www_domain ? ["www.${var.domain_name}"] : []
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "cloudflare_dns_record" "acm_validation" {
  for_each = {
    for option in aws_acm_certificate.site.domain_validation_options : option.domain_name => {
      name    = trimsuffix(option.resource_record_name, ".")
      content = trimsuffix(option.resource_record_value, ".")
      type    = option.resource_record_type
    }
  }

  zone_id = var.cloudflare_zone_id
  name    = each.value.name
  content = each.value.content
  type    = each.value.type
  ttl     = 60
  proxied = false
  comment = "AWS ACM validation for the turntall.com production certificate"
}

resource "aws_acm_certificate_validation" "site" {
  provider = aws.us_east_1

  certificate_arn = aws_acm_certificate.site.arn
  validation_record_fqdns = [
    for record in cloudflare_dns_record.acm_validation : record.name
  ]
}

resource "cloudflare_dns_record" "site" {
  for_each = local.site_domain_names

  zone_id = var.cloudflare_zone_id
  name    = each.value
  content = aws_cloudfront_distribution.site.domain_name
  type    = "CNAME"
  ttl     = var.cloudflare_proxy_enabled ? 1 : 300
  proxied = var.cloudflare_proxy_enabled
  comment = "turntall.com production site on AWS CloudFront"
}
