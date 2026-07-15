/**
 * Returns a proxied image URL that routes through our backend,
 * bypassing CORS restrictions on external jewellery site images.
 *
 * Only proxies http/https URLs that look external.
 * Passes through relative paths, data URIs, and already-proxied URLs unchanged.
 */
export function proxiedImageUrl(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  // Already proxied, data URI, or relative path — pass through
  if (
    url.startsWith("/api/image-proxy") ||
    url.startsWith("data:") ||
    url.startsWith("/")
  ) {
    return url;
  }
  // Only proxy http/https external URLs
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return `/api/image-proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}
