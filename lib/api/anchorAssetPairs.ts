import type { PublicAnchorDetail } from "@/types/api/anchors";

export type AnchorCountryPair = Readonly<{
  sourceCountry: string;
  destinationCountry: string;
}>;

export type AnchorAssetPairGroup = Readonly<{
  sourceAsset: string;
  destinationAsset: string;
  countryPairs: ReadonlyArray<AnchorCountryPair>;
  corridorSlugs: ReadonlyArray<string>;
}>;

type MutableGroup = {
  sourceAsset: string;
  destinationAsset: string;
  countryPairs: AnchorCountryPair[];
  countryPairKeys: Set<string>;
  corridorSlugs: string[];
  corridorSlugsSeen: Set<string>;
};

export function summarizeAnchorAssetPairs(
  detail: PublicAnchorDetail | null | undefined,
): ReadonlyArray<AnchorAssetPairGroup> {
  const groups = new Map<string, MutableGroup>();
  const slugsSeen = new Set<string>();

  for (const corridor of detail?.corridors ?? []) {
    const slug = textValue(corridor?.slug);
    if (slugsSeen.has(slug)) continue;
    slugsSeen.add(slug);

    const sourceAsset = textValue(corridor?.sourceAsset);
    const destinationAsset = textValue(corridor?.destinationAsset);
    const key = `${sourceAsset}\u0000${destinationAsset}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        sourceAsset,
        destinationAsset,
        countryPairs: [],
        countryPairKeys: new Set<string>(),
        corridorSlugs: [],
        corridorSlugsSeen: new Set<string>(),
      };
      groups.set(key, group);
    }

    const sourceCountry = textValue(corridor?.sourceCountry);
    const destinationCountry = textValue(corridor?.destinationCountry);
    const countryKey = `${sourceCountry}|${destinationCountry}`;
    if (!group.countryPairKeys.has(countryKey)) {
      group.countryPairKeys.add(countryKey);
      group.countryPairs.push(
        Object.freeze({ sourceCountry, destinationCountry }),
      );
    }

    if (slug !== "" && !group.corridorSlugsSeen.has(slug)) {
      group.corridorSlugsSeen.add(slug);
      group.corridorSlugs.push(slug);
    }
  }

  return Object.freeze(
    [...groups.values()]
      .sort(
        (left, right) =>
          left.sourceAsset.localeCompare(right.sourceAsset) ||
          left.destinationAsset.localeCompare(right.destinationAsset),
      )
      .map((group) =>
        Object.freeze({
          sourceAsset: group.sourceAsset,
          destinationAsset: group.destinationAsset,
          countryPairs: Object.freeze(
            [...group.countryPairs].sort(
              (left, right) =>
                left.sourceCountry.localeCompare(right.sourceCountry) ||
                left.destinationCountry.localeCompare(right.destinationCountry),
            ),
          ),
          corridorSlugs: Object.freeze([...group.corridorSlugs].sort()),
        }),
      ),
  );
}

function textValue(value: string | null | undefined): string {
  return typeof value === "string" ? value : "";
}
