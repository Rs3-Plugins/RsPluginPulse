import { Dropdown } from "./Dropdown";

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onPage,
  onPageSize,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
  onPageSize: (pageSize: number) => void;
}) {
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const pages = pageWindow(page, pageCount);

  return (
    <div className="pagination">
      <div className="pagination-left">
        <div className="page-size-select">
          <span>Rows per page</span>
          <Dropdown
            value={String(pageSize)}
            options={PAGE_SIZE_OPTIONS.map((size) => ({ value: String(size), label: String(size) }))}
            onChange={(v) => onPageSize(Number(v))}
            ariaLabel="Rows per page"
          />
        </div>
        <span>
          Showing {start}–{end} of {total}
        </span>
      </div>
      <div className="pagination-controls">
        <button className="page-btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          ‹ Prev
        </button>
        {pages.map((p, i) =>
          p === null ? (
            <span key={`ellipsis-${i}`} style={{ padding: "0 4px" }}>
              …
            </span>
          ) : (
            <button key={p} className={`page-btn ${p === page ? "active" : ""}`} onClick={() => onPage(p)}>
              {p}
            </button>
          ),
        )}
        <button className="page-btn" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
          Next ›
        </button>
      </div>
    </div>
  );
}

function pageWindow(current: number, count: number): (number | null)[] {
  const pages = new Set<number>([1, count, current, current - 1, current + 1]);
  const sorted = Array.from(pages)
    .filter((p) => p >= 1 && p <= count)
    .sort((a, b) => a - b);

  const result: (number | null)[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) result.push(null);
    result.push(p);
    prev = p;
  }
  return result;
}
