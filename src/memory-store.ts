import type { Saying, SayingsStore } from "./store.js";

export const seedSayings: string[] = [
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

// Per-process store for local development and tests: resets on restart
export class MemoryStore implements SayingsStore {
  private readonly items: Map<string, string>;

  constructor(seed: string[] = seedSayings) {
    this.items = new Map(seed.map((text, i) => [String(i + 1), text]));
  }

  async list(): Promise<Saying[]> {
    return [...this.items].map(([id, text]) => ({ id, text }));
  }

  async get(id: string): Promise<Saying | undefined> {
    const text = this.items.get(id);
    return text === undefined ? undefined : { id, text };
  }

  async put(id: string, text: string): Promise<boolean> {
    const created = !this.items.has(id);
    this.items.set(id, text);
    return created;
  }

  async delete(id: string): Promise<boolean> {
    return this.items.delete(id);
  }

  async ping(): Promise<void> {}
}
