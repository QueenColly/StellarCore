import Link from "next/link";
import type { WatchlistItem } from "@/lib/watchlist";
export function SavedBookmarks({
  items, onRemove,
}: {
  items: readonly WatchlistItem[];
  onRemove: (id: string) => void;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-[var(--muted)]">No bookmarks yet. Select anchors or corridors below to add them.</p>;
  }
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ghost)] py-2">
          <Link href={item.type === "anchor" ? `/anchors/${item.slug}` : `/corridors/${item.slug}`}
            className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">
            {item.name}
          </Link>
          <button type="button" onClick={() => onRemove(item.id)}
            className="rounded border border-[var(--ghost)] px-3 py-2 text-sm focus-visible:outline-2"
            aria-label={`Remove ${item.name} from watchlist`}>Remove</button>
        </li>
      ))}
    </ul>
  );
}

