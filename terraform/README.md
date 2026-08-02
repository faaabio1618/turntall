# turntall.com production infrastructure

This root module creates the only application environment: `production`.

It provisions:

- a private, encrypted, versioned S3 bucket for the Vite bundle;
- CloudFront with Origin Access Control, HTTPS, SPA fallbacks, compression,
  and the COOP/COEP headers required by turntall.com;
- a least-privilege IAM role for GitHub Actions deployments;
- the GitHub Actions OIDC provider when requested.

No video is uploaded by the application. S3 only stores the compiled static
site.

## Provision production

Authenticate Terraform to the target AWS account, then run:

```sh
cd terraform
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan -out=production.tfplan
terraform apply production.tfplan
```

The default region is Paris (`eu-west-3`). Change `terraform.tfvars` before the
first apply if production belongs elsewhere.

The product name, default resource prefix, and GitHub repository are all
`turntall`. If infrastructure already exists under a previous prefix, inspect
the Terraform plan carefully before applying because changing the prefix can
replace the production bucket or invalidate the GitHub OIDC trust.

Terraform uses local state by default so the first apply is self-contained. For
shared or automated administration, create a separate versioned state bucket,
copy `backend.tf.example` to `backend.tf`, and initialize with:

```sh
terraform init -backend-config=backend.hcl.example
```

Do not use the application bucket as the Terraform state bucket.

If the AWS account already has the GitHub OIDC provider, set
`create_github_oidc_provider = false`. For repositories using GitHub immutable
OIDC subjects, set both numeric GitHub IDs in `terraform.tfvars`; otherwise the
configuration accepts both the legacy subject and the immutable name pattern.
With an authenticated GitHub CLI, retrieve the IDs with:

```sh
gh api repos/faaabio1618/turntall \
  --jq '{github_owner_id: .owner.id, github_repository_id: .id}'
```

## Connect GitHub Actions

Create or open the GitHub Environment named `production`, restrict its allowed
deployment branch to `main`, and add these environment variables using the
matching Terraform outputs:

| GitHub variable | Terraform output |
| --- | --- |
| `AWS_REGION` | `aws_region` |
| `AWS_ROLE_ARN` | `github_actions_role_arn` |
| `S3_BUCKET_NAME` | `s3_bucket_name` |
| `CLOUDFRONT_DISTRIBUTION_ID` | `cloudfront_distribution_id` |

Read all values with `terraform output`. The deploy job uses GitHub OIDC and
temporary AWS credentials; no AWS access key is stored in GitHub.

Every push to `main` must pass the existing CI job. GitHub builds and tests the
bundle, uploads `dist` as a short-lived workflow artifact, syncs it to S3, and
invalidates CloudFront. Pull requests never deploy.
