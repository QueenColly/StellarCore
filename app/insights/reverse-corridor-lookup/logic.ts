export interface CorridorSummaryInput {
  id?: string;
  slug: string;
  sourceAsset: string;
  sourceCountry: string;
  destinationAsset: string;
  destinationCountry: string;
}

export interface ReverseLookupResult {
  selected: CorridorSummaryInput | null;
  matches: CorridorSummaryInput[];
  duplicateSlugWarnings: string[];
  directoryIncomplete: boolean;
  message: string;
}

export function normalizeIdentifier(value: string): string {
  return value.trim().toUpperCase();
}

export function findReverseCorridorAssociations(params: {
  corridors: readonly CorridorSummaryInput[];
  selectedSlug: string | null;
  hasMorePages: boolean;
  failedPageFetch?: boolean;
}): ReverseLookupResult {
  const { corridors, selectedSlug, hasMorePages, failedPageFetch = false } = params;
  const directoryIncomplete = hasMorePages || failedPageFetch;

  // Deduplicate by slug while surfacing duplicate-slug warnings
  const seenSlugs = new Set<string>();
  const duplicateSlugSet = new Set<string>();
  const uniqueCorridors: CorridorSummaryInput[] = [];

  for (const row of corridors) {
    const slugKey = row.slug.trim();
    if (seenSlugs.has(slugKey)) {
      duplicateSlugSet.add(slugKey);
      continue;
    }
    seenSlugs.add(slugKey);
    uniqueCorridors.push(row);
  }

  const selected = selectedSlug
    ? uniqueCorridors.find((c) => c.slug === selectedSlug) ?? null
    : null;

  if (!selected) {
    return {
      selected: null,
      matches: [],
      duplicateSlugWarnings: Array.from(duplicateSlugSet),
      directoryIncomplete,
      message: 'Select a reviewed corridor to inspect reverse-direction associations.',
    };
  }

  const selSrcAsset = normalizeIdentifier(selected.sourceAsset);
  const selSrcCountry = normalizeIdentifier(selected.sourceCountry);
  const selDstAsset = normalizeIdentifier(selected.destinationAsset);
  const selDstCountry = normalizeIdentifier(selected.destinationCountry);

  // Must be a SEPARATE corridor row — never infer reversibility from the selected row itself
  const matches = uniqueCorridors.filter((candidate) => {
    const isSameRow =
      candidate.slug === selected.slug ||
      (Boolean(candidate.id) && Boolean(selected.id) && candidate.id === selected.id);
    if (isSameRow) return false;

    return (
      normalizeIdentifier(candidate.sourceAsset) === selDstAsset &&
      normalizeIdentifier(candidate.sourceCountry) === selDstCountry &&
      normalizeIdentifier(candidate.destinationAsset) === selSrcAsset &&
      normalizeIdentifier(candidate.destinationCountry) === selSrcCountry
    );
  });

  if (matches.length > 0) {
    return {
      selected,
      matches,
      duplicateSlugWarnings: Array.from(duplicateSlugSet),
      directoryIncomplete,
      message: `Found ${matches.length} separately reviewed reverse-direction corridor association(s).`,
    };
  }

  const completenessNote = directoryIncomplete
    ? ' Note: The directory is incomplete (remaining pages were not loaded or failed to load), so an unlisted association may exist on unloaded pages.'
    : ' All returned directory pages were checked.';

  return {
    selected,
    matches: [],
    duplicateSlugWarnings: Array.from(duplicateSlugSet),
    directoryIncomplete,
    message: `No reviewed reverse association in the returned directory.${completenessNote}`,
  };
}