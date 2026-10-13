// "Log in with Discord" (identify + guilds scopes) for the /discord
// dashboard -- a separate OAuth2 flow from the (not yet built) bot-install
// "Add to Discord" one. See docs/discord-bot.md and the discord_sessions
// table in packages/db/src/schema.sql.
//
// Required env (see .env.example): DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET,
// DISCORD_REDIRECT_URI (this API's own /api/discord/oauth/callback URL,
// must exactly match what's registered in the Discord app's OAuth2 tab),
// WEB_APP_URL (the web app's origin -- used both as the post-login redirect
// target and as the CORS allowlist for these session-cookie routes, which
// can't use the rest of the API's wildcard CORS since credentialed
// requests and `Access-Control-Allow-Origin: *` are mutually exclusive).
import { NextResponse } from "next/server";
import {
  createDiscordSession,
  deleteDiscordSession,
  getDiscordSession,
  isGuildAdmin,
  isGuildSubscribed,
  isSiteAdmin,
  updateDiscordSessionTokens,
  type DiscordSession,
} from "@rspluginpulse/db";

const DISCORD_API = "https://discord.com/api/v10";
const SCOPES = "identify guilds";
export const SESSION_COOKIE = "pp_discord_session";
export const STATE_COOKIE = "pp_discord_oauth_state";

// The bot-install flow reuses the exact same registered DISCORD_REDIRECT_URI
// as the login flow (so there's nothing extra to add in the Developer
// Portal) -- this fixed, non-random state value is how /oauth/callback
// tells the two apart. It's not a CSRF token here the way the login
// flow's random per-request state is: nothing sensitive happens on this
// branch (no code exchange, no session created), it's purely "which kind
// of request landed here" so the callback can skip straight to redirecting
// back to the dashboard.
export const INSTALL_STATE = "install";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

// Generalizes the cache + in-flight de-dup pattern requireManageableGuild
// pioneered below for its own guildAccessCache (same reasoning: a single
// dashboard page load routinely fires several reads of the same guild's
// roles/channels/member data at once, each of which used to be its own
// fresh Discord round trip). A rejected fetcher() is never cached -- only
// successful results are, so a transient failure doesn't get "stuck"
// for the rest of the TTL window.
function createCachedLoader<T>(ttlMs: number): (key: string, fetcher: () => Promise<T>) => Promise<T> {
  const cache = new Map<string, { value: T; expiresAt: number }>();
  const inFlight = new Map<string, Promise<T>>();
  return (key, fetcher) => {
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value);

    const existing = inFlight.get(key);
    if (existing) return existing;

    const promise = (async () => {
      try {
        const value = await fetcher();
        cache.set(key, { value, expiresAt: Date.now() + ttlMs });
        return value;
      } finally {
        inFlight.delete(key);
      }
    })();
    inFlight.set(key, promise);
    return promise;
  };
}

// 2 minutes matches GUILD_ACCESS_CACHE_MS's own reasoning further down --
// long enough to collapse a page load's burst of requests, short enough
// that a role/channel add-or-rename in Discord shows up well within a
// normal browsing session.
const SHORT_CACHE_MS = 2 * 60 * 1000;
// Longer-lived: a Discord username/avatar or guild membership changes
// far less often than roles/channels do, so there's less value in
// keeping this one as tight -- and for fetchGuildMember specifically, a
// longer TTL matters more: the Linked authors tab checks membership for
// every discord_author_links row site-wide (see its own route comment),
// most of which aren't even in the guild being viewed, so caching the
// (common) "not a member here" result for longer meaningfully cuts
// repeat-visit cost as that table grows.
const LONG_CACHE_MS = 10 * 60 * 1000;

// Talks to packages/discord-bot's own internal cache server
// (internalServer.ts) instead of Discord REST, for the handful of reads
// its live Gateway connection already covers for free (guild/channel/
// role data, the bot's own account -- see that file's own comment on
// what's deliberately excluded and why). Purely an optimization: returns
// null on any failure (not configured, bot process down, request
// timeout) rather than throwing, so every caller below falls straight
// through to its existing REST implementation with no new failure mode.
const INTERNAL_BRIDGE_TIMEOUT_MS = 1500;

// Logged as a running milestone count (not per-call -- this can fire a
// lot on an active dashboard) so there's actual visible evidence the
// bridge is doing something, rather than just trusting it silently works.
// A bridge *failure* (configured but unreachable/erroring) logs
// immediately instead, since that's the one case worth knowing about
// right away -- it just silently degrades to REST, but a persistently
// unreachable bridge probably means the bot process is down.
let bridgeHitCount = 0;
const BRIDGE_HIT_LOG_INTERVAL = 20;

