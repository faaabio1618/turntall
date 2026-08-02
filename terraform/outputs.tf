output "aws_region" {
  description = "AWS region to configure in the GitHub production environment."
  value       = var.aws_region
}

output "s3_bucket_name" {
  description = "Private bucket receiving the production bundle."
  value       = aws_s3_bucket.site.id
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution invalidated after each deployment."
  value       = aws_cloudfront_distribution.site.id
}

output "cloudfront_domain_name" {
  description = "AWS-generated CloudFront hostname."
  value       = aws_cloudfront_distribution.site.domain_name
}

output "site_url" {
  description = "Production site URL."
  value       = "https://${var.domain_name}"
}

output "www_site_url" {
  description = "Production www URL when the www alias is enabled."
  value       = var.include_www_domain ? "https://www.${var.domain_name}" : null
}

output "acm_certificate_arn" {
  description = "ACM certificate attached to CloudFront."
  value       = aws_acm_certificate.site.arn
}

output "github_actions_role_arn" {
  description = "OIDC role ARN to configure in the GitHub production environment."
  value       = aws_iam_role.github_deploy.arn
}
