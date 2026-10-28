/** Prefix static assets when deployed below a subpath. */
export function buildUrl(path: string): string {
  return (process.env.NEXT_PUBLIC_BASE_PATH || "") + path;
}
