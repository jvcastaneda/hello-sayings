terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # Lives in the bucket this stack creates. On a fresh account: comment this
  # out, apply with local state, uncomment, then
  #   terraform init -migrate-state -backend-config="bucket=<state_bucket output>"
  backend "s3" {
    key          = "bootstrap/terraform.tfstate"
    region       = "us-west-1"
    use_lockfile = true
    encrypt      = true
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = "hello-sayings"
      ManagedBy = "terraform"
      Stack     = "bootstrap"
    }
  }
}
