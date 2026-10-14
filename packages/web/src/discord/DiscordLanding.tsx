import { discordInstallUrl } from "../api";
import { useDiscordAuth } from "./DiscordAuthContext";
import { usePageMeta } from "../hooks/usePageMeta";

const FEATURES = [
  { title: "Slash commands", body: "/plugin, /author, /rank and /leaderboard, with autocomplete on every name." },
  { title: "Watch alerts", body: "Post to a channel when a watched plugin or author rises or drops past your threshold." },
  { title: "Live channel topics", body: "Templates like “{installs} installs · #{rank}” refresh every hour." },
  { title: "Your own stats", body: "Authors run /link once, then /mystats shows their numbers in any server." },
];

export function DiscordLanding() {
  usePageMeta({
    title: "PluginPulse for Discord",
    description: "Look up RuneScape and RuneLite plugin stats, get watch alerts, and keep channel topics live -- right in your Discord server.",
    canonicalPath: "/discord",
  });

  const { logIn } = useDiscordAuth();

  function addToDiscord() {
    // A real top-level navigation, not a fetch -- same reasoning as logIn.
    window.location.href = discordInstallUrl();
  }

  return (
    <>
      <section className="dc-hero">
        <div className="dc-hero__copy">
          <span className="dc-eyebrow brand-font">DISCORD BOT</span>
          <h1 className="dc-h1 brand-font">Plugin stats, right in your server</h1>
          <p className="dc-hero__body">
            Look up any RuneScape or RuneLite plugin with a slash command, get alerts when the ones you watch spike or drop, and keep channel topics
            showing live numbers. Configure all of it here instead of with command flags.
          </p>
          <div className="dc-hero__actions">
            <button type="button" className="dc-pill-primary" onClick={addToDiscord}>
              Add to Discord
            </button>
            <button type="button" className="dc-pill-outline dc-pill-outline--lg" onClick={logIn}>
              Log in to manage a server
            </button>
          </div>
          <span className="dc-note">You need Manage Server permission to add the bot or change its settings.</span>
        </div>
        <div className="dc-hero__demo">
          <span className="dc-hero__cmd">/plugin ground markers</span>
          <div className="dc-discord-msg">
            <img src="/logo/icon-2a-hex.svg" alt="" className="dc-discord-msg__avatar" />
            <div className="dc-discord-msg__body">
              <div className="dc-discord-msg__head">
                <b>PluginPulse</b>
                <span className="dc-discord-tag dc-discord-tag--bot">BOT</span>
                <span className="dc-discord-msg__time">Today at 14:02</span>
              </div>
              <div className="dc-embed" style={{ borderLeftColor: "#caa44d" }}>
                <div className="dc-embed__head">
                  <b className="dc-embed__title" style={{ color: "#e8c874" }}>
                    Ground Markers
                  </b>
                  <span className="dc-embed__by">by Ironwick · RuneScape</span>
                </div>
                <div className="dc-embed__fields">
                  <div className="dc-embed__field">
                    <span className="dc-embed__field-k">Installs</span>
                    <span className="dc-embed__field-v">414k</span>
                  </div>
                  <div className="dc-embed__field">
                    <span className="dc-embed__field-k">Subscribers</span>
                    <span className="dc-embed__field-v">61.8k</span>
                  </div>
                  <div className="dc-embed__field">
                    <span className="dc-embed__field-k">Rank</span>
                    <span className="dc-embed__field-v">#1</span>
                  </div>
                </div>
                <span className="dc-embed__foot">PluginPulse · updated hourly</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="dc-feature-strip">
        {FEATURES.map((f) => (
          <div key={f.title} className="dc-feature-cell">
            <b>{f.title}</b>
            <span>{f.body}</span>
          </div>
        ))}
      </section>
    </>
  );
}
