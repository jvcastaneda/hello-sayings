export const sayings: string[] = [
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
];

export function randomSaying(): string {
  return sayings[Math.floor(Math.random() * sayings.length)];
}
