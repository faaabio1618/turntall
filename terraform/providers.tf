provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Application = var.project_name
      Environment = "production"
      ManagedBy   = "Terraform"
    }
  }
}

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Application = var.project_name
      Environment = "production"
      ManagedBy   = "Terraform"
    }
  }
}

# Authentication is read from CLOUDFLARE_API_TOKEN so the token never needs to
# be written to a Terraform configuration or variable file.
provider "cloudflare" {}

data "aws_caller_identity" "current" {}

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}
