// Shared with the author-slug resolver below -- must stay byte-for-byte
// the same algorithm used to produce the slugs rows are annotated with,
// or a slug returned by the API would fail to resolve back to its row.
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// A looser fallback than slugify() -- drops separators entirely instead of
// collapsing them to a hyphen, so "117 hd", "117_HD", and "117-hd" all
// normalize the same way as the canonical "117hd". Used only as a second
// pass when an exact slug match fails, so a hand-typed or lightly-mangled
// URL still resolves instead of 404ing over formatting alone.
export function normalizeSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}
