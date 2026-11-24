/**
 * StellarCore Watchlist Library
 * 
 * Privacy-friendly local storage for anchor and corridor watchlists.
 * 
 * This library provides a route-local, browser-side store for users to
 * maintain personal bookmark lists of anchors and corridors they want to
 * revisit. No credentials, personal data, backend persistence, analytics,
 * or notification permissions are used.
 * 
 * Key design goals:
 * - Storage only in browser localStorage/sessionStorage
 * - Validated slugs only (no code execution risk)
 * - Safe tolerance of corrupt/unknown entries
 * - No external dependencies
 * - Works without any server coordination
 */

export { type WatchlistItem, type WatchlistStore, createWatchlistStore } from "./types";