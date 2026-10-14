// Loopback-only HTTP bridge exposing this process's own live Gateway
// cache (discord.js already maintains guilds/channels/roles/the bot's own
// member object in memory via Guilds-intent events -- no extra intent, no
// hand-rolled sync code needed) to packages/api, so the dashboard can read
// guild/channel/role data without a fresh Discord REST call every time.
// packages/api's discordAuth.ts tries this first and falls back to REST
// if it's unreachable (bot not running, or DISCORD_BOT_INTERNAL_SECRET
// unset) -- this is purely an optimization, never a hard dependency.
//
// The single-member lookup (/guilds/:id/members/:userId, what the Linked
// authors tab needs) does NOT need the privileged GUILD_MEMBERS intent --
// that's only required for the *bulk* list/search-members endpoints and
// the member add/update/remove gateway events. A single `GET
// /guilds/{id}/members/{id}` lookup (what guild.members.fetch(userId)
// does under the hood -- see discord.js's GuildMemberManager#_fetchSingle)
// is a plain, unprivileged REST call, same endpoint and intent-free as
// the hand-rolled fetchGuildMember in packages/api already uses. No
// intent change needed here, so no risk to the bot's Gateway connection.
import { ChannelType, DiscordAPIError, type Client } from "discord.js";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

const DEFAULT_PORT = 3100;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function handleRequest(client: Client<true>, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const secret = process.env.DISCORD_BOT_INTERNAL_SECRET;
  if (!secret || req.headers["x-internal-secret"] !== secret) {
    sendJson(res, 401, { error: "unauthorized" });
    return;
  }

  const url = new URL(req.url ?? "/", "http://internal");
  const parts = url.pathname.split("/").filter(Boolean);

  if (parts[0] === "me") {
    sendJson(res, 200, { id: client.user.id, avatar: client.user.avatar });
    return;
  }

  if (parts[0] !== "guilds") {
    sendJson(res, 404, { error: "not_found" });
    return;
  }

  if (parts.length === 1) {
    const guilds = [...client.guilds.cache.values()].map((g) => ({ id: g.id, name: g.name, iconUrl: g.iconURL({ size: 64 }) }));
    sendJson(res, 200, { guilds });
    return;
  }

  const guild = client.guilds.cache.get(parts[1]);
  if (!guild) {
    // Not necessarily wrong -- the bot's own GUILD_CREATE backlog can
    // still be settling right after a restart. The API side's REST
    // fallback covers this gap rather than surfacing it as an error.
    sendJson(res, 404, { error: "guild_not_cached" });
    return;
  }

  if (parts.length === 2) {
    sendJson(res, 200, { id: guild.id, name: guild.name, iconUrl: guild.iconURL({ size: 128 }), memberCount: guild.memberCount });
    return;
  }

  if (parts[2] === "channels") {
    const channels = [...guild.channels.cache.values()]
      .filter((c) => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement)
      .map((c) => ({ id: c.id, name: c.name, categoryName: c.parent?.name ?? null }));
    sendJson(res, 200, { channels });
    return;
  }

  if (parts[2] === "roles") {
    const roles = [...guild.roles.cache.values()]
      .filter((r) => r.name !== "@everyone")
      .map((r) => ({ id: r.id, name: r.name, color: r.color, mentionable: r.mentionable }));
    sendJson(res, 200, { roles });
    return;
  }

  if (parts[2] === "members" && parts[3]) {
    const userId = parts[3];
    try {
      const member = await guild.members.fetch(userId);
      const avatarUrl = member.avatarURL({ size: 128 }) ?? member.user.displayAvatarURL({ size: 128 });
      sendJson(res, 200, { username: member.user.username, avatarUrl });
    } catch (error) {
      // A 404 here just means "not a member of this guild" -- the normal,
      // common case for the Linked authors tab (most linked users site-wide
      // aren't in any one given guild), not a real error.
      if (error instanceof DiscordAPIError && error.status === 404) {
        sendJson(res, 404, { error: "not_a_member" });
      } else {
        throw error;
      }
    }
    return;
  }

  sendJson(res, 404, { error: "not_found" });
}

export function startInternalServer(client: Client<true>): Server {
  const port = Number(process.env.DISCORD_BOT_INTERNAL_PORT ?? DEFAULT_PORT);
  const server = createServer((req, res) => {
    handleRequest(client, req, res).catch((error: unknown) => {
      console.error("Internal cache server request failed:", error);
      if (!res.headersSent) sendJson(res, 500, { error: "internal_error" });
    });
  });
  // A bind failure (port already taken, etc.) is just this optimization
  // not coming up -- without this handler, Node's default behavior for an
  // unhandled 'error' event on an http.Server is to throw and crash the
  // *entire* bot process (presence, slash commands, everything), which
  // would turn "the cache bridge couldn't start" into "the whole bot is
  // down", exactly contradicting the "purely an optimization, never a
  // hard dependency" promise above.
  server.on("error", (error) => {
    console.error(`Internal cache server failed to start on 127.0.0.1:${port} (continuing without it):`, error);
  });

  // 127.0.0.1 only -- this is a trusted-network bridge for packages/api on
  // the same host, not meant to be reachable from outside the box at all,
  // same assumption deploy/configure.sh's systemd services already share
  // (both read EnvironmentFile=${APP_ROOT}/shared/.env and run on one VPS).
  server.listen(port, "127.0.0.1", () => {
    console.log(`Internal cache server listening on 127.0.0.1:${port}`);
  });
  return server;
}
