export type DirectoryType = "anchors" | "corridors";

export type DirectoryExportOptions = Readonly<{
  maxLimit?: number;
  pageSize?: number;
  signal?: AbortSignal;
}>;

export type DirectoryExportResult<T> =
  | Readonly<{
      ok: true;
      type: DirectoryType;
      items: readonly T[];
      totalRetrieved: number;
      isPartial: boolean;
      safetyLimit: number;
      csv: string;
      filename: string;
    }>
  | Readonly<{
      ok: false;
      type: DirectoryType;
      error: string;
    }>;

export type DirectoryFetchResult<T> =
  | Readonly<{
      ok: true;
      items: readonly T[];
      totalCount: number;
      isPartial: boolean;
      safetyLimit: number;
    }>
  | Readonly<{
      ok: false;
      error: string;
    }>;
