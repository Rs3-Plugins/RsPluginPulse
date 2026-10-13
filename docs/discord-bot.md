# RuneScape PluginPulse — Discord Bot

Planning doc for the interactive bot (slash commands, notifications, etc.) --
none of that is built yet. This is the brief for designing and implementing
it, written up so a fresh session has full context without re-deriving it
from scratch.

**What already exists, ahead of this doc's phasing:** the dashboard's OAuth
login + session (`packages/api/src/lib/discordAuth.ts`,
`packages/api/src/app/api/discord/`), per-guild nickname/avatar editing (the
`/discord` dashboard's General tab, pushed straight to Discord's guild
member API, no DB mirror), **Channel description templates** (the Channel
topics tab -- bindings saved via `discord_channel_topics`, see schema.sql;
rendered and pushed by `packages/discord-bot/src/channelTopics.ts` on the
same hourly interval as the presence refresh below, using discord.js's own
`channel.setTopic()` rather than a raw fetch), and `packages/discord-bot`
itself -- a persistent Gateway connection that keeps the bot Online with a
global "Watching Plugins: N RuneScape, M RuneLite" status (refreshed once
a day), **plus a first slice of read-only slash commands**: `/plugin`,
`/author`, `/rank`, `/leaderboard`, `/status`, and `/help`
(`packages/discord-bot/src/commands/`, registered globally via
`client.application.commands.set()` on every ready event, with
autocomplete on every name-taking option backed by the existing
`searchPluginsAndAuthors`), **plus account linking**: `/link`, `/unlink`,
and `/mystats` (trust-based, see **Account linking** below), backed by
a new `discord_author_links` table and surfaced read-only in the
dashboard's Linked authors tab. The lookup commands query `packages/db`
directly with no new tables; account linking is the one new table of the
two. `/watch` and per-server command toggles below are still unbuilt. Bot-install
now requests a permission set (permissions=257044, see
`buildBotInstallUrl` in `packages/api/src/lib/discordAuth.ts` for the
full breakdown) covering both what's built today and this doc's planned
features, instead of 0 -- servers that installed the bot before this was
added need a re-invite (or the bot role granted the specific missing
permission manually) before Channel topics (or nickname/avatar editing)
will actually work there. The dashboard detects a Discord call failing
specifically because of this (`isMissingPermissionsError` in the same
file) and prompts a one-click re-invite rather than a generic error.

**Notifications** (this doc's section below) are also now built, as the
Announcements tab -- three pieces: a **Global** tab (a flexible list of
"post `release`/`update` events for these game(s) to this channel, with
this ping/thumbnail" watch rows -- `discord_announcement_watches`), a
**Per-plugin** tab (same idea for one specific plugin, additive to any
Global rule that also matches it -- `discord_plugin_announcements`,
mirrors Channel topics' own per-entity binding pattern), and a
subscriber-gated **Embed builder** tab (`discord_guild_announcement_embed`,
one config per guild) for customizing the posted embed's colour/title/
description/footer/thumbnail. `packages/discord-bot/src/announcements.ts`
runs on the same hourly tick as presence/channel-topics, finding
candidates since each row's own `last_announced_at` cursor (defaults to
the row's creation time, so turning a watch on never floods the channel
with history) via `getNewPluginCandidates`/`getPluginUpdateCandidates` in
`packages/db/src/queries.ts`, and advancing that cursor after *every*
successful post (not batched at the end) so a crash/restart mid-tick
can't cause duplicate posts.

This relies on a new ingest piece: `packages/ingest/src/
run-release-ingest-hourly.ts` (wired into the same hourly systemd timer
as the regular snapshot ingest, see `deploy/configure.sh`) finds plugins
whose `date_updated` has moved past the latest `plugin_releases` row
already recorded for them (`listPluginsNeedingReleaseCheck`) and only
fetches release details for *those* -- normally a handful per hour, not
the full 2,600+ RuneLite catalog, which is what makes hourly detection
safe against GitHub's API rate limit (the existing weekly full-catalog
job, `run-release-ingest.ts` via `.github/workflows/
weekly-release-ingest.yml`, stays as a reconciliation safety net and is
unchanged). RuneLite release details still need `PLUGIN_HUB_TOKEN` set by
hand in the server's `shared/.env` (see that file's own comment) for the
hourly job to actually do anything on the RuneLite side -- without it,
the hourly job logs a warning and skips, falling back to the weekly scan
eventually catching it instead.

