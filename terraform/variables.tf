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
