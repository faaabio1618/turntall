# Terraform backend bootstrap

This small, local-state root creates the versioned and encrypted S3 bucket used
by the main production Terraform root. Run it only when bootstrapping a new AWS
account. Its state remains local and is ignored by Git.

```sh
terraform init
terraform apply
```

The state bucket has `prevent_destroy` enabled. The main production root uses
S3 native state locking through a `.tflock` object in the same bucket.
