variable "environment" {
  description = "Environment name, used in resource names (e.g. dev)"
  type        = string
}

variable "name_prefix" {
  type    = string
  default = "hello-sayings"
}

variable "permissions_boundary_arn" {
  description = "Permissions boundary for the app IAM user (bootstrap output app_permissions_boundary_arn)"
  type        = string
}

variable "deletion_protection" {
  type    = bool
  default = true
}

variable "seed_sayings" {
  description = "Sayings created with ids \"1\", \"2\", ... Later edits through the API are kept."
  type        = list(string)
  default     = []
}
