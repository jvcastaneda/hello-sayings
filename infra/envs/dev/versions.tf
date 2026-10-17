terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # The bucket is passed at init time, keeping the account id out of the repo:
  #   terraform init -backend-config="bucket=$TF_STATE_BUCKET"
  backend "s3" {
    key          = "envs/dev/terraform.tfstate"
    region       = "us-west-1"
    use_lockfile = true
    encrypt      = true
  }
}

provider "aws" {
  region = "us-west-1"

  default_tags {
    tags = {
      Project     = "hello-sayings"
      ManagedBy   = "terraform"
      Environment = "dev"
    }
  }
}
