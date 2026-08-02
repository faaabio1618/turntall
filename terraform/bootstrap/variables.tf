variable "aws_region" {
  description = "AWS region containing the Terraform state bucket."
  type        = string
  default     = "eu-west-3"
}

variable "resource_prefix" {
  description = "Prefix used for the Terraform state bucket."
  type        = string
  default     = "turntall"
}
