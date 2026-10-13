// Postgres' `integer` columns are 4-byte (see schema.sql) -- a route-param
// id that's a valid JS integer but outside this range (e.g. a hand-edited
// URL) would otherwise reach a parameterized query and make Postgres
// itself throw ("value out of range for type integer"), surfacing as an
// unhandled 500 instead of a clean 400/404. `Number.isInteger` alone
// doesn't catch this, since JS integers safely cover a much wider range.
const INT4_MIN = -2147483648;
const INT4_MAX = 2147483647;

export function isInt4(n: number): boolean {
  return Number.isInteger(n) && n >= INT4_MIN && n <= INT4_MAX;
}
