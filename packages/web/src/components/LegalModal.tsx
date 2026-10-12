export type LegalDoc = "cookies" | "privacy" | "terms";

const TITLES: Record<LegalDoc, string> = {
  cookies: "Cookie policy",
  privacy: "Privacy policy",
  terms: "Terms of use",
};

interface Props {
  doc: LegalDoc;
  onClose: () => void;
}

export function LegalModal({ doc, onClose }: Props) {
  return (
    <div className="legal-overlay" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="legal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="card-edge" />
        <div className="legal-dialog-header">
          <div>
            <h2>{TITLES[doc]}</h2>
            <div className="legal-dialog-meta">rspluginpulse.com · Last updated Oct 11, 2026</div>
          </div>
          <button className="legal-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="legal-body">
          {doc === "cookies" && <CookiesBody />}
          {doc === "privacy" && <PrivacyBody />}
          {doc === "terms" && <TermsBody />}
        </div>
        <div className="legal-dialog-footer">
          <button className="legal-ok" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

function CookiesBody() {
  return (
    <>
      <h3>What we use</h3>
      <p>PluginPulse uses a small amount of browser storage to make the site work. We do not use advertising or cross-site tracking cookies.</p>
      <ul>
        <li>
          <strong>Essential:</strong> remembers your light or dark theme and your leaderboard filters. Stored in your browser only.
        </li>
        <li>
          <strong>Analytics (optional):</strong> privacy-friendly, aggregated page-view counts so we know which pages are useful. No
          personal profiles are built.
        </li>
      </ul>
      <h3>Third-party sites</h3>
      <p>Links to mod.io and Discord take you to sites with their own cookie policies.</p>
      <h3>Managing cookies</h3>
      <p>You can clear or block cookies and site storage in your browser settings. The site will still work, but your theme and filters won't be remembered.</p>
    </>
  );
}

function PrivacyBody() {
  return (
    <>
      <h3>What we collect</h3>
      <p>You don't need an account to use PluginPulse, and we don't ask for personal information.</p>
      <ul>
        <li>Standard server logs (IP address, browser type, pages requested), kept for up to 30 days for security and abuse prevention.</li>
        <li>Aggregated, anonymous usage statistics if analytics are enabled.</li>
      </ul>
      <h3>Public plugin data</h3>
      <p>
        Plugin names, author names and download, install and subscriber counts are taken from public mod.io listings. If you're an
        author and want your profile hidden from PluginPulse, contact us on Discord.
      </p>
      <h3>Sharing</h3>
      <p>We don't sell or share personal data. Hosting and analytics providers process data only to run the site.</p>
      <h3>Contact</h3>
      <p>
        Questions or removal requests: join our{" "}
        <a href="https://discord.gg/gHN7c9B5FU" target="_blank" rel="noopener">
          Discord
        </a>
        .
      </p>
    </>
  );
}

function TermsBody() {
  return (
    <>
      <h3>About this site</h3>
      <p>
        RuneScape PluginPulse is an independent fan project. It is not affiliated with, endorsed or sponsored by Jagex Ltd. or mod.io.
        RuneScape and Jagex are trademarks of Jagex Ltd.
      </p>
      <h3>Data accuracy</h3>
      <p>Statistics are collected from mod.io on a schedule and may be delayed, incomplete or wrong. The site is provided as is, without warranties of any kind.</p>
      <h3>Acceptable use</h3>
      <ul>
        <li>Don't overload the site with automated requests or scraping.</li>
        <li>Don't try to break, probe or bypass site security.</li>
        <li>Linking to and sharing pages is welcome.</li>
      </ul>
      <h3>Changes</h3>
      <p>We may update these terms. The date above shows the latest version.</p>
    </>
  );
}
