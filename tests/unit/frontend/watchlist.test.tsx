import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { exposeReactForClassicJsx } from "../../support/dashboardContracts";
import WatchlistPage, { SavedBookmarks } from "@/app/watchlist/page";
import { createWatchlistStore, type WatchlistItem } from "@/lib/watchlist";

exposeReactForClassicJsx();

const anchor: WatchlistItem = {
  id: "anchor-example", type: "anchor", slug: "example", name: "Example Anchor",
};
const corridor: WatchlistItem = {
  id: "corridor-example", type: "corridor", slug: "example", name: "Example Corridor",
};

test("watchlist hydrates saved data after mount and shows both discovery sections", () => {
  const markup = renderToStaticMarkup(<WatchlistPage />);
  assert.match(markup, /Loading saved bookmarks/);
  assert.match(markup, /Add anchors/);
  assert.match(markup, /Select anchors from the public list/);
  assert.match(markup, /Add corridors/);
  assert.match(markup, /Select corridors from the public list/);
  assert.match(markup, /Loading anchors/);
  assert.match(markup, /Loading corridors/);
});

test("saved watchlist shows honest empty state", () => {
  const markup = renderToStaticMarkup(<SavedBookmarks items={[]} onRemove={() => undefined} />);
  assert.match(markup, /No bookmarks yet/);
  assert.match(markup, /Select anchors or corridors below/);
});

test("saved bookmark entries link to the correct type and expose remove actions", () => {
  const markup = renderToStaticMarkup(
    <SavedBookmarks items={[anchor, corridor]} onRemove={() => undefined} />,
  );
  assert.match(markup, /href="\/anchors\/example"/);
  assert.match(markup, /href="\/corridors\/example"/);
  assert.match(markup, /Remove Example Anchor from watchlist/);
  assert.match(markup, /Remove Example Corridor from watchlist/);
});

test("store updates are immutable and do not lose previously added bookmarks", () => {
  const start = createWatchlistStore();
  const withAnchor = start.add(anchor);
  const withBoth = withAnchor.add(corridor);
  assert.deepEqual(start.items, []);
  assert.deepEqual(withAnchor.items, [anchor]);
  assert.deepEqual(withBoth.items, [anchor, corridor]);
  assert.equal(withBoth.add(anchor), withBoth);
  const afterRemovingAnchor = withBoth.remove(anchor.id);
  assert.deepEqual(afterRemovingAnchor.items, [corridor]);
  assert.deepEqual(afterRemovingAnchor.remove(corridor.id).items, []);
});

test("invalid slugs and non-canonical identities cannot enter the watchlist", () => {
  const store = createWatchlistStore();
  assert.equal(store.add({ ...anchor, slug: "../bad" }), store);
  assert.equal(store.add({ ...anchor, id: "corridor-example" }), store);
  assert.deepEqual(store.items, []);
});

test("bookmarks stay browser-local and are not monitoring or alerts", () => {
  const markup = renderToStaticMarkup(<WatchlistPage />);
  assert.match(markup, /persist only in this browser/);
  assert.match(markup, /Clearing browsing data will remove them/);
  assert.match(markup, /No automatic monitoring, alerts/);
});
