terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # First apply runs with local state; then uncomment and migrate it into the
  # bucket this stack creates (see infra/README.md)
  # backend "s3" {
  #   key          = "bootstrap/terraform.tfstate"
  #   region       = "us-west-1"
  #   use_lockfile = true
  #   encrypt      = true
  # }
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
