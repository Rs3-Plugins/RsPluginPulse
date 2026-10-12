// Shared with the author-slug resolver below -- must stay byte-for-byte
// the same algorithm used to produce the slugs rows are annotated with,
// or a slug returned by the API would fail to resolve back to its row.
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
