import { useState } from "react";
import { byId, CHANNELS, ENT, fmt, pct, type EntityKind } from "../mockData";

export interface Watch {
  ent: string;
  ch: string;
  up: number;
  dn: number;
  last: string;
  hot: 1 | 0 | -1;
}

export function WatchlistTab({ watches, onWatchesChange }: { watches: Watch[]; onWatchesChange: (next: Watch[]) => void }) {
  const [wType, setWType] = useState<EntityKind>("plugin");
  const [wQ, setWQ] = useState("");
  const [wPick, setWPick] = useState<string | null>(null);
  const [wCh, setWCh] = useState(CHANNELS[0]);
  const [wUp, setWUp] = useState(15);
  const [wDn, setWDn] = useState(15);
  const [cooldown, setCooldown] = useState("6");

  const matches = wQ && !wPick ? ENT.filter((e) => e.kind === wType && e.name.toLowerCase().includes(wQ.toLowerCase()) && !watches.some((w) => w.ent === e.id)).slice(0, 5) : [];
  const canAdd = !!wPick;

  function addWatch() {
    if (!wPick) return;
    onWatchesChange([{ ent: wPick, ch: wCh, up: Math.max(1, wUp || 15), dn: Math.max(1, wDn || 15), last: "Watching · no alerts yet", hot: 0 }, ...watches]);
    setWQ("");
    setWPick(null);
  }
  function updateWatch(i: number, patch: Partial<Watch>) {
    onWatchesChange(watches.map((w, j) => (j === i ? { ...w, ...patch } : w)));
  }
  function removeWatch(i: number) {
    onWatchesChange(watches.filter((_, j) => j !== i));
  }

  return (
    <>
      <div className="dc-tab-head">
        <h2 className="dc-h4">Watchlist</h2>
        <span className="dc-muted">The bot checks every hour and posts when a watched plugin or author moves past its threshold since the last check.</span>
      </div>

      <div className="dc-card dc-card--pad">
        <b className="dc-card__title">Add a watch</b>
        <div className="dc-form-row dc-form-row--end">
          <label className="dc-field">
            <span>Type</span>
            <div className="dc-seg">
              {(["plugin", "author"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  className={wType === k ? "active" : ""}
                  onClick={() => {
                    setWType(k);
                    setWQ("");
                    setWPick(null);
                  }}
                >
                  {k === "plugin" ? "Plugin" : "Author"}
                </button>
              ))}
            </div>
          </label>
          <label className="dc-field dc-field--grow dc-field--autocomplete">
            <span>Name</span>
            <input
              value={wQ}
              onChange={(e) => {
                setWQ(e.target.value);
                setWPick(null);
              }}
              placeholder={wType === "plugin" ? "Search plugins…" : "Search authors…"}
              className="dc-input"
            />
            {matches.length > 0 && (
              <div className="dc-autocomplete">
                {matches.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    className="dc-autocomplete__row"
                    onClick={() => {
                      setWQ(e.name);
                      setWPick(e.id);
                    }}
                  >
                    <span className="dc-autocomplete__name">{e.name}</span>
                    <span className="dc-autocomplete__meta">
                      {e.game} · {fmt(e.installs)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </label>
          <label className="dc-field">
            <span>Channel</span>
            <select value={wCh} onChange={(e) => setWCh(e.target.value)} className="dc-select">
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  #{c}
                </option>
              ))}
            </select>
          </label>
          <label className="dc-field dc-field--num">
            <span>Rise %</span>
            <input type="number" min={1} value={wUp} onChange={(e) => setWUp(Number(e.target.value))} className="dc-input" />
          </label>
          <label className="dc-field dc-field--num">
            <span>Drop %</span>
            <input type="number" min={1} value={wDn} onChange={(e) => setWDn(Number(e.target.value))} className="dc-input" />
          </label>
          <button type="button" className="dc-pill-primary" disabled={!canAdd} onClick={addWatch}>
            Add watch
          </button>
        </div>
      </div>

      <div className="dc-card dc-list">
        {watches.map((w, i) => {
          const e = byId(w.ent);
          return (
            <div key={i} className="dc-list__row dc-watch-row">
              <div className="dc-watch-row__id">
                <div className="dc-watch-row__name">
                  <span className="dc-kind-tag">{e.kind}</span>
                  <b>{e.name}</b>
                </div>
                <span className="dc-dim">
                  {e.game} · {fmt(e.installs)} installs · {pct(e.change)} this week
                </span>
              </div>
              <span className="dc-watch-row__ch">#{w.ch}</span>
              <div className="dc-watch-row__thresholds">
                <span>Rise</span>
                <input type="number" min={1} value={w.up} aria-label="Rise threshold" onChange={(e) => updateWatch(i, { up: Math.max(1, Number(e.target.value) || 1) })} className="dc-input dc-input--xs" />
                <span>%</span>
                <span className="dc-watch-row__dn-label">Drop</span>
                <input type="number" min={1} value={w.dn} aria-label="Drop threshold" onChange={(e) => updateWatch(i, { dn: Math.max(1, Number(e.target.value) || 1) })} className="dc-input dc-input--xs" />
                <span>%</span>
              </div>
              <span className={`dc-watch-row__last ${w.hot > 0 ? "is-up" : w.hot < 0 ? "is-down" : ""}`}>{w.last}</span>
              <button type="button" className="dc-pill-outline dc-pill-outline--sm dc-pill-outline--danger" aria-label="Remove watch" onClick={() => removeWatch(i)}>
                Remove
              </button>
            </div>
          );
        })}
        {watches.length === 0 && <div className="dc-empty">Nothing watched yet. Add a plugin or author above.</div>}
      </div>

      <div className="dc-card dc-card--pad dc-card--row">
        <div className="dc-cooldown__copy">
          <b>Cooldown</b>
          <span className="dc-dim">After an alert, the same plugin or author stays quiet for this long, so one sitting near its threshold doesn&rsquo;t post every hour.</span>
        </div>
        <select value={cooldown} onChange={(e) => setCooldown(e.target.value)} className="dc-select">
          <option value="3">3 hours</option>
          <option value="6">6 hours</option>
          <option value="12">12 hours</option>
          <option value="24">24 hours</option>
        </select>
      </div>
    </>
  );
}
