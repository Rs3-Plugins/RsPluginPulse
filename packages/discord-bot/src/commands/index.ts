import type { BotCommand } from "./types";
import * as author from "./author";
import * as help from "./help";
import * as leaderboard from "./leaderboard";
import * as link from "./link";
import * as mystats from "./mystats";
import * as plugin from "./plugin";
import * as rank from "./rank";
import * as status from "./status";
import * as unlink from "./unlink";

export const commands: BotCommand[] = [plugin, author, rank, leaderboard, status, mystats, link, unlink, help];
export const commandsByName = new Map(commands.map((c) => [c.data.name, c]));
