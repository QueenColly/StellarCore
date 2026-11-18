import type { PublicAnchorStatus } from "@/types/api/anchors";

export type PublicCorridor = Readonly<{
  slug: string;
  sourceAsset: string;
  sourceCountry: string;
  destinationAsset: string;
  destinationCountry: string;
  anchorCount: number;
}>;

export type PublicCorridorAnchor = Readonly<{
  slug: string;
  name: string;
  homeDomain: string;
  status: PublicAnchorStatus;
  seps: readonly number[];
  isTransferCapable: boolean;
}>;

export type PublicCorridorDetail = PublicCorridor & Readonly<{
  anchors: readonly PublicCorridorAnchor[];
}>;

export type PublicCorridorsResponse = Readonly<{
  corridors: readonly PublicCorridor[];
  count: number;
}>;

export type PublicCorridorResponse = Readonly<{
  corridor: PublicCorridorDetail;
}>;

export type CorridorApiErrorCode =
  | "invalid_corridor_slug"
  | "corridor_not_found"
  | "internal_error";

export type CorridorsApiErrorResponse = Readonly<{
  error: Readonly<{
    code: "invalid_pagination" | "internal_error";
    message: string;
  }>;
}>;

export type CorridorApiErrorResponse = Readonly<{
  error: Readonly<{
    code: CorridorApiErrorCode;
    message: string;
  }>;
}>;

export type CorridorsApiResult =
  | Readonly<{ status: 200; body: PublicCorridorsResponse }>
  | Readonly<{ status: 400 | 500; body: CorridorsApiErrorResponse }>;

export type CorridorApiResult =
  | Readonly<{ status: 200; body: PublicCorridorResponse }>
  | Readonly<{ status: 400 | 404 | 500; body: CorridorApiErrorResponse }>;
