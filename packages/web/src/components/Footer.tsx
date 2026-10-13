import { useEffect, useState } from "react";
import { getStatus } from "../api";
import type { Game } from "../context/GameContext";
import { LegalModal, type LegalDoc } from "./LegalModal";

// Must track deploy/configure.sh's INGEST_INTERVAL (defaults to 1h there) --
// the frontend has no way to read that server-side cron config directly, so
// "next refresh" is an estimate (last snapshot + this), not a guarantee. If
// that interval ever changes, update this to match.
const INGEST_INTERVAL_MS = 60 * 60 * 1000;

// Fetches /api/status for one game once (no polling -- a footer line isn't
// worth repeatedly hitting the API for) and shows a plain clock time for
// when the next refresh is expected, rather than a live countdown.
function useNextRefresh(game: Game): string | null {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setText(null);
    getStatus(game)
      .then((res) => {
        if (cancelled || !res.updatedAt) return;
        setText(formatNextRefreshTime(new Date(res.updatedAt).getTime()));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [game]);

  return text;
}

function formatNextRefreshTime(lastUpdatedMs: number): string {
  const nextAtMs = lastUpdatedMs + INGEST_INTERVAL_MS;
  // The estimate is computed once (no polling, see useNextRefresh above), so
  // if the real ingest run is overdue (failing, or just running late) this
  // would otherwise show a clock time already in the past as if it were
  // still upcoming.
  if (nextAtMs <= Date.now()) return "any moment";
  return new Date(nextAtMs).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function Footer() {
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null);
  const runescapeNext = useNextRefresh("runescape");
  const runeliteNext = useNextRefresh("runelite");

  return (
    <footer className="site-footer">
      <div className="rune-band" />
      <div className="site-footer-inner">
        <div className="footer-top">
          <div className="footer-brand">
            <span className="brand-font footer-wordmark">
              Plugin<span className="brand-pulse">Pulse</span>
            </span>
            <p className="site-footer-disclaimer">
              RuneScape PluginPulse is a fan-made project and is not affiliated with, endorsed or sponsored by Jagex Ltd. RuneScape
              and Jagex are trademarks of Jagex Ltd. Plugin data is sourced from mod.io.
            </p>
          </div>
          <nav aria-label="Footer" className="footer-nav">
            <a
              href="https://discord.gg/gHN7c9B5FU"
              target="_blank"
              rel="noopener"
              className="footer-discord pp-tip pp-tip--up"
              data-tooltip="Get help on the PluginPulse Discord"
            >
              <img src="/icons/game-controller.svg" alt="" width={14} height={14} />
              Support ↗
            </a>
            <a
              href="https://ko-fi.com/mark7625"
              target="_blank"
              rel="noopener"
              className="footer-kofi pp-tip pp-tip--up"
              data-tooltip="Support PluginPulse on Ko-fi"
            >
              <CoffeeIcon />
              Buy me a coffee ↗
            </a>
            <button className="footer-link" onClick={() => setLegalDoc("cookies")}>
              Cookie policy
            </button>
            <button className="footer-link" onClick={() => setLegalDoc("privacy")}>
              Privacy policy
            </button>
            <button className="footer-link" onClick={() => setLegalDoc("terms")}>
              Terms of use
            </button>
          </nav>
        </div>
        <div className="site-footer-bottom">
          <span>© {new Date().getFullYear()} PluginPulse. All rights reserved.</span>
          <span>
            RuneScape data {runescapeNext ? `refreshes ~${runescapeNext}` : "refreshes roughly every hour"} · RuneLite/OSRS data{" "}
            {runeliteNext ? `refreshes ~${runeliteNext}` : "refreshes roughly every hour"}.
          </span>
        </div>
      </div>

      {legalDoc && <LegalModal doc={legalDoc} onClose={() => setLegalDoc(null)} />}
    </footer>
  );
}

function CoffeeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 6.5h9v3.5a3 3 0 01-3 3h-3a3 3 0 01-3-3V6.5Z" />
      <path d="M11.5 7h1a1.8 1.8 0 010 3.6h-1" />
      <path d="M5.2 4.3c-.4-.5-.4-1 0-1.6M7.8 4.3c-.4-.5-.4-1 0-1.6" />
    </svg>
  );
}
