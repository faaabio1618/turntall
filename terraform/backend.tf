terraform {
  backend "s3" {
    bucket       = "turntall-tfstate-505661947086-eu-west-3"
    key          = "turntall/production/terraform.tfstate"
    region       = "eu-west-3"
    encrypt      = true
    use_lockfile = true
  }
}
