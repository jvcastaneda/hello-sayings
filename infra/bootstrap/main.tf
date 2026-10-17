# One-time, admin-applied stack: Terraform state storage, GitHub OIDC trust, and
# the CI roles. CI can't modify this stack, so it can't widen its own permissions.

data "aws_caller_identity" "current" {}

locals {
  account_id   = data.aws_caller_identity.current.account_id
  state_bucket = "${var.name_prefix}-tfstate-${local.account_id}"
  oidc_host    = "token.actions.githubusercontent.com"
  table_arn    = "arn:aws:dynamodb:${var.region}:${local.account_id}:table/${var.name_prefix}-*"
  app_user_arn = "arn:aws:iam::${local.account_id}:user/${var.name_prefix}/*"
}

# --- State bucket -------------------------------------------------------------

resource "aws_s3_bucket" "state" {
  bucket = local.state_bucket

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# Old state versions are kept for recovery, but not forever
resource "aws_s3_bucket_lifecycle_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    id     = "expire-old-state-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyInsecureTransport"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}

# --- GitHub OIDC --------------------------------------------------------------

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://${local.oidc_host}"
  client_id_list = ["sts.amazonaws.com"]
}

# Trust is pinned to this repo plus one `sub` pattern per role
data "aws_iam_policy_document" "github_trust" {
  for_each = {
    plan  = "${var.github_oidc_subject_prefix}:pull_request"
    apply = "${var.github_oidc_subject_prefix}:environment:production"
  }

  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "${local.oidc_host}:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "${local.oidc_host}:sub"
      values   = [each.value]
    }
  }
}

# --- App permissions boundary -------------------------------------------------

# Every IAM user CI creates must carry this boundary, so even a malicious change
# to the app's inline policy can't grant more than item access to the app tables
resource "aws_iam_policy" "app_boundary" {
  name        = "${var.name_prefix}-app-boundary"
  description = "Upper bound on permissions for ${var.name_prefix} app identities"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem", "dynamodb:Scan"]
      Resource = local.table_arn
    }]
  })
}

# --- Plan role (pull requests): read-only ------------------------------------

resource "aws_iam_role" "plan" {
  name                 = "${var.name_prefix}-terraform-plan"
  assume_role_policy   = data.aws_iam_policy_document.github_trust["plan"].json
  max_session_duration = 3600
}

resource "aws_iam_role_policy" "plan" {
  name = "terraform-plan"
  role = aws_iam_role.plan.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "StateRead"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.state.arn
      },
      {
        Sid      = "StateObjectRead"
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "${aws_s3_bucket.state.arn}/envs/*"
      },
      {
        # Plans take the state lock too
        Sid      = "StateLock"
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:DeleteObject"]
        Resource = "${aws_s3_bucket.state.arn}/envs/*.tflock"
      },
      {
        Sid    = "ReadTables"
        Effect = "Allow"
        Action = [
          "dynamodb:Describe*",
          "dynamodb:List*",
          "dynamodb:GetResourcePolicy",
          # Refreshes the seed items
          "dynamodb:GetItem",
        ]
        Resource = local.table_arn
      },
      {
        Sid      = "ReadAppUsers"
        Effect   = "Allow"
        Action   = ["iam:GetUser", "iam:GetUserPolicy", "iam:ListUserPolicies", "iam:ListAttachedUserPolicies", "iam:ListUserTags"]
        Resource = local.app_user_arn
      },
    ]
  })
}

# --- Apply role (main, `production` environment) ------------------------------

resource "aws_iam_role" "apply" {
  name                 = "${var.name_prefix}-terraform-apply"
  assume_role_policy   = data.aws_iam_policy_document.github_trust["apply"].json
  max_session_duration = 3600
}

resource "aws_iam_role_policy" "apply" {
  name = "terraform-apply"
  role = aws_iam_role.apply.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "StateList"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.state.arn
      },
      {
        Sid      = "StateReadWrite"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = "${aws_s3_bucket.state.arn}/envs/*"
      },
      {
        Sid      = "ManageTables"
        Effect   = "Allow"
        Action   = ["dynamodb:*"]
        Resource = [local.table_arn, "${local.table_arn}/*"]
      },
      {
        Sid    = "ManageAppUsers"
        Effect = "Allow"
        Action = [
          "iam:GetUser", "iam:DeleteUser", "iam:TagUser", "iam:UntagUser", "iam:ListUserTags",
          "iam:GetUserPolicy", "iam:DeleteUserPolicy", "iam:ListUserPolicies", "iam:ListAttachedUserPolicies",
          "iam:ListAccessKeys", "iam:ListGroupsForUser", "iam:ListSigningCertificates", "iam:ListSSHPublicKeys",
          "iam:ListServiceSpecificCredentials", "iam:ListMFADevices", "iam:GetLoginProfile",
        ]
        Resource = local.app_user_arn
      },
      {
        # Users can only be created, or given policies, with the boundary attached
        Sid      = "ManageAppUsersWithBoundary"
        Effect   = "Allow"
        Action   = ["iam:CreateUser", "iam:PutUserPolicy", "iam:PutUserPermissionsBoundary"]
        Resource = local.app_user_arn
        Condition = {
          StringEquals = { "iam:PermissionsBoundary" = aws_iam_policy.app_boundary.arn }
        }
      },
      {
        # No removing the boundary, and no minting credentials: the app's access
        # key is created out-of-band by scripts/rotate-app-key.sh
        Sid    = "DenyEscalation"
        Effect = "Deny"
        Action = [
          "iam:DeleteUserPermissionsBoundary", "iam:CreateAccessKey", "iam:UpdateAccessKey",
          "iam:CreateLoginProfile", "iam:UpdateLoginProfile", "iam:AttachUserPolicy",
        ]
        Resource = "*"
      },
    ]
  })
}
