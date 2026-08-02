provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Application = "turntall"
      ManagedBy   = "Terraform"
      Purpose     = "TerraformState"
    }
  }
}

data "aws_caller_identity" "current" {}
