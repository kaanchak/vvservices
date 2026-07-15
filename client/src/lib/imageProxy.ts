/**
 * Returns the correct image URL for display.
 *
 * Scraped images are re-hosted to /manus-storage/... at scrape time, so they
 * pass through directly with no CORS issues. Any remaining external URLs
 * (user-pasted URLs, legacy records) are routed through /api/image-proxy as
 * a fallback so they still display rather than breaking.
 */
export function proxiedImageUrl(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  // Relative paths (/manus-storage/..., /api/image-proxy/...) and data URIs — serve directly
  if (url.startsWith("/") || url.startsWith("data:")) {
    return url;
  }
  // External URLs — route through image proxy as fallback
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return `/api/image-proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}
