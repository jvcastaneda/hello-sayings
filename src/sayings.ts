// In-memory store: data lives per process and resets on restart
const seed: string[] = [
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

export interface Saying {
  id: string;
  text: string;
}

const store = new Map<string, string>(seed.map((text, i) => [String(i + 1), text]));

export function listSayings(): Saying[] {
  return [...store].map(([id, text]) => ({ id, text }));
}

export function getSaying(id: string): Saying | undefined {
  const text = store.get(id);
  return text === undefined ? undefined : { id, text };
}

// Create or replace; returns true if the saying is new
export function putSaying(id: string, text: string): boolean {
  const created = !store.has(id);
  store.set(id, text);
  return created;
}

export function deleteSaying(id: string): boolean {
  return store.delete(id);
}

export function countSayings(): number {
  return store.size;
}

export function randomSaying(): Saying | undefined {
  const all = listSayings();
  return all.length === 0 ? undefined : all[Math.floor(Math.random() * all.length)];
}
