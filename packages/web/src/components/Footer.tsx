import { useState } from "react";
import { LegalModal, type LegalDoc } from "./LegalModal";

export function Footer() {
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null);

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
            <a href="https://discord.gg/gHN7c9B5FU" target="_blank" rel="noopener" className="footer-discord">
              <DiscordIcon />
              Support ↗
            </a>
            <a href="https://ko-fi.com/mark7625" target="_blank" rel="noopener" className="footer-kofi">
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
          <span>Data refreshed from mod.io every few minutes.</span>
        </div>
      </div>

      {legalDoc && <LegalModal doc={legalDoc} onClose={() => setLegalDoc(null)} />}
    </footer>
  );
}

function DiscordIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4.6c0-1.16.94-2.1 2.1-2.1h7.8c1.16 0 2.1.94 2.1 2.1V9.4c0 1.16-.94 2.1-2.1 2.1H7l-2.8 2.6v-2.6H4.1C2.94 11.5 2 10.56 2 9.4V4.6Z" />
      <circle cx="5.6" cy="7" r="0.55" fill="currentColor" stroke="none" />
      <circle cx="8" cy="7" r="0.55" fill="currentColor" stroke="none" />
      <circle cx="10.4" cy="7" r="0.55" fill="currentColor" stroke="none" />
    </svg>
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