This -- plus the read-only slash commands and account linking above -- is a
small, deliberately narrow slice of **Suggested architecture**'s
`packages/discord-bot` below. Stat-swing notification watches (`/watch`)
and per-server command toggles described in this doc are still unbuilt.

## Pitch

A Discord bot server owners install that brings PluginPulse's stats into their
server: slash commands to look up a plugin or author, automatic alerts when
something they're watching spikes or drops, channel descriptions that stay
live with a plugin's current numbers, and a web dashboard (Discord login,
pick a server, configure everything visually) instead of juggling slash
command flags for every setting.

## Feature breakdown

### Slash commands

**`/plugin`, `/author`, `/rank`, `/leaderboard`, `/status`, `/help` are
built** (`packages/discord-bot/src/commands/`), querying `packages/db`
directly rather than going through `/api/*` (same pattern
`announcements.ts`/`channelTopics.ts` already use, since the bot process
is just another consumer of the same package). **`/mystats`, `/link`,
`/unlink` are also built** -- see **Account linking** below. `/plugin`
and the author embed shared by `/author`, `/mystats`, and `/link`'s
confirmation (`buildAuthorEmbed` in `packages/discord-bot/src/embeds.ts`)
each set their own entity's visual stats card as the embed's image,
reusing the existing `/api/card/{type}/{id}.png` renderer
(`cardImageUrl` in `format.ts`) rather than building a from-scratch image
generator. Still open from the bullets below: a sparkline specifically
(the reused card renders its own, but there's no bot-side control over
which range it shows), and the admin-only `/watch`/`/commands` bullets.

- `/plugin <name>` — looks up a plugin by name/slug (reuse `/api/search` for
  autocomplete), replies with an embed built the same way `/api/card`
  renders its PNG: name, author, installs/downloads, subscribers, rank,
  sparkline if feasible in an embed image.
- `/author <name>` — same idea for an author: plugin count, total
  installs/downloads, rank, their plugin list.
- `/rank <plugin|author> <name>` — just the current leaderboard position,
  terser than the full card.
- `/leaderboard <plugins|authors> [period]` — top N for a period (alltime /
  hot / weekly / monthly), mirrors the site's leaderboard tabs.
- `/mystats [game]` — pulls up the stats for whichever author account the
  Discord user has linked for that game (see **Account linking** below) as
  an embed, so an author can check their own numbers without leaving
  Discord. Omitting `game` with only one game linked just uses that one; if
  both are linked and `game` is omitted, show both (e.g. two embeds, or one
  embed with a RuneScape section and a RuneLite section).
- `/link <game> <author-id-or-slug>` — starts the account-linking flow for
  that game. A Discord user can link a RuneScape (mod.io) identity, a
  RuneLite identity, or both — they're entirely separate catalogs with
  separate author ids, so one link doesn't imply the other.
- `/unlink <game>` — removes that game's link.
- Admin-only, scoped to users with `Manage Server`:
  - `/watch add <plugin|author> <name> [threshold]` — start alerting this
    channel on big moves for that entity.
  - `/watch remove <plugin|author> <name>`
  - `/watch list`
  - `/channel-stats set <channel> <template>` — see **Channel description
    templates**.
  - `/channel-stats remove <channel>`
  - `/commands disable <command>` / `/commands enable <command>` — turn
    individual slash commands off for this server (see **Per-server command
    toggles**).
  - Anything genuinely visual (embed design, picking which fields show)
    should push the admin to the dashboard rather than trying to build a
    form out of slash command options — Discord's command UI doesn't do
    multi-field visual design well.

### Notifications (big drop / increase)

- Per-guild, per-channel watchlist of plugins/authors (`/watch add` above,
  or set from the dashboard).
- Piggybacks on the existing hourly ingest cadence — there's no faster
  signal to react to than that anyway (phyce's own data doesn't update more
  than hourly either, same reasoning as the ingest interval itself).
