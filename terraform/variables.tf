variable "aws_region" {
  description = "AWS region used by the production S3 bucket."
  type        = string
  default     = "eu-west-3"
}

variable "project_name" {
  description = "Product name used for resource tags."
  type        = string
  default     = "turntall"

  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.project_name))
    error_message = "project_name must contain only lowercase letters, numbers, and hyphens."
  }
}

variable "resource_prefix" {
  description = "Stable prefix of existing AWS production resources. Change only as part of an explicit resource migration."
  type        = string
  default     = "turntall"

  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.resource_prefix))
    error_message = "resource_prefix must contain only lowercase letters, numbers, and hyphens."
  }
}

variable "github_owner" {
  description = "GitHub repository owner allowed to deploy production."
  type        = string
  default     = "faaabio1618"
}

variable "github_repository" {
  description = "GitHub repository allowed to deploy production."
  type        = string
  default     = "turntall"
}

variable "github_environment" {
  description = "GitHub Environment allowed to assume the production deploy role."
  type        = string
  default     = "production"
}

variable "github_owner_id" {
  description = "Optional immutable GitHub owner ID used by repositories with immutable OIDC subjects."
  type        = number
  default     = null
}

variable "github_repository_id" {
  description = "Optional immutable GitHub repository ID used by repositories with immutable OIDC subjects."
  type        = number
  default     = null
}

variable "create_github_oidc_provider" {
  description = "Create the account-wide GitHub Actions OIDC provider. Set false when it already exists in the AWS account."
  type        = bool
  default     = true
}

variable "force_destroy_bucket" {
  description = "Allow Terraform to delete the production bucket even when it contains objects."
  type        = bool
  default     = false
}

variable "cloudfront_price_class" {
  description = "CloudFront edge-location price class."
  type        = string
  default     = "PriceClass_100"

  validation {
    condition = contains([
      "PriceClass_100",
      "PriceClass_200",
      "PriceClass_All",
    ], var.cloudfront_price_class)
    error_message = "cloudfront_price_class must be PriceClass_100, PriceClass_200, or PriceClass_All."
  }
}

variable "domain_name" {
  description = "Apex domain served by the production CloudFront distribution."
  type        = string
  default     = "turntall.com"

  validation {
    condition     = can(regex("^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$", var.domain_name))
    error_message = "domain_name must be a valid lowercase DNS name."
  }
}

variable "cloudflare_zone_id" {
  description = "Cloudflare Zone ID for domain_name. This identifier is not a secret."
  type        = string

  validation {
    condition     = can(regex("^[0-9a-f]{32}$", var.cloudflare_zone_id))
    error_message = "cloudflare_zone_id must be a 32-character hexadecimal Cloudflare Zone ID."
  }
}

variable "include_www_domain" {
  description = "Serve the production site from both the apex domain and www."
  type        = bool
  default     = true
}

variable "cloudflare_proxy_enabled" {
  description = "Proxy site records through Cloudflare. Production has been proxied since October 2026; set false for DNS-only records that point straight at CloudFront."
  type        = bool
  default     = true
}
