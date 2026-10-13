import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { discordLoginUrl, discordLogout, getDiscordMe, type DiscordUserInfo } from "../api";

// Real "Log in with Discord" session (identify + guilds scopes, see
// packages/api/src/lib/discordAuth.ts), shared across /discord/* via
// context so the header and Landing's CTAs stay in sync. `loading` covers
// the brief window before the initial /api/discord/me check resolves, so
// consumers don't flash a signed-out state on every page load.
interface DiscordAuth {
  loading: boolean;
  signedIn: boolean;
  user: DiscordUserInfo | null;
  logIn: () => void;
  logOut: () => Promise<void>;
}

const DiscordAuthContext = createContext<DiscordAuth | null>(null);

export function DiscordAuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<DiscordUserInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDiscordMe()
      .then((res) => {
        if (cancelled) return;
        setUser(res.signedIn ? (res.user ?? null) : null);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function logIn() {
    // A real top-level navigation, not a fetch -- OAuth has to hand the
    // browser to Discord's own consent screen and back.
    window.location.href = discordLoginUrl();
  }

  async function logOut() {
    await discordLogout().catch(() => {});
    setUser(null);
  }

  return (
    <DiscordAuthContext.Provider value={{ loading, signedIn: user !== null, user, logIn, logOut }}>{children}</DiscordAuthContext.Provider>
  );
}

export function useDiscordAuth(): DiscordAuth {
  const ctx = useContext(DiscordAuthContext);
  if (!ctx) throw new Error("useDiscordAuth must be used within DiscordAuthProvider");
  return ctx;
}
