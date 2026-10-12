"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = require("@rspluginpulse/db");
const discordNotify_1 = require("./discordNotify");
const runelite_1 = require("./runelite");
async function main() {
    const capturedAt = new Date();
    console.log(`fetching plugins from the RuneLite plugin hub...`);
    const mods = await (0, runelite_1.fetchAllRuneLitePlugins)();
    console.log(`fetched ${mods.length} plugins, writing snapshot at ${capturedAt.toISOString()}`);
    await (0, db_1.upsertPluginsAndSnapshot)(mods, capturedAt);
    console.log("done");
    await (0, db_1.getPool)().end();
}
main().catch(async (error) => {
    console.error(error);
    await (0, discordNotify_1.notifyIngestFailure)("RuneLite", error);
    process.exit(1);
});
