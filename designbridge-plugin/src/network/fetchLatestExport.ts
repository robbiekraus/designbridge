// Tries a list of URLs in order (live first, then local fallback) and returns
// the first URL whose request *connects* — a resolved fetch, even with a
// non-2xx status, is a real server response and is returned as-is (no
// fallback). Falling through to the next URL only happens when the request
// itself throws (offline, refused, DNS failure, etc). Pure logic, no DOM/figma
// global — unit-testable under node:test, same pattern as writer/parsePayload.ts.

export interface FetchLikeResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type FetchImpl = (url: string) => Promise<FetchLikeResponse>;

export interface FetchLatestExportResult {
  url: string;
  response: FetchLikeResponse;
}

export async function fetchLatestExport(
  urls: readonly string[],
  fetchImpl: FetchImpl
): Promise<FetchLatestExportResult> {
  if (urls.length === 0) {
    throw new Error('fetchLatestExport: no URLs provided');
  }

  let lastError: unknown;
  for (const url of urls) {
    try {
      const response = await fetchImpl(url);
      return { url, response };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