- Needs a concrete definition of "big": percentage change since the last
  snapshot, with a sensible default (e.g. ±15%) and an optional per-watch
  override set via the threshold argument. Should also debounce — a plugin
  oscillating right around the threshold every hour shouldn't spam the
  channel hourly.
- Delivered as a webhook post or a bot message with an embed: what changed,
  by how much, old vs new number, link back to the plugin/author page.

### Channel description templates

- Admins set a Discord channel's **topic** (not the channel name — name
  edits are far more rate-limited and character-restricted) to a template
  string containing placeholders: `{installs}`, `{rank}`, `{subscribers}`,
  bound to one plugin or author.
- Re-rendered on the same hourly cadence as ingest/notifications.
- **Hard constraint to design around:** Discord rate-limits channel
  name/topic edits to roughly 2 per 10 minutes per channel. Hourly updates
  are comfortably under that, but the design needs to queue/stagger updates
  across many channels rather than firing them all at once when the ingest
  tick lands, and needs to just skip (not retry-storm) a channel whose
  topic hasn't actually changed since last time.
- Template placeholders should reuse whatever formatting the site already
  uses (`compact()`-style "414k" rather than raw big numbers) for
  consistency with cards/badges.

### Custom embed design

- A visual builder in the dashboard (title, description, color, thumbnail,
  fields, footer) bound to the same placeholder vocabulary as channel
  templates, with a live preview rendered against a real plugin/author's
  current data.
- Saved per-guild (or per-command, if a guild wants different looks for
  `/plugin` vs a watch-alert embed) and referenced by the bot process when
  it actually builds the Discord embed payload.
- `og:image`/card reuse: the existing `/api/card/{type}/{key}.png` endpoint
  already renders a nice visual stats card — worth considering as a default
  embed image/thumbnail option before building a from-scratch image
  generator for this.

### Per-server command toggles

**Built, dashboard half only** -- a new `discord_command_toggles` table
(schema.sql: one row per disabled command per guild, "missing = on" --
see its own comment), a guild-scoped API
(`guilds/[guildId]/commands`, `packages/api/src/app/api/discord/`,
`TOGGLEABLE_COMMANDS` in `packages/api/src/lib/discordCommands.ts`), and
the dashboard's Commands tab (`CommandsTab.tsx`) wired to it with
optimistic toggle switches. The bot's own `interactionCreate` handler
(`packages/discord-bot/src/index.ts`) checks the toggle before running a
command and replies with exactly the ephemeral message below if it's
off -- this is the "reject at the interaction level" approach called out
below, not a Discord-side permissions hide. `/help` is hardcoded
non-toggleable on both sides (`ALWAYS_ENABLED_COMMAND` in the bot,
excluded from `TOGGLEABLE_COMMANDS` in the API) so a server that's
turned everything else off still has a way to see that. **Not built:**
the `/commands enable|disable` admin slash command described below --
only the dashboard checklist exists so far, not the second ("two places
to control it") path.

- Admins can turn individual slash commands off for their server (e.g. a
  server that only wants the read-only lookup commands and doesn't want
  `/mystats` or notifications cluttering things up).
- Two places to control it, same underlying per-guild setting: the
  `/commands enable|disable` admin command, and a checklist in the
  dashboard's per-server settings page.
- Needs to reject (or hide via Discord's own per-guild command permissions
  API, if available for the command type) a disabled command at the
  interaction level, not just hide it from being registered — simplest
  correct approach is registering all commands globally as normal and
  having the bot check the per-guild toggle table first thing in the
  interaction handler, replying with an ephemeral "this command is
  disabled on this server" if it's off.

### Dashboard flow

1. **"Add to Discord"** — standard Discord OAuth2 bot-install flow
   (`bot` + `applications.commands` scopes). Discord's own consent screen
   lets the user pick which server to install into; nothing custom needed
   for that part.
2. **"Log in with Discord"** — a *separate* OAuth2 flow (`identify` +
   `guilds` scopes) so the dashboard knows who's logged in and can filter
   to servers where the bot is installed *and* the logged-in user has
   `Manage Server` there.
3. **Server picker** — after login, list those servers, click into one.
4. **Per-server settings page** — watchlist (add/remove/thresholds),
   channel-description bindings, the embed designer, the command toggle
   checklist, and an overview of which Discord users have linked an author
   account (per game) in this server (admin visibility, not edit).

### Account linking (for `/mystats`)

**Built, low-friction version** (`discord_author_links` in schema.sql,
`packages/db/src/authorLinks.ts`, and the bot's `/link`/`/unlink`/
`/mystats` commands in `packages/discord-bot/src/commands/`) --
trust-based, no verification step (see that option below). The
dashboard's read-only "Linked authors" tab (`packages/api`'s
`guilds/[guildId]/linked-authors` route, `LinkedAuthorsTab.tsx`) is also
built: it reads the whole table (no `guild_id` column on it, see below)
and filters down to this guild's current members live via the Discord
API. The verified option below is still just an idea.

