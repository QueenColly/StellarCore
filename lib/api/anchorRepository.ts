import type { PublicAnchorStatus } from "@/types/api/anchors";

export type AnchorDirectoryRecord = Readonly<{
  slug: string;
  name: string;
  homeDomain: string;
  status: PublicAnchorStatus;
  seps: readonly number[];
  corridorCount: number;
}>;

export type AnchorDetailRecord = Readonly<{
  slug: string;
  name: string;
  homeDomain: string;
  status: PublicAnchorStatus;
  seps: readonly number[];
  corridors: readonly Readonly<{
    slug: string;
    assetCodeFrom: string;
    countryFrom: string;
    assetCodeTo: string;
    countryTo: string;
  }>[];
}>;

export type AnchorDirectoryRepository = Readonly<{
  findAll: () => Promise<readonly AnchorDirectoryRecord[]>;
  findBySlug: (slug: string) => Promise<AnchorDetailRecord | null>;
}>;

export const PRISMA_ANCHOR_DIRECTORY_REPOSITORY = Object.freeze({
  async findAll(): Promise<readonly AnchorDirectoryRecord[]> {
    const { db } = await import("@/lib/dbClient");
    const anchors = await db.anchor.findMany({
      orderBy: { slug: "asc" },
      select: {
        slug: true,
        name: true,
        homeDomain: true,
        status: true,
        seps: true,
        _count: { select: { corridors: true } },
      },
    });

    return Object.freeze(anchors.map((anchor) => Object.freeze({
      slug: anchor.slug,
      name: anchor.name,
      homeDomain: anchor.homeDomain,
      status: anchor.status,
      seps: Object.freeze([...anchor.seps]),
      corridorCount: anchor._count.corridors,
    })));
  },

  async findBySlug(slug: string): Promise<AnchorDetailRecord | null> {
    const { db } = await import("@/lib/dbClient");
    const anchor = await db.anchor.findUnique({
      where: { slug },
      select: {
        slug: true,
        name: true,
        homeDomain: true,
        status: true,
        seps: true,
        corridors: {
          orderBy: { corridor: { slug: "asc" } },
          select: {
            corridor: {
              select: {
                slug: true,
                assetCodeFrom: true,
                countryFrom: true,
                assetCodeTo: true,
                countryTo: true,
              },
            },
          },
        },
      },
    });

    if (!anchor) return null;

    return Object.freeze({
      slug: anchor.slug,
      name: anchor.name,
      homeDomain: anchor.homeDomain,
      status: anchor.status,
      seps: Object.freeze([...anchor.seps]),
      corridors: Object.freeze(anchor.corridors.map(({ corridor }) =>
        Object.freeze({ ...corridor }))),
    });
  },
}) satisfies AnchorDirectoryRepository;
