import { useEffect, useState } from "react";
import { DiscordApiError, getDiscordGuildLinkedAuthors, type DiscordLinkedAuthor } from "../../api";
import { LoadingState } from "../../components/LoadingState";

// No verification system exists yet, so this always reads the unverified
// copy -- flip to true once the backend supports the one-time-code flow.
const VERIFIED = false;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function LinkedAuthorsTab({ guildId }: { guildId: string }) {
  const [links, setLinks] = useState<DiscordLinkedAuthor[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    setLinks(null);
    setLoadError(null);
    getDiscordGuildLinkedAuthors(guildId)
      .then((res) => {
        if (!cancelled) setLinks(res.links);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [guildId]);

  return (
    <>
      <div className="dc-tab-head">
        <h2 className="dc-h4">Linked authors</h2>
        <span className="dc-muted">
          Members link their own author accounts with /link. You can see links here but only the member can change them. RuneScape and RuneLite are linked
          separately.
        </span>
      </div>

      {loadError ? (
        <p className="dc-warn">Couldn&rsquo;t load linked authors: {loadError instanceof DiscordApiError ? loadError.code : loadError instanceof Error ? loadError.message : String(loadError)}</p>
      ) : !links ? (
        <LoadingState message="Loading linked authors…" />
      ) : links.length === 0 ? (
        <p className="dc-dim">No members of this server have linked an author account yet.</p>
      ) : (
        <div className="dc-card dc-links-table">
          <div className="dc-links-row dc-links-row--head">
            <span>Member</span>
            <span>RuneScape (mod.io)</span>
            <span>RuneLite</span>
            <span>Linked</span>
          </div>
          {links.map((l) => (
            <div key={l.discordUserId} className="dc-links-row">
              <div className="dc-links-row__member">
                <img src={l.avatarUrl} alt="" className="dc-guild-icon dc-guild-icon--xs" />
                <span>@{l.username}</span>
              </div>
              <span className={l.runescape ? "" : "dc-dim"}>
                {l.runescape ?? "Not linked"}
                {VERIFIED && l.runescape && (
                  <span title="Verified" className="dc-verified">
                    ✓
                  </span>
                )}
              </span>
              <span className={l.runelite ? "" : "dc-dim"}>
                {l.runelite ?? "Not linked"}
                {VERIFIED && l.runelite && (
                  <span title="Verified" className="dc-verified">
                    ✓
                  </span>
                )}
              </span>
              <span className="dc-dim">{formatDate(l.linkedAt)}</span>
            </div>
          ))}
        </div>
      )}
      <span className="dc-note">
        {VERIFIED
          ? "✓ marks accounts verified with a one-time code on the author's profile."
          : "Links are self-reported for now. They only unlock /mystats, which shows public stats."}
      </span>
    </>
  );
}
