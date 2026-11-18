export type PublicAnchorStatus = "LIVE" | "DEGRADED" | "DOWN" | "UNKNOWN";

export type PublicAnchorSummary = Readonly<{
  slug: string;
  name: string;
  homeDomain: string;
  status: PublicAnchorStatus;
  seps: readonly number[];
  isTransferCapable: boolean;
  corridorCount: number;
}>;

export type PublicAnchorCorridor = Readonly<{
  slug: string;
  sourceAsset: string;
  sourceCountry: string;
  destinationAsset: string;
  destinationCountry: string;
}>;

export type PublicAnchorDetail = Readonly<{
  slug: string;
  name: string;
  homeDomain: string;
  status: PublicAnchorStatus;
  seps: readonly number[];
  isTransferCapable: boolean;
  corridors: readonly PublicAnchorCorridor[];
}>;

export type PublicAnchorsResponse = Readonly<{
  anchors: readonly PublicAnchorSummary[];
  count: number;
}>;

export type PublicAnchorResponse = Readonly<{
  anchor: PublicAnchorDetail;
}>;

export type AnchorsApiErrorCode =
  | "invalid_anchor_slug"
  | "anchor_not_found"
  | "invalid_pagination"
  | "internal_error";

export type AnchorsApiErrorResponse = Readonly<{
  error: Readonly<{
    code: AnchorsApiErrorCode;
    message: string;
  }>;
}>;

export type AnchorsApiResult =
  | Readonly<{ status: 200; body: PublicAnchorsResponse }>
  | Readonly<{ status: 400 | 500; body: AnchorsApiErrorResponse }>;

export type AnchorApiResult =
  | Readonly<{ status: 200; body: PublicAnchorResponse }>
  | Readonly<{ status: 400 | 404 | 500; body: AnchorsApiErrorResponse }>;
