import type { Period } from "@rspluginpulse/db";

const PERIODS: Period[] = ["alltime", "hot", "weekly", "monthly"];

export function parsePeriod(value: string | null): Period | null {
  if (value && (PERIODS as string[]).includes(value)) return value as Period;
  return null;
}
