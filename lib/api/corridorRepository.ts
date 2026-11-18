import type { PublicAnchorStatus } from "@/types/api/anchors";

export type CorridorDirectoryRecord = Readonly<{
  slug: string;
  assetCodeFrom: string;
  countryFrom: string;
  assetCodeTo: string;
  countryTo: string;
  anchorCount: number;
}>;

export type CorridorDirectoryRepository = Readonly<{
  findAll: () => Promise<readonly CorridorDirectoryRecord[]>;
}>;

export type CorridorDetailRecord = Readonly<{
  slug: string;
  assetCodeFrom: string;
  countryFrom: string;
  assetCodeTo: string;
  countryTo: string;
  anchors: readonly Readonly<{
    slug: string;
    name: string;
    homeDomain: string;
    status: PublicAnchorStatus;
    seps: readonly number[];
  }>[];
}>;

export type CorridorDetailRepository = Readonly<{
  findBySlug: (slug: string) => Promise<CorridorDetailRecord | null>;
}>;

export const PRISMA_CORRIDOR_DIRECTORY_REPOSITORY = Object.freeze({
  async findAll(): Promise<readonly CorridorDirectoryRecord[]> {
    const { db } = await import("@/lib/dbClient");
    const corridors = await db.corridor.findMany({
      orderBy: { slug: "asc" },
      select: {
        slug: true,
        assetCodeFrom: true,
        countryFrom: true,
        assetCodeTo: true,
        countryTo: true,
        _count: { select: { anchors: true } },
      },
    });

    return Object.freeze(corridors.map((corridor) => Object.freeze({
      slug: corridor.slug,
      assetCodeFrom: corridor.assetCodeFrom,
      countryFrom: corridor.countryFrom,
      assetCodeTo: corridor.assetCodeTo,
      countryTo: corridor.countryTo,
      anchorCount: corridor._count.anchors,
    })));
  },

  async findBySlug(slug: string): Promise<CorridorDetailRecord | null> {
    const { db } = await import("@/lib/dbClient");
    const corridor = await db.corridor.findUnique({
      where: { slug },
      select: {
        slug: true,
        assetCodeFrom: true,
        countryFrom: true,
        assetCodeTo: true,
        countryTo: true,
        anchors: {
          orderBy: { anchor: { slug: "asc" } },
          select: {
            anchor: {
              select: {
                slug: true,
                name: true,
                homeDomain: true,
                status: true,
                seps: true,
              },
            },
          },
        },
      },
    });

    if (!corridor) return null;

    return Object.freeze({
      slug: corridor.slug,
      assetCodeFrom: corridor.assetCodeFrom,
      countryFrom: corridor.countryFrom,
      assetCodeTo: corridor.assetCodeTo,
      countryTo: corridor.countryTo,
      anchors: Object.freeze(corridor.anchors.map(({ anchor }) => Object.freeze({
        ...anchor,
        seps: Object.freeze([...anchor.seps]),
      }))),
    });
  },
}) satisfies CorridorDirectoryRepository & CorridorDetailRepository;