async function internalFetch<T>(path: string): Promise<T | null> {
  const secret = process.env.DISCORD_BOT_INTERNAL_SECRET;
  if (!secret) return null;
  const base = process.env.DISCORD_BOT_INTERNAL_URL ?? `http://127.0.0.1:${process.env.DISCORD_BOT_INTERNAL_PORT ?? "3100"}`;

  try {
    const response = await fetch(`${base}${path}`, {
      headers: { "x-internal-secret": secret },
      signal: AbortSignal.timeout(INTERNAL_BRIDGE_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`Internal cache bridge ${path} -> HTTP ${response.status}, falling back to REST`);
      return null;
    }
    bridgeHitCount++;
    if (bridgeHitCount % BRIDGE_HIT_LOG_INTERVAL === 0) {
      console.log(`Internal cache bridge: ${bridgeHitCount} Discord REST calls avoided so far this run`);
    }
    return (await response.json()) as T;
  } catch (error) {
    console.warn(`Internal cache bridge unreachable for ${path}, falling back to REST:`, error instanceof Error ? error.message : error);
    return null;
  }
}

// Sibling to internalFetch above, for the one bridge endpoint where a 404
// is a normal, common, cacheable *answer* (not a member of this guild --
// the majority case for the Linked authors tab, see fetchGuildMember's
// own comment) rather than a sign the bridge itself failed. Using
// internalFetch's plain "any non-ok -> null -> fall back to REST"
// contract here would silently defeat the cache for exactly the case it
// most needs to cover. Returns { found: false } to mean "bridge
// confirmed: not a member" vs undefined to mean "ask REST instead".
async function internalFetchMember(guildId: string, userId: string): Promise<{ found: true; value: { username: string; avatarUrl: string } } | { found: false } | undefined> {
  const secret = process.env.DISCORD_BOT_INTERNAL_SECRET;
  if (!secret) return undefined;
  const base = process.env.DISCORD_BOT_INTERNAL_URL ?? `http://127.0.0.1:${process.env.DISCORD_BOT_INTERNAL_PORT ?? "3100"}`;

  try {
    const response = await fetch(`${base}/guilds/${guildId}/members/${userId}`, {
      headers: { "x-internal-secret": secret },
      signal: AbortSignal.timeout(INTERNAL_BRIDGE_TIMEOUT_MS),
    });
    if (response.status === 404) {
      bridgeHitCount++;
      return { found: false };
    }
    if (!response.ok) {
      console.warn(`Internal cache bridge /guilds/${guildId}/members/${userId} -> HTTP ${response.status}, falling back to REST`);
      return undefined;
    }
    bridgeHitCount++;
    if (bridgeHitCount % BRIDGE_HIT_LOG_INTERVAL === 0) {
      console.log(`Internal cache bridge: ${bridgeHitCount} Discord REST calls avoided so far this run`);
    }
    return { found: true, value: (await response.json()) as { username: string; avatarUrl: string } };
  } catch (error) {
    console.warn(`Internal cache bridge unreachable for /guilds/${guildId}/members/${userId}, falling back to REST:`, error instanceof Error ? error.message : error);
    return undefined;
  }
}

export function buildAuthorizeUrl(state: string): string {
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", requiredEnv("DISCORD_CLIENT_ID"));
  url.searchParams.set("redirect_uri", requiredEnv("DISCORD_REDIRECT_URI"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("state", state);
  return url.toString();
}

// The *other* OAuth2 flow (bot + applications.commands scopes) -- Discord's
// own consent screen handles the server picker, no code exchange needed on
// our end to know it worked: ManageableGuild's `botInstalled` flag (see
// fetchBotGuildIds below) picks it up the next time the guild list is
// fetched.
//
// Permissions requested -- covers both what's actually built today and
// what docs/discord-bot.md already plans, so a server only ever has to
// invite/re-invite once rather than every time a new feature ships:
//   0x4      Change Nickname    -- General tab's per-guild bot nickname
//   0x10     Manage Channels    -- Channel topics (edits a channel's topic)
//   0x400    View Channels      -- reading channel lists/topics at all
//   0x800    Send Messages      -- watch alerts, digests, milestones, any
//                                  bot-sent (non-interaction-reply) message
//   0x2000   Manage Messages    -- pinning the planned auto-updating
//                                  leaderboard embed
//   0x4000   Embed Links        -- every planned embed (alerts, digests,
//                                  /compare, /trend, the pinned leaderboard)
//   0x8000   Attach Files       -- posting /api/card PNGs as attachments
//   0x10000  Read Message History -- fetching/editing the bot's own prior
//                                  messages (the in-place-edited leaderboard)
//   0x20000  Mention Everyone, Here, and All Roles -- the planned "ping
//                                  @role on alert/milestone" option
// = 0x3EC14 (257044). A server that installed the bot before any of these
// were added won't have them granted -- its owner needs to re-invite
// (adding scope only ever grants more, never revokes what's already
// there) or grant the bot role the specific missing permission directly
// in the server's own settings. See isMissingPermissionsError below for
// how the dashboard detects this and prompts a re-invite.
const BOT_INVITE_PERMISSIONS = "257044";

// guildId, when given, pre-selects that specific server in Discord's own
// picker (and locks it there) -- used when "Invite" is clicked from a
// specific guild's card on /discord/servers, so the user doesn't have to
// re-find it in a dropdown Discord already knows they meant. Also what
// the dashboard links to when a Discord call fails with "missing
// permissions" -- re-inviting with the current (possibly wider than what
// that server granted last time) permission set above.
export function buildBotInstallUrl(guildId?: string): string {
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", requiredEnv("DISCORD_CLIENT_ID"));
  url.searchParams.set("scope", "bot applications.commands");
  url.searchParams.set("permissions", BOT_INVITE_PERMISSIONS);
  url.searchParams.set("redirect_uri", requiredEnv("DISCORD_REDIRECT_URI"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", INSTALL_STATE);
  if (guildId) {
    url.searchParams.set("guild_id", guildId);
    url.searchParams.set("disable_guild_select", "true");
  }
  return url.toString();
}

// Carries the HTTP status Discord actually responded with, so callers can
// tell a genuine rejection (401 on a Bearer token, 400 invalid_grant on a
// refresh token -- the credential really is dead) apart from a transient
// failure (429 rate limit, 5xx, or a plain network error with no response
// at all) that says nothing about whether the session is still good. Only
// the former should ever delete a session -- see getLiveSession and
// requireManageableGuild below, both of which used to treat *any* failure
// here as fatal and would delete a perfectly live session over a routine
// rate limit.
export class DiscordApiError extends Error {
  constructor(
    message: string,
    public status: number,
    // Discord's own parsed JSON error body, when there was one -- lets a
    // caller distinguish *which* rejection this was (e.g. the avatar
    // rate limit below) instead of just a status code.
    public body?: unknown,
  ) {
    super(message);
    this.name = "DiscordApiError";
  }
}

// Discord's own per-app avatar-change rate limit (distinct from, and much
// stricter than, the general REST rate limit) -- comes back as a 400 with
// this specific shape rather than a 429, so it has to be detected from the
// body, not the status code.
export function isAvatarRateLimit(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const errors = (body as { errors?: { avatar?: { _errors?: unknown } } }).errors?.avatar?._errors;
  return Array.isArray(errors) && errors.some((e) => (e as { code?: string })?.code === "AVATAR_RATE_LIMIT");
}

// Discord's generic "the bot doesn't have the permission this specific
// action needs" error -- comes back as a plain 403 with this numeric
// JSON error code (50013) regardless of which permission was actually
// missing (Manage Channels, Change Nickname, Send Messages, ...). Used to
// tell the dashboard apart from any other failure so it can prompt a
// re-invite (buildBotInstallUrl, now requesting a wider permission set --
// see its own comment) instead of just showing a generic error.
export function isMissingPermissionsError(body: unknown): boolean {
  return Boolean(body && typeof body === "object" && (body as { code?: number }).code === 50013);
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

async function tokenRequest(body: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    throw new DiscordApiError(`Discord token request failed: HTTP ${response.status} ${await response.text()}`, response.status);
  }
  return response.json();
}

export function exchangeCode(code: string): Promise<TokenResponse> {
  return tokenRequest(
    new URLSearchParams({
      client_id: requiredEnv("DISCORD_CLIENT_ID"),
      client_secret: requiredEnv("DISCORD_CLIENT_SECRET"),
      grant_type: "authorization_code",
      code,
      redirect_uri: requiredEnv("DISCORD_REDIRECT_URI"),
    }),
  );
}

function refreshToken(refresh: string): Promise<TokenResponse> {
  return tokenRequest(
    new URLSearchParams({
      client_id: requiredEnv("DISCORD_CLIENT_ID"),
      client_secret: requiredEnv("DISCORD_CLIENT_SECRET"),
      grant_type: "refresh_token",
      refresh_token: refresh,
    }),
  );
}

export interface DiscordUser {
  id: string;
  username: string;
  avatar: string | null;
}

export function avatarUrl(userId: string, avatarHash: string | null): string {
  if (avatarHash) return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png?size=64`;
  // No custom avatar set -- Discord's own default avatar, picked by the
  // snowflake's low bits (their current, post-username-migration scheme).
  const index = Number((BigInt(userId) >> BigInt(22)) % BigInt(6));
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

export async function fetchDiscordUser(accessToken: string): Promise<DiscordUser> {
  const response = await fetch(`${DISCORD_API}/users/@me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`GET /users/@me -> HTTP ${response.status}`);
  return response.json();
}

interface RawDiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
}

export interface ManageableGuild {
  id: string;
  name: string;
  iconUrl: string | null;
  owner: boolean;
  botInstalled: boolean;
}

// Discord's permission bitfield comes back as a decimal *string*, not a
// number -- it routinely exceeds Number.MAX_SAFE_INTEGER, so this has to
// stay a BigInt comparison rather than parsing it as a JS number.
const MANAGE_GUILD = BigInt(0x20);

// Kept separate from fetchBotGuildIds (rather than one combined function)
// so the route can tell apart "this session's access token is bad" (the
// user needs to log in again) from "the bot token is bad" (a server
// misconfiguration, nothing wrong with the user's session) -- they'd
// otherwise be indistinguishable Promise.all failures, and the former
// currently deletes the session while the latter very much shouldn't.
//
// Cached (keyed by the access token itself -- a natural per-session key,
// and a token that rotates on refresh just becomes a fresh cache key with
// nothing to invalidate) since this is Discord's single most aggressively
// rate-limited endpoint (see MAX_RETRY_WAIT_MS's comment below) and the
// most expensive one to get wrong -- both the /discord/servers list page
// and every requireManageableGuild check below call this.
const userGuildsLoader = createCachedLoader<RawDiscordGuild[]>(SHORT_CACHE_MS);

export async function fetchUserGuilds(accessToken: string): Promise<RawDiscordGuild[]> {
  return userGuildsLoader(accessToken, async () => {
    const response = await fetchWithRetry429(`${DISCORD_API}/users/@me/guilds`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new DiscordApiError(`GET /users/@me/guilds -> HTTP ${response.status}`, response.status);
    return response.json();
  });
}

// Discord can't give this app a higher rate limit on /users/@me/guilds --
// it's a fixed, aggressive anti-scraping limit tied to the calling
// token, not something that scales with bot verification or server
// count, and there's no request-more process for it. What this *can* do:
// Discord's own 429 response says exactly how long to wait (Retry-After
// header) before it'll succeed -- one short retry here silently absorbs
// most of the routine rate-limit blips this specific endpoint produces,
// instead of surfacing an error for something that would've worked a
// second later. Capped so a request never hangs out a long rate-limit
// window -- past that, it just fails the same way it always did.
const MAX_RETRY_WAIT_MS = 3000;

async function fetchWithRetry429(url: string, init: RequestInit): Promise<Response> {
  const response = await fetch(url, init);
  if (response.status !== 429) return response;

  const retryAfterMs = Number(response.headers.get("retry-after")) * 1000;
  if (!Number.isFinite(retryAfterMs) || retryAfterMs > MAX_RETRY_WAIT_MS) return response;

  await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
  return fetch(url, init);
}

// The bot's own view of /users/@me/guilds (Bot token auth instead of a
// user's Bearer token) -- every guild it's currently a member of, which is
// the only reliable signal for "is it actually installed here". Tries
// packages/discord-bot's internal bridge first (client.guilds.cache is
// exactly this list, already live with zero REST calls as long as the
// Gateway's connected) before falling back to a plain REST call, which
// still works fine with no bot process/gateway connection at all --
// Discord doesn't require one for the app's own token to be valid.
interface BotGuildSummary {
  id: string;
  name: string;
  iconUrl: string | null;
}

const BOT_GUILDS_CACHE_KEY = "bot";
const botGuildsLoader = createCachedLoader<BotGuildSummary[]>(SHORT_CACHE_MS);

// Not user-scoped (same bot, same token, every caller) -- a single fixed
// cache key rather than one per caller. Called from three places
// (checkManageableGuild below on every per-guild access check, the
// /discord/servers list page, and the site-wide admin panel), so this
// was the same endpoint getting hit two or three times over on a single
// page load before this cache existed.
async function fetchBotGuildsRaw(): Promise<BotGuildSummary[]> {
  return botGuildsLoader(BOT_GUILDS_CACHE_KEY, async () => {
    const viaGateway = await internalFetch<{ guilds: BotGuildSummary[] }>("/guilds");
    if (viaGateway) return viaGateway.guilds;

    const response = await fetchWithRetry429(`${DISCORD_API}/users/@me/guilds`, { headers: { Authorization: `Bot ${requiredEnv("DISCORD_BOT_TOKEN")}` } });
    if (!response.ok) throw new Error(`GET /users/@me/guilds (bot) -> HTTP ${response.status}`);
    const raw: { id: string; name: string; icon: string | null }[] = await response.json();
    return raw.map((g) => ({ id: g.id, name: g.name, iconUrl: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64` : null }));
  });
}

export async function fetchBotGuildIds(): Promise<Set<string>> {
  const guilds = await fetchBotGuildsRaw();
  return new Set(guilds.map((g) => g.id));
}

// Same bot-token guild list as fetchBotGuildIds, but keeping name/icon --
// the site-wide admin panel's "see data about the discords" view needs
// something to actually show per guild, not just its id.
export async function fetchBotGuilds(): Promise<{ id: string; name: string; iconUrl: string | null }[]> {
  return fetchBotGuildsRaw();
}

// Every guild the signed-in user owns or has Manage Server on, each tagged
// with whether the bot's actually been invited there yet (see
// buildBotInstallUrl) -- /discord/servers uses that to show "Invite" vs
// "Manage" per guild, while the header's profile dropdown (ProfileMenu.tsx)
// only lists the ones already installed, since there's nothing to click
// into yet for the rest.
export function toManageableGuilds(userGuilds: RawDiscordGuild[], botGuildIds: Set<string>): ManageableGuild[] {
  return userGuilds
    .filter((g) => g.owner || (BigInt(g.permissions) & MANAGE_GUILD) === MANAGE_GUILD)
    .map((g) => ({
      id: g.id,
      name: g.name,
      iconUrl: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64` : null,
      owner: g.owner,
      botInstalled: botGuildIds.has(g.id),
    }));
}

export type GuildAccessError = "not_signed_in" | "forbidden" | "bot_not_installed" | "discord_error";

// isOwner (Discord's own `owner` flag on the guild, not anything from our
// own DB) rides along on success so callers that care -- the admin-panel
// routes -- don't need a second fetchUserGuilds round trip just to answer
// "is this specific person the actual owner". Everyone else just ignores it.
type GuildAccessResult = { ok: true; isOwner: boolean } | { ok: false; error: GuildAccessError };

async function checkManageableGuild(session: DiscordSession, guildId: string): Promise<GuildAccessResult> {
  // Site-wide admin-panel mods/owner reach any guild the bot's in,
  // independent of their own Discord membership or permissions there --
  // same global reach they already have everywhere else in the
  // site-wide panel (grant/revoke any guild's subscription, etc.). Skips
  // the fetchUserGuilds lookup below entirely, since that only ever
  // returns guilds *this* person personally belongs to, which a site
  // admin managing someone else's server often won't.
  if (await isCallerSiteAdmin(session)) {
    let botGuildIds: Set<string>;
    try {
      botGuildIds = await fetchBotGuildIds();
    } catch (error) {
      console.error("Bot guild fetch failed:", error);
      return { ok: false, error: "discord_error" };
    }
    if (!botGuildIds.has(guildId)) return { ok: false, error: "bot_not_installed" };
    return { ok: true, isOwner: false };
  }

  let userGuilds: RawDiscordGuild[];
  try {
    userGuilds = await fetchUserGuilds(session.accessToken);
  } catch (error) {
    console.error(`Discord guild fetch failed for session ${session.id}:`, error);
    // Only a genuine 401 (Discord rejecting this specific access token,
    // e.g. the user revoked the app's access) means the session is
    // actually dead. A 429 (this endpoint is rate-limited fairly
    // aggressively) or a 5xx/network blip says nothing about the
    // session -- deleting it over one of those used to log people out on
    // a routine rate limit.
    if (error instanceof DiscordApiError && error.status === 401) {
      await deleteDiscordSession(session.id);
      return { ok: false, error: "not_signed_in" };
    }
    return { ok: false, error: "discord_error" };
  }

  const guild = userGuilds.find((g) => g.id === guildId);
  if (!guild) return { ok: false, error: "forbidden" };

  // Owner/Manage Server is the ordinary path in. A guild_admins row (see
  // schema.sql) is the other one -- the Advanced Settings tab's whole
  // point is letting a subscribed guild's owner hand someone *this*
  // dashboard's full access without having to also grant them real
  // Manage Server on the actual Discord server. Still has to be an
  // actual member of the guild (fetchUserGuilds only returns guilds
  // they're in at all), just not necessarily one with elevated Discord
  // permissions there.
  const hasManageServer = guild.owner || (BigInt(guild.permissions) & MANAGE_GUILD) === MANAGE_GUILD;
  if (!hasManageServer && !(await isGuildAdmin(guildId, session.discordUserId))) {
    return { ok: false, error: "forbidden" };
  }

  let botGuildIds: Set<string>;
  try {
    botGuildIds = await fetchBotGuildIds();
  } catch (error) {
    console.error("Bot guild fetch failed:", error);
    return { ok: false, error: "discord_error" };
  }
  if (!botGuildIds.has(guildId)) return { ok: false, error: "bot_not_installed" };

  return { ok: true, isOwner: guild.owner };
}

// A single dashboard page load routinely fires several of these at once
// (e.g. the Channel topics tab's channels + channel-topics requests,
// right after the page's own guild-settings request) -- each one used to
// make its own fresh fetchUserGuilds/fetchBotGuildIds round trip, which is
// exactly the kind of burst that trips Discord's aggressive rate limit on
// /users/@me/guilds. Short in-memory cache + in-flight de-dup (same
// pattern as getLiveSession's refreshInFlight) collapses a page load's
// burst into one real Discord round trip per session+guild instead of one
// per request. 2 minutes is still short enough that a revoked permission
// or bot-removal shows up well within a normal browsing session, but long
// enough to meaningfully cut how often this rate-limited endpoint gets
// hit at all -- the real lever here, since Discord has no "raise my rate
// limit" option for it.
const GUILD_ACCESS_CACHE_MS = 2 * 60 * 1000;
const guildAccessCache = new Map<string, { result: GuildAccessResult; expiresAt: number }>();
const guildAccessInFlight = new Map<string, Promise<GuildAccessResult>>();

// Shared gate for the per-guild settings routes: signed-in session's own
// guild list has to contain this guildId with owner/Manage Server (same
// rule as toManageableGuilds, just checked for one specific guild instead
// of filtering the whole list), *and* the bot has to actually be a member
// there -- otherwise there's no bot guild-member object on Discord's side
// for fetchBotMember/updateBotGuildProfile to read or write.
export async function requireManageableGuild(session: DiscordSession, guildId: string): Promise<GuildAccessResult> {
  const key = `${session.id}:${guildId}`;

  const cached = guildAccessCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  const inFlight = guildAccessInFlight.get(key);
  if (inFlight) return inFlight;

  const checking = (async () => {
    try {
      const result = await checkManageableGuild(session, guildId);
      guildAccessCache.set(key, { result, expiresAt: Date.now() + GUILD_ACCESS_CACHE_MS });
      return result;
    } finally {
      guildAccessInFlight.delete(key);
    }
  })();

  guildAccessInFlight.set(key, checking);
  return checking;
}

export const GUILD_ACCESS_ERROR_STATUS: Record<GuildAccessError, number> = {
  not_signed_in: 401,
  forbidden: 403,
  bot_not_installed: 409,
  discord_error: 502,
};

// Combines the two checks every per-guild route needs (signed in, and
// Manage Server + bot installed on this guild) into the one call each
// route handler actually wants: either a live session to proceed with, or
// a ready-to-return error response. `return auth;` when it's not a
// session works because an error response is itself a valid route handler
// return value.
export async function authorizeGuildRequest(request: Request, guildId: string): Promise<{ session: DiscordSession; isOwner: boolean } | NextResponse> {
  const sessionId = readCookie(request, SESSION_COOKIE);
  const session = sessionId ? await getLiveSession(sessionId) : null;
  if (!session) return jsonWithDiscordCors(request, { error: "not_signed_in" }, { status: 401 });

  const access = await requireManageableGuild(session, guildId);
  if (!access.ok) return jsonWithDiscordCors(request, { error: access.error }, { status: GUILD_ACCESS_ERROR_STATUS[access.error] });

  return { session, isOwner: access.isOwner };
}

// The admin panel's own gate, layered on top of the ordinary Manage Server
// one above -- plenty of people can have Manage Server on a big server
// without the owner wanting them to grant subscriptions or force-push
// channel topics (see schema.sql's discord_guild_admins). The guild's own
// Discord owner always passes (isOwner, from Discord's own guild list --
// never a DB row), so there's no bootstrap problem for who grants the
// *first* admin.
export async function authorizeGuildAdminRequest(request: Request, guildId: string): Promise<{ session: DiscordSession; isOwner: boolean } | NextResponse> {
  const auth = await authorizeGuildRequest(request, guildId);
  if (auth instanceof NextResponse) return auth;

  const admin = auth.isOwner || (await isGuildAdmin(guildId, auth.session.discordUserId));
  if (!admin) return jsonWithDiscordCors(request, { error: "forbidden" }, { status: 403 });

  return auth;
}

// Layered on top of authorizeGuildAdminRequest for the parts of the
// per-guild Advanced Settings panel that are genuinely a subscriber perk
// (managing *other* admins, force-refreshing a binding) -- subscriptions
// themselves are only ever granted/revoked by the site-wide admin panel
// (/api/discord/admin/guilds/[guildId]/subscription, site-admin-gated,
// not guild-admin-gated), so there's no risk of this creating a circular
// "need a subscription to grant one" lock. Call this *after*
// authorizeGuildAdminRequest has already confirmed admin/owner status; it
// only adds the subscription check on top.
export async function requireGuildSubscription(request: Request, guildId: string): Promise<NextResponse | null> {
  if (await isGuildSubscribed(guildId)) return null;
  return jsonWithDiscordCors(request, { error: "subscription_required" }, { status: 403 });
}

// The site-wide admin panel's own gate -- global, not scoped to any one
// guild. SITE_OWNER_DISCORD_IDS (comma-separated Discord user ids) is the
// bootstrap: whoever's listed there always passes, with no DB row needed,
// the same role Discord's own per-guild `owner` flag plays in
// authorizeGuildAdminRequest above. Anyone else has to be an explicit
// site_admins row, added by one of the bootstrap owners or another mod.
const SITE_OWNER_IDS = new Set(
  (process.env.SITE_OWNER_DISCORD_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),
);

export async function isCallerSiteAdmin(session: DiscordSession): Promise<boolean> {
  return SITE_OWNER_IDS.has(session.discordUserId) || (await isSiteAdmin(session.discordUserId));
}

export async function authorizeSiteAdminRequest(request: Request): Promise<{ session: DiscordSession } | NextResponse> {
  const sessionId = readCookie(request, SESSION_COOKIE);
  const session = sessionId ? await getLiveSession(sessionId) : null;
  if (!session) return jsonWithDiscordCors(request, { error: "not_signed_in" }, { status: 401 });

  if (!(await isCallerSiteAdmin(session))) return jsonWithDiscordCors(request, { error: "forbidden" }, { status: 403 });

  return { session };
}

interface RawGuildDetail {
  id: string;
  name: string;
  icon: string | null;
  approximate_member_count?: number;
}

const guildInfoLoader = createCachedLoader<{ id: string; name: string; iconUrl: string | null; memberCount: number | null }>(SHORT_CACHE_MS);

// Bot-token read of the guild itself -- name/icon/member count, independent
// of any one user's membership view. Tries the internal Gateway-cache
// bridge first (see internalFetch's own comment).
export async function fetchGuildInfo(guildId: string): Promise<{ id: string; name: string; iconUrl: string | null; memberCount: number | null }> {
  return guildInfoLoader(guildId, async () => {
    const viaGateway = await internalFetch<{ id: string; name: string; iconUrl: string | null; memberCount: number | null }>(`/guilds/${guildId}`);
    if (viaGateway) return viaGateway;

    const response = await fetch(`${DISCORD_API}/guilds/${guildId}?with_counts=true`, {
      headers: { Authorization: `Bot ${requiredEnv("DISCORD_BOT_TOKEN")}` },
    });
    if (!response.ok) throw new Error(`GET /guilds/${guildId} -> HTTP ${response.status}`);
    const guild: RawGuildDetail = await response.json();
    return {
      id: guild.id,
      name: guild.name,
      iconUrl: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128` : null,
      memberCount: guild.approximate_member_count ?? null,
    };
  });
}

interface RawGuildMember {
  nick: string | null;
  avatar: string | null; // per-guild avatar hash, set via updateBotGuildProfile below -- separate from the bot's global avatar
  joined_at: string;
}

// The bot's own membership record in this one guild -- its per-guild
// nickname/avatar (what the General tab edits) plus when it joined, which
// doubles as "bot added" for the server header since there's no separate
// install-timestamp of our own being tracked.
//
// ".../members/@me" (no id) only resolves for a Bearer token acting as a
// human user -- a Bot token has to address itself by its own user id, same
// as looking up any other member, which is why this needs botUserId (see
// fetchBotUser) rather than being a no-argument call like the PATCH below.
//
// Deliberately NOT run through createCachedLoader like its neighbors below
// -- the guild settings PATCH route (guilds/[guildId]/route.ts) calls
// loadGuildSettings (which calls this) again immediately after
// updateBotGuildProfile to return the just-saved nickname/avatar. A cached
// result here would serve the pre-update value back for up to the TTL,
// making a successful save look like it silently didn't take.
export async function fetchBotMember(guildId: string, botUserId: string): Promise<RawGuildMember> {
  const response = await fetch(`${DISCORD_API}/guilds/${guildId}/members/${botUserId}`, {
    headers: { Authorization: `Bot ${requiredEnv("DISCORD_BOT_TOKEN")}` },
  });
  if (!response.ok) throw new Error(`GET /guilds/${guildId}/members/${botUserId} -> HTTP ${response.status}`);
  return response.json();
}

const BOT_USER_CACHE_KEY = "bot";
const botUserLoader = createCachedLoader<{ id: string; avatar: string | null }>(LONG_CACHE_MS);

// The bot's own global account -- used only as the avatar fallback when a
// guild hasn't set a per-guild one (member.avatar is null). Not guild-
// scoped (same account everywhere), and essentially static for the
// lifetime of a deploy, so this gets the long TTL and a single fixed
// cache key rather than one per guild.
export async function fetchBotUser(): Promise<{ id: string; avatar: string | null }> {
  return botUserLoader(BOT_USER_CACHE_KEY, async () => {
    const viaGateway = await internalFetch<{ id: string; avatar: string | null }>("/me");
    if (viaGateway) return viaGateway;

    const response = await fetch(`${DISCORD_API}/users/@me`, { headers: { Authorization: `Bot ${requiredEnv("DISCORD_BOT_TOKEN")}` } });
    if (!response.ok) throw new Error(`GET /users/@me (bot) -> HTTP ${response.status}`);
    return response.json();
  });
}

export function guildMemberAvatarUrl(guildId: string, userId: string, avatarHash: string | null): string | null {
  if (!avatarHash) return null;
  return `https://cdn.discordapp.com/guilds/${guildId}/users/${userId}/avatars/${avatarHash}.png?size=128`;
}

// Pushes a nickname and/or per-guild avatar straight to Discord's own guild
// member object for the bot -- these are never mirrored into our own DB,
// so this call is the entire write path. `avatar` takes a base64 data URI,
// or null to clear back to the bot's global avatar.
export async function updateBotGuildProfile(guildId: string, patch: { nick?: string | null; avatar?: string | null }): Promise<void> {
  const response = await fetch(`${DISCORD_API}/guilds/${guildId}/members/@me`, {
    method: "PATCH",
    headers: {
      Authorization: `Bot ${requiredEnv("DISCORD_BOT_TOKEN")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(patch),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new DiscordApiError(`PATCH /guilds/${guildId}/members/@me -> HTTP ${response.status}`, response.status, body);
  }
}

export interface GuildChannel {
  id: string;
  name: string;
  categoryName: string | null;
}

// Discord channel types that actually have a topic to set -- 0 (text) and
// 5 (announcement). Voice/etc. channels are filtered out of the result so
// the Channel topics tab's picker only ever lists something that's
// actually bindable. Category channels (type 4) are kept around just
// long enough to resolve each returned channel's parent_id to a name --
// Discord's own guild-channels response already includes them in the same
// call, so no extra request is needed for this.
const TOPIC_CAPABLE_CHANNEL_TYPES = new Set([0, 5]);
const CATEGORY_CHANNEL_TYPE = 4;

// Resolves an arbitrary Discord user id to a username/avatar via the bot's
// own token -- works for *any* user, not just ones sharing a guild with
// the bot, which is exactly what the admin panel needs: it only ever has
// raw snowflakes (whatever an admin typed in, or stored as addedBy/
// grantedBy) and wants to show something more useful than that. Returns
// null for an id that doesn't resolve to a real account (typo'd/deleted),
// rather than throwing -- the admin panel falls back to the raw id.
const discordUserLoader = createCachedLoader<{ id: string; username: string; avatarUrl: string } | null>(LONG_CACHE_MS);

export async function fetchDiscordUserById(userId: string): Promise<{ id: string; username: string; avatarUrl: string } | null> {
  return discordUserLoader(userId, async () => {
    const response = await fetch(`${DISCORD_API}/users/${userId}`, { headers: { Authorization: `Bot ${requiredEnv("DISCORD_BOT_TOKEN")}` } });
    if (response.status === 404) return null;
    if (!response.ok) throw new DiscordApiError(`GET /users/${userId} -> HTTP ${response.status}`, response.status);
    const user: DiscordUser = await response.json();
    return { id: user.id, username: user.username, avatarUrl: avatarUrl(user.id, user.avatar) };
  });
}

interface RawGuildMemberLookup {
  user: { id: string; username: string; avatar: string | null };
  avatar: string | null; // per-guild avatar hash, distinct from user.avatar
}

// Unlike fetchDiscordUserById above (resolves any account, membership or
// not), this answers "is this user actually *in* this guild right now" --
// used by the Linked authors tab to filter discord_author_links (which has
// no guild_id of its own, see schema.sql) down to just this guild's
// current members. 404 means not a member here, same "missing is a normal
// case, not an error" convention as fetchDiscordUserById.
const guildMemberLoader = createCachedLoader<{ username: string; avatarUrl: string } | null>(LONG_CACHE_MS);

export async function fetchGuildMember(guildId: string, userId: string): Promise<{ username: string; avatarUrl: string } | null> {
  return guildMemberLoader(`${guildId}:${userId}`, async () => {
    const viaGateway = await internalFetchMember(guildId, userId);
    if (viaGateway) return viaGateway.found ? viaGateway.value : null;

    const response = await fetch(`${DISCORD_API}/guilds/${guildId}/members/${userId}`, {
      headers: { Authorization: `Bot ${requiredEnv("DISCORD_BOT_TOKEN")}` },
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new DiscordApiError(`GET /guilds/${guildId}/members/${userId} -> HTTP ${response.status}`, response.status);
    const member: RawGuildMemberLookup = await response.json();
    return {
      username: member.user.username,
      avatarUrl: guildMemberAvatarUrl(guildId, member.user.id, member.avatar) ?? avatarUrl(member.user.id, member.user.avatar),
    };
  });
}

// The admin-only manual "Refresh now" escape hatch (packages/api's
// channel-topics/[channelId]/refresh route) uses this same plain
// Bot-token REST call packages/discord-bot's own channel.setTopic wraps --
// no Gateway connection needed for it, same as updateBotGuildProfile below.
export async function updateChannelTopic(channelId: string, topic: string): Promise<void> {
  const response = await fetch(`${DISCORD_API}/channels/${channelId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bot ${requiredEnv("DISCORD_BOT_TOKEN")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ topic }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new DiscordApiError(`PATCH /channels/${channelId} -> HTTP ${response.status}`, response.status, body);
  }
}

export interface DiscordMessagePayload {
  content?: string;
  embeds?: unknown[];
  allowed_mentions?: { parse?: string[]; roles?: string[] };
}

// Sending a message is a plain REST call too, same as updateChannelTopic
// above -- no live Gateway connection (discord.js Client) needed, which
// is what lets the Announcements "Test" button (packages/api's
// announcements/watches|entities/[id]/test routes) post without
// coordinating with the separate packages/discord-bot process at all.
export async function postChannelMessage(channelId: string, payload: DiscordMessagePayload): Promise<void> {
  const response = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${requiredEnv("DISCORD_BOT_TOKEN")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new DiscordApiError(`POST /channels/${channelId}/messages -> HTTP ${response.status}`, response.status, body);
  }
}

export interface GuildRole {
  id: string;
  name: string;
  color: number;
  mentionable: boolean;
}

// For the Announcements tabs' "which role to ping" picker -- a role has
// to be mentionable (Discord's own flag, set by whoever owns the role)
// for a bot's message content to actually notify it; an unmentionable
// role still gets filtered to "mentionable only" client-side rather than
// excluded here, so the picker can explain *why* a role's missing instead
// of just not listing it.
const guildRolesLoader = createCachedLoader<GuildRole[]>(SHORT_CACHE_MS);

export async function fetchGuildRoles(guildId: string): Promise<GuildRole[]> {
  return guildRolesLoader(guildId, async () => {
    const viaGateway = await internalFetch<{ roles: GuildRole[] }>(`/guilds/${guildId}/roles`);
    if (viaGateway) return viaGateway.roles;

    const response = await fetch(`${DISCORD_API}/guilds/${guildId}/roles`, {
      headers: { Authorization: `Bot ${requiredEnv("DISCORD_BOT_TOKEN")}` },
    });
    if (!response.ok) throw new DiscordApiError(`GET /guilds/${guildId}/roles -> HTTP ${response.status}`, response.status);
    const roles: { id: string; name: string; color: number; mentionable: boolean }[] = await response.json();
    return roles.filter((r) => r.name !== "@everyone").map((r) => ({ id: r.id, name: r.name, color: r.color, mentionable: r.mentionable }));
  });
}

const guildChannelsLoader = createCachedLoader<GuildChannel[]>(SHORT_CACHE_MS);

export async function fetchGuildChannels(guildId: string): Promise<GuildChannel[]> {
  return guildChannelsLoader(guildId, async () => {
    const viaGateway = await internalFetch<{ channels: GuildChannel[] }>(`/guilds/${guildId}/channels`);
    if (viaGateway) return viaGateway.channels;

    const response = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, {
      headers: { Authorization: `Bot ${requiredEnv("DISCORD_BOT_TOKEN")}` },
    });
    if (!response.ok) throw new DiscordApiError(`GET /guilds/${guildId}/channels -> HTTP ${response.status}`, response.status);
    const channels: { id: string; name: string; type: number; parent_id: string | null }[] = await response.json();

    const categoryNames = new Map(channels.filter((c) => c.type === CATEGORY_CHANNEL_TYPE).map((c) => [c.id, c.name]));

    return channels
      .filter((c) => TOPIC_CAPABLE_CHANNEL_TYPES.has(c.type))
      .map((c) => ({
        id: c.id,
        name: c.name,
        categoryName: c.parent_id ? (categoryNames.get(c.parent_id) ?? null) : null,
      }));
  });
}

// Discord rotates refresh tokens on use -- each one is single-use. Two
// requests for the same session landing close together (e.g. /me on page
// load and /guilds right after a page mounts, or React StrictMode's
// deliberate double-invoke of effects in dev) can both see "needs
// refresh" at once and both try to redeem the *same* refresh token: one
// wins and gets fresh tokens, the other gets rejected by Discord even
// though the session itself is perfectly alive -- without this map, that
// rejection used to delete the session the winner had just renewed,
// which is what was logging people out so often. Concurrent callers for
// the same sessionId now just await the one in-flight refresh instead of
// each racing Discord with it. Only guards against races within this one
// process, not multiple instances, but see lib/cache.ts's own comment --
// this app doesn't run more than one instance anyway.
const refreshInFlight = new Map<string, Promise<DiscordSession | null>>();

// Refreshes in place (and persists the new tokens) if the stored access
// token is at or past its expiry -- a 60s buffer so a request that starts
// just before expiry doesn't still get a token that's stale by the time it
// reaches Discord. A refresh failure (refresh token itself expired, or the
// user revoked the app's access on Discord's side) means this session is
// dead either way, so it's treated the same as "not signed in" -- the row
// is dropped rather than left behind to fail the same way on every future
// request.
export async function getLiveSession(sessionId: string): Promise<DiscordSession | null> {
  const session = await getDiscordSession(sessionId);
  if (!session) return null;
  if (session.expiresAt.getTime() > Date.now() + 60_000) return session;

  const inFlight = refreshInFlight.get(sessionId);
  if (inFlight) return inFlight;

  const refreshing = (async () => {
    try {
      const refreshed = await refreshToken(session.refreshToken);
      const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
      await updateDiscordSessionTokens(sessionId, refreshed.access_token, refreshed.refresh_token, expiresAt);
      return { ...session, accessToken: refreshed.access_token, refreshToken: refreshed.refresh_token, expiresAt };
    } catch (error) {
      console.error(`Discord token refresh failed for session ${sessionId}:`, error);
      // A genuinely dead refresh token (already redeemed/rotated, or the
      // user revoked access) comes back as 400 invalid_grant, sometimes
      // 401 -- that really does mean this session is over. A 429/5xx/
      // network blip on Discord's token endpoint doesn't mean that at
      // all, so fail open: keep the session's current (still briefly
      // valid, thanks to the 60s refresh buffer above) tokens rather than
      // deleting a perfectly good session over a transient hiccup. The
      // next request past the buffer will just try refreshing again.
      if (error instanceof DiscordApiError && (error.status === 400 || error.status === 401)) {
        await deleteDiscordSession(sessionId);
        return null;
      }
      return session;
    } finally {
      refreshInFlight.delete(sessionId);
    }
  })();

  refreshInFlight.set(sessionId, refreshing);
  return refreshing;
}

export async function startSession(tokens: TokenResponse): Promise<string> {
  const user = await fetchDiscordUser(tokens.access_token);
  return createDiscordSession({
    discordUserId: user.id,
    username: user.username,
    avatarHash: user.avatar,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
  });
}

export function endSession(sessionId: string): Promise<void> {
  return deleteDiscordSession(sessionId);
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

// Cookies always carry Secure + SameSite=None -- the web app and this API
// live on different origins (rspluginpulse.com vs api.rspluginpulse.com in
// prod, different localhost ports in dev), so the browser only sends them
// back on a genuinely cross-site request with both of those set. Chrome's
// (and other modern browsers') "localhost is a secure context" carve-out is
// what makes Secure work over plain http://localhost in dev -- there's no
// separate dev-mode cookie config to maintain.
function cookieAttrs(maxAgeSeconds: number): string {
  return `Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${maxAgeSeconds}`;
}

const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days; Discord's own access/refresh tokens are kept fresh independently via getLiveSession
const STATE_MAX_AGE = 60 * 10; // only needs to survive the redirect to Discord and back

export function setSessionCookie(response: NextResponse, sessionId: string) {
  response.headers.append("Set-Cookie", `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; ${cookieAttrs(SESSION_MAX_AGE)}`);
}

export function clearSessionCookie(response: NextResponse) {
  response.headers.append("Set-Cookie", `${SESSION_COOKIE}=; ${cookieAttrs(0)}`);
}

export function setStateCookie(response: NextResponse, state: string) {
  response.headers.append("Set-Cookie", `${STATE_COOKIE}=${encodeURIComponent(state)}; ${cookieAttrs(STATE_MAX_AGE)}`);
}

export function clearStateCookie(response: NextResponse) {
  response.headers.append("Set-Cookie", `${STATE_COOKIE}=; ${cookieAttrs(0)}`);
}

// Separate from lib/cors.ts's wildcard CORS deliberately -- these routes
// set/read a cookie, and `Access-Control-Allow-Origin: *` is rejected by
// browsers the moment a request also carries credentials. Only the exact
// configured WEB_APP_URL is ever allowed, echoed back (not wildcarded).
export function discordCorsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin");
  const allowedOrigin = process.env.WEB_APP_URL;
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
  if (origin && origin === allowedOrigin) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

export function jsonWithDiscordCors(request: Request, data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, { ...init, headers: { ...discordCorsHeaders(request), ...init?.headers } });
}

export function discordCorsOptions(request: Request) {
  return new NextResponse(null, { status: 204, headers: discordCorsHeaders(request) });
}
