variable "region" {
  type    = string
  default = "us-west-1"
}

variable "github_oidc_subject_prefix" {
  description = <<-EOT
    Prefix of the GitHub OIDC `sub` claim for the repository allowed to assume
    the CI roles. This repo uses immutable subjects (owner@id/repo@id), which
    survive renames and can't be claimed by a re-created repo of the same name.
    Get it with: gh api repos/<owner>/<repo>/actions/oidc/customization/sub
  EOT
  type        = string
  default     = "repo:jvcastaneda@964050/hello-sayings@1416097632"
}

variable "name_prefix" {
  description = "Prefix of every resource the CI roles may manage"
  type        = string
  default     = "hello-sayings"
}
