// Tiny classnames helper used across UI components.
// Conditionally joins `truthy` strings and ignores falsy.
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
