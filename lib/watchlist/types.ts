export type WatchlistItem = Readonly<{
  id: string;
  type: "anchor" | "corridor";
  slug: string;
  name: string;
}>;

export type WatchlistStore = Readonly<{
  items: readonly WatchlistItem[];
  add: (item: WatchlistItem) => WatchlistStore;
  /** Removes a single bookmarked identity, not all records sharing a slug. */
  remove: (id: string) => WatchlistStore;
}>;

const MAX_ITEMS = 200;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isWatchlistItem(value: unknown): value is WatchlistItem {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (item.type === "anchor" || item.type === "corridor")
    && typeof item.slug === "string"
    && item.slug.length > 0
    && item.slug.length <= 100
    && SLUG_PATTERN.test(item.slug)
    && item.id === `${item.type}-${item.slug}`
    && typeof item.name === "string"
    && item.name.trim().length > 0
    && item.name.length <= 200;
}

/** All storage operations are best effort. No server calls or monitoring. */
export function createWatchlistStore(
  storageKey: string = "stellarcore-watchlist",
): WatchlistStore {
  let saved: WatchlistItem[] = [];
  try {
    if (typeof window !== "undefined") {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const unique = new Set<string>();
          for (const candidate of parsed.slice(0, MAX_ITEMS)) {
            if (!isWatchlistItem(candidate) || unique.has(candidate.id)) continue;
            saved.push(candidate);
            unique.add(candidate.id);
          }
        }
      }
    }
  } catch {
    // Corrupt or blocked localStorage is handled as an empty watchlist.
  }

  const persist = (items: readonly WatchlistItem[]) => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(storageKey, JSON.stringify(items));
      }
    } catch {
      // Private browsing and denied storage must not break read-only navigation.
    }
  };

  const snapshot = (items: readonly WatchlistItem[]): WatchlistStore => {
    const current: WatchlistStore = Object.freeze({
      items: Object.freeze([...items]),
      add(item: WatchlistItem): WatchlistStore {
        if (!isWatchlistItem(item) || current.items.length >= MAX_ITEMS
          || current.items.some((existing) => existing.id === item.id)) return current;
        const next = [...current.items, item];
        persist(next);
        return snapshot(next);
      },
      remove(id: string): WatchlistStore {
        const next = current.items.filter((item) => item.id !== id);
        if (next.length === current.items.length) return current;
        persist(next);
        return snapshot(next);
      },
    });
    return current;
  };

  return snapshot(saved);
}
