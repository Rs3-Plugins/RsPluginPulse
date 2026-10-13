// Shared by LegalPage.tsx (the real /terms, /privacy, /cookies routes --
// needed so there's an actual stable URL to hand to Discord's Developer
// Portal Terms of Service/Privacy Policy fields and anything else that
// asks for one, not just an in-app modal with no URL of its own) and any
// future in-app quick-view of the same text. One copy of the actual legal
// wording, not duplicated between a page and a modal.
export type LegalDoc = "cookies" | "privacy" | "terms";

export const LEGAL_TITLES: Record<LegalDoc, string> = {
  cookies: "Cookie policy",
  privacy: "Privacy policy",
  terms: "Terms of use",
};

export const LEGAL_DESCRIPTIONS: Record<LegalDoc, string> = {
  cookies: "How RuneScape PluginPulse uses cookies and browser storage.",
  privacy: "RuneScape PluginPulse's privacy policy — what data we collect and how it's used.",
  terms: "Terms of use for RuneScape PluginPulse, an independent RuneScape/RuneLite plugin statistics site.",
};

export function LegalBody({ doc }: { doc: LegalDoc }) {
  if (doc === "cookies") return <CookiesBody />;
  if (doc === "privacy") return <PrivacyBody />;
  return <TermsBody />;
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
          <strong>Discord dashboard session:</strong> if you log in with Discord at /discord, a session cookie keeps you signed in. Only
          set when you choose to log in, and cleared when you log out or it expires.
        </li>
        <li>
          <strong>Analytics (optional):</strong> privacy-friendly, aggregated page-view counts so we know which pages are useful. No
          personal profiles are built.
        </li>
      </ul>
      <h3>Third-party sites</h3>
      <p>Links to mod.io, GitHub and Discord take you to sites with their own cookie policies.</p>
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
        Plugin names, author names and download, install and subscriber counts are taken from public mod.io listings (RuneScape) and the
        RuneLite plugin hub (RuneLite). If you're an author and want your profile hidden from PluginPulse, contact us on Discord.
      </p>
      <h3>Discord bot &amp; dashboard</h3>
      <p>
        If you log in with Discord at /discord, we store your Discord user ID, username and avatar in a session so the dashboard knows
        who's signed in. To show which servers you can manage, we ask Discord for your server list and your permissions there at the
        time you view it — that list isn't stored beyond your active session.
      </p>
      <p>
        Per-server bot settings (nickname, avatar) are sent straight to Discord's own systems when you save them; we don't keep a copy.
        You can revoke PluginPulse's access at any time from Discord's own{" "}
        <a href="https://discord.com/settings/authorized-apps" target="_blank" rel="noopener">
          Authorized Apps
        </a>{" "}
        settings.
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
        RuneScape PluginPulse is an independent fan project. It is not affiliated with, endorsed or sponsored by Jagex Ltd., mod.io,
        or the RuneLite project. RuneScape and Jagex are trademarks of Jagex Ltd.
      </p>
      <h3>Data accuracy</h3>
      <p>Statistics are collected from mod.io and the RuneLite plugin hub on a schedule and may be delayed, incomplete or wrong. The site is provided as is, without warranties of any kind.</p>
      <h3>Discord bot &amp; dashboard</h3>
      <p>
        The PluginPulse Discord bot and /discord dashboard are optional and not affiliated with, endorsed or sponsored by Discord Inc.
        Using them means granting the bot and dashboard the Discord permissions you choose during login/install, which you can revoke at
        any time from Discord's own settings. Some dashboard features may require a paid subscription in future; none are live yet.
      </p>
      <h3>Acceptable use</h3>
      <ul>
        <li>Don't overload the site with automated requests or scraping.</li>
        <li>Don't try to break, probe or bypass site or bot security.</li>
        <li>Linking to and sharing pages is welcome.</li>
      </ul>
      <h3>Changes</h3>
      <p>We may update these terms. The date above shows the latest version.</p>
    </>
  );
}
