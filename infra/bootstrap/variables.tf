variable "region" {
  type    = string
  default = "us-west-1"
}

variable "github_repo" {
  description = "GitHub repository allowed to assume the CI roles, as owner/name"
  type        = string
  default     = "jvcastaneda/hello-sayings"
}

variable "name_prefix" {
  description = "Prefix of every resource the CI roles may manage"
  type        = string
  default     = "hello-sayings"
}
