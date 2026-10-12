"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = require("@rspluginpulse/db");
const discordNotify_1 = require("./discordNotify");
const modio_1 = require("./modio");
async function main() {
    const capturedAt = new Date();
    console.log(`fetching mods from mod.io...`);
    const mods = await (0, modio_1.fetchAllMods)();
    console.log(`fetched ${mods.length} mods, writing snapshot at ${capturedAt.toISOString()}`);
    await (0, db_1.upsertPluginsAndSnapshot)(mods, capturedAt);
    console.log("done");
    await (0, db_1.getPool)().end();
}
main().catch(async (error) => {
    console.error(error);
    await (0, discordNotify_1.notifyIngestFailure)("mod.io (RS3)", error);
    process.exit(1);
});
