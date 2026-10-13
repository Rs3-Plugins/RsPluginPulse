// Shared by every route that takes a ?limit= (and similar bounded
// numeric params) -- the same "clamp to [min, max], fall back to default
// on anything non-numeric" parse was previously copy-pasted per route
// with only the upper bound actually enforced (`Math.min(Number(x) ||
// default, max)`), which let a negative value like ?limit=-5 straight
// through to a SQL `LIMIT` clause and crashed with a raw Postgres error
// instead of a clean response.
export function parseBoundedInt(value: string | null, fallback: number, min: number, max: number): number {
  if (value === null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}
