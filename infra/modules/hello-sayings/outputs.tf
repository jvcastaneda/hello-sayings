output "table_name" {
  value = aws_dynamodb_table.sayings.name
}

output "table_arn" {
  value = aws_dynamodb_table.sayings.arn
}

output "app_user_name" {
  value = aws_iam_user.app.name
}
