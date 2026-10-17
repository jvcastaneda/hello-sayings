module "hello_sayings" {
  source = "../../modules/hello-sayings"

  environment              = "dev"
  permissions_boundary_arn = var.app_permissions_boundary_arn

  # Same seed data as the app's in-memory store
  seed_sayings = [
    "The early bird gets the worm, but the second mouse gets the cheese.",
    "It works on my machine.",
    "Measure twice, cut once.",
    "A journey of a thousand miles begins with a single step.",
    "There are only two hard things in computer science: cache invalidation and naming things.",
    "Don't count your chickens before they hatch.",
    "First, solve the problem. Then, write the code.",
    "Fortune favors the bold.",
    "Simplicity is the soul of efficiency.",
    "When in doubt, ship it out (to staging).",
  ]
}
