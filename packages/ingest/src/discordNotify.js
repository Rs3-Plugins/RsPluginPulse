"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyIngestFailure = notifyIngestFailure;
// Best-effort failure alert -- if DISCORD_WEBHOOK_URL isn't set (e.g. local
// dev), this just logs and does nothing, so ingest keeps working without it.
const MAX_DESCRIPTION_LENGTH = 3500;
async function notifyIngestFailure(source, error) {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
        console.error(`DISCORD_WEBHOOK_URL is not set -- skipping Discord notification for ${source} failure`);
        return;
    }
    const reason = error instanceof Error ? (error.stack ?? error.message) : String(error);
    const description = reason.length > MAX_DESCRIPTION_LENGTH ? `${reason.slice(0, MAX_DESCRIPTION_LENGTH)}\n…(truncated)` : reason;
    try {
        const res = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                embeds: [
                    {
                        title: `Ingest failed: ${source}`,
                        description: `\`\`\`\n${description}\n\`\`\``,
                        color: 0xe35d6f,
                        timestamp: new Date().toISOString(),
                    },
                ],
            }),
        });
        if (!res.ok) {
            console.error(`Discord webhook responded with HTTP ${res.status}`);
        }
    }
    catch (notifyError) {
        // A broken webhook shouldn't mask the original ingest failure.
        console.error("failed to send Discord notification:", notifyError);
    }
}
