const chains = new Map<string, Promise<void>>();

export function enqueue(key: string, fn: () => Promise<void>): void {
  const previous = chains.get(key) ?? Promise.resolve();
  const next = previous.then(fn, fn).catch((err: unknown) => {
    console.error(`[whatsapp] queued job failed for ${key}:`, err);
  });

  chains.set(key, next);

  next.finally(() => {
    if (chains.get(key) === next) {
      chains.delete(key);
    }
  });
}

const MAX_SEEN = 500;
const seen = new Set<string>();
const seenOrder: string[] = [];

export function markSeen(id: string): boolean {
  if (seen.has(id)) return false;

  seen.add(id);
  seenOrder.push(id);
  while (seenOrder.length > MAX_SEEN) {
    const oldest = seenOrder.shift();
    if (oldest !== undefined) seen.delete(oldest);
  }

  return true;
}
