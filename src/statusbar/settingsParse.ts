// Input parsers for the Settings form. Kept out of settingsFields.tsx so
// that file exports only components (react-refresh requirement).

export function numInit(n: number | undefined): string {
  return n == null ? '' : String(n);
}

export function parseOptional(s: string): number | undefined {
  const trimmed = s.trim();
  if (!trimmed) return undefined;
  const n = parseFloat(trimmed);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function parseLatLon(s: string, max: number): number | null {
  const trimmed = s.trim();
  if (!trimmed) return null;
  const n = parseFloat(trimmed);
  if (!Number.isFinite(n)) return null;
  if (n < -max || n > max) return null;
  return n;
}
