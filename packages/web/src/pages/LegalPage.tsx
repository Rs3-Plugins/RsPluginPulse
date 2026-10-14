import { LEGAL_DESCRIPTIONS, LEGAL_TITLES, LegalBody, type LegalDoc } from "../legalContent";
import { usePageMeta } from "../hooks/usePageMeta";

// Real, directly-loadable URLs for the three legal docs -- /terms,
// /privacy, /cookies (see main.tsx's routes, one per LegalDoc value) --
// not just the footer's old in-app-only modal. Discord's Developer Portal
// (Terms of Service URL / Privacy Policy URL fields) and anything else
// that asks for a legal-doc link need an actual URL to point to, not
// something only reachable by clicking a button inside the app.
export function LegalPage({ doc }: { doc: LegalDoc }) {
  usePageMeta({
    title: `${LEGAL_TITLES[doc]} — RuneScape PluginPulse`,
    description: LEGAL_DESCRIPTIONS[doc],
    canonicalPath: `/${doc}`,
  });

  return (
    <div className="page">
      <div className="board-head">
        <h1>{LEGAL_TITLES[doc]}</h1>
        <p className="subtitle subtitle-sm">rspluginpulse.com · Last updated Oct 13, 2026</p>
      </div>
      <div className="legal-body legal-page-body">
        <LegalBody doc={doc} />
      </div>
    </div>
  );
}
