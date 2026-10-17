# Set these as GitHub repository variables (see infra/README.md)
output "state_bucket" {
  value = aws_s3_bucket.state.bucket
}

output "plan_role_arn" {
  value = aws_iam_role.plan.arn
}

output "apply_role_arn" {
  value = aws_iam_role.apply.arn
}

output "app_permissions_boundary_arn" {
  value = aws_iam_policy.app_boundary.arn
}
