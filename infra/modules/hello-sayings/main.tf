locals {
  name = "${var.name_prefix}-${var.environment}"
}

resource "aws_dynamodb_table" "sayings" {
  name         = local.name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  deletion_protection_enabled = var.deletion_protection
}

# Created once; the API owns the data afterwards, so edits aren't reverted
resource "aws_dynamodb_table_item" "seed" {
  for_each = { for i, text in var.seed_sayings : tostring(i + 1) => text }

  table_name = aws_dynamodb_table.sayings.name
  hash_key   = aws_dynamodb_table.sayings.hash_key
  item = jsonencode({
    id   = { S = each.key }
    text = { S = each.value }
  })

  lifecycle {
    ignore_changes = [item]
  }
}

# The app's identity. Its access key is deliberately not managed here, so it
# never lands in Terraform state: scripts/rotate-app-key.sh creates it and
# writes it straight into a Kubernetes Secret.
resource "aws_iam_user" "app" {
  name                 = "${local.name}-app"
  path                 = "/${var.name_prefix}/"
  permissions_boundary = var.permissions_boundary_arn
}

resource "aws_iam_user_policy" "app" {
  name = "sayings-table-access"
  user = aws_iam_user.app.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem", "dynamodb:Scan"]
      Resource = aws_dynamodb_table.sayings.arn
    }]
  })
}