**Linking is per Discord user, not per-server, and open to every member —
not just the server owner/admins.** `/link` and `/unlink` are regular
(non-admin) commands anyone in the server can run on their own account; the
admin-only commands (`/watch`, `/channel-stats`, `/commands`) are a
separate, unrelated set of guild-wide settings. The link is keyed by the
Discord user's own global account id, so it follows them into every server
the bot is in — the server owner can link their own author identity same as
any other member, and a server with ten plugin authors in it would end up
with ten independent links, not one shared one.

A Discord user can link **one RuneScape (mod.io) author identity and/or one
RuneLite author identity** — independent per-game links, not a single
combined identity, since the two catalogs have entirely separate author ids
and someone could easily publish under one platform but not the other (or
under different names on each).

Needs a concrete decision before building: how does a Discord user prove
they own a given author identity?

- **Low-friction option:** `/link <game> <author-id-or-slug>` just takes it
  on trust — since this only grants *read* access to already-public stats
  (nothing an unlinked person couldn't already see via `/author`), the
  actual risk of a false claim is low. Simplest to ship first.
- **Verified option:** generate a one-time code the user has to place
  somewhere provably theirs (mod.io profile bio, a specific RuneLite plugin
  hub manifest field) before `/link` accepts it. More trustworthy, more
  friction, more to build, and would need its own verification step per
  game (mod.io and RuneLite have no shared identity to piggyback on).
- Could ship the low-friction version first and revisit if it's ever
  actually abused.

### Other feature ideas worth considering (stretch / optional)

Not in the core feature set above, but each reuses existing infra pretty
cheaply and could be genuinely nice:

- **Daily/weekly digest post** — auto-posted channel summary: biggest
  gainers, biggest drops, new releases over the period. Reuses
  `/api/stats/overview`'s `fastestGrowing`/`newReleases` data almost
  as-is.
- **Milestone celebrations** — distinct from the threshold-based
  watch alerts: fire once, framed as an achievement, when a watched
  plugin/author crosses a round number (10k / 100k / 500k / 1M). More fun
  than a stat-swing notification, and naturally rate-limited since it only
  fires once per milestone ever.
- **New-release firehose channel** — a channel that gets a post for
  *every* new plugin release (optionally filtered to specific tags), as
  distinct from the targeted per-entity watchlist — good fit for a
  plugin-hub-updates style channel some dev communities would want.
- **Pinned, auto-updating leaderboard embed** — richer sibling to the
  channel-topic templates: instead of just text in a channel's topic, a
  bot message edited in place on the hourly tick, showing a real top-5/10
  leaderboard with proper embed formatting (avatars, values, rank
  movement arrows).
- **`/compare <a> <b>`** — a Discord-native version of the site's existing
  compare feature, head-to-head embed for two plugins or two authors.
- **`/trend <plugin>` chart image** — a bigger standalone trend chart,
  reusing the stats card's sparkline renderer at a larger size, for
  someone who wants more than the small sparkline baked into `/plugin`.
- **`/random`** — plugin discovery via the existing `/api/plugins/random`
  endpoint; could also power a scheduled "plugin spotlight" post for
  server engagement, not just an on-demand command.
- **Personal DM follows** — `/follow author <name>` notifies the Discord
  user by DM on that author's new releases, independent of any guild-wide
  watchlist/channel setup — useful for someone who wants updates but isn't
  a server admin anywhere.
- **Role ping on milestone/alert** — optional "also ping @role" setting
  alongside a watch entry, for the moments worth more than a quiet channel
  post.
- **Verified badge in bot output** — if the verified linking tier (see
  **Account linking**) ships, show a checkmark next to a linked author's
  name in `/mystats`/`/author` output — a visible reward for doing the
  harder verification flow instead of the trust-based one.
- **`/status` — built** (see above), mirrors the site's `/api/status`:
  catalog totals plus "data last updated 12 minutes ago". Reassures anyone
  wondering why a number hasn't moved yet.
- **Autocomplete everywhere** — worth calling out as a baseline UX
  requirement rather than a nice-to-have: every name-taking slash command
  option should live-autocomplete via `/api/search` instead of making
  people guess exact spelling/capitalization.

## Suggested architecture

Fits the existing monorepo's pattern of one package per concern
(`packages/db`, `packages/api`, `packages/ingest`, `packages/web`):

- **`packages/discord-bot`** — the long-running bot process (discord.js),
  registers slash commands, handles interactions, runs the
  notification/channel-template tick on the same hourly cadence as ingest.
  Deployed as its own systemd service on the existing VPS, same pattern as
  `rspluginpulse-ingest` (see `deploy/README.md`) — `configure.sh` already
  shows the template for adding a new systemd unit.
- **`packages/dashboard`** (or extend `packages/api` directly, since it's
  already Next.js and already has session-adjacent concerns like CORS) —
  the OAuth login + per-server settings UI. Needs real session storage
  (cookies + a sessions table, or a signed-JWT approach) that the current
  purely-public, no-auth API doesn't have at all yet.
- **`packages/db` additions** — new tables: guild settings, per-guild
  watchlist entries, channel-template bindings, embed configs, per-guild
  command toggles, and Discord-user-to-author links (one row per
  Discord user *per game*, so a user can have a RuneScape row, a RuneLite
  row, or both). All net-new; nothing about the existing schema needs to
  change for this.
- **Reuses as-is:** every existing public API endpoint
  (`/api/plugins/{id}`, `/api/authors/{id}`, `/api/card/...`,
  `/api/badge/...`, `/api/resolve/...`, `/api/leaderboard/...`,
  `/api/search`) — the bot and dashboard are just another API consumer,
  same as the web app. The slug-or-id support already built in means the
  bot can take a human-typed plugin name straight to `/api/resolve/...`
  without any bot-side lookup logic of its own.

## Open questions for the design pass

- Percentage-change threshold default, and whether "big increase" and "big
  drop" should have independent thresholds.
- Whether notifications should also cover *new release* / *author's first
  plugin* events, not just existing-entity stat swings.
- Free vs premium tiering (e.g. cap watchlist size or channel-template
  count on a free tier) — only relevant if this is meant to be
  cost-sustaining; skip entirely if not.
- Whether the bot should support both RuneScape and RuneLite entities in
  the same guild (almost certainly yes, same as the site), and how a guild
  picks a default game for ambiguous commands like `/leaderboard`.
- Discord bot verification: at 75+ servers Discord requires bot
  verification (privacy policy, ToS, review) — worth knowing the threshold
  exists even if it's not a v1 concern.

## Suggested phasing

1. **MVP:** `/plugin`, `/author`, `/leaderboard`, `/rank` — read-only
   commands, no dashboard, no notifications. Proves out the bot process and
   Discord API integration against the existing public API with the least
   new infrastructure (no auth, no new DB tables beyond maybe nothing at
   all).
2. **Notifications + channel templates + command toggles:** needs the new
   DB tables and the hourly tick worker, still no dashboard (configure via
   slash commands only).
3. **Dashboard:** OAuth login, server picker, visual settings for
   everything phase 2 added via slash commands, plus the embed designer.
4. **Account linking + `/mystats`: built** -- both games at once (one
   link per Discord user per game, see **Account linking** above), ahead
   of the dashboard (phase 3) actually landing.
