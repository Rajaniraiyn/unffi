import { siteUrl } from './shared';

// Single source of truth for deployment basePath. Inlined at build time
// (Next.js inlines NEXT_PUBLIC_* into the client bundle).
// See https://nextjs.org/docs/app/api-reference/config/next-config-js/basePath
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

// Prefix an app-relative URL with the basePath. Use for raw fetch() URLs
// and <a href> strings — anything that does NOT go through next/link
// (which prepends basePath automatically).
export function withBasePath(url: string): string {
  return `${basePath}${url}`;
}

// Build a fully-qualified URL (siteUrl + basePath + path). Use anywhere
// we need an absolute URL the user might paste into another tool (LLM
// prompts, social shares, RSS feeds, metadata).
export function absoluteUrl(path: string): string {
  return `${siteUrl}${withBasePath(path)}`;
}
