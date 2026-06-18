// Single source of truth for the deployment basePath.
// Read at build time and inlined into the client bundle by Next.js.
// See: https://nextjs.org/docs/app/api-reference/config/next-config-js/basePath
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

// Prefix an absolute, app-relative URL with the basePath. Use for raw
// fetch() URLs and <a href> strings that are NOT navigated through
// next/link (which prepends basePath automatically).
export function withBasePath(url: string): string {
  return `${basePath}${url}`;
}
