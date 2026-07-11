/** Collision-safe id for stored entities (waypoints, routes). Falls back
 *  when crypto.randomUUID is unavailable (older WebViews, http dev hosts). */
export function newId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}
