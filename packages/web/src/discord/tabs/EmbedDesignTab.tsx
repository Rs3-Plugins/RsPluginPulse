import { useState } from "react";
import { byId, COLORS, DEFAULT_EMBEDS, ENT, fillRank, FIELDSETS, fmt, PLACEHOLDERS, spark, vals, type EmbedConfig, type EmbedTarget } from "../mockData";

const TARGETS: { key: EmbedTarget; label: string }[] = [
  { key: "plugin", label: "/plugin reply" },
  { key: "author", label: "/author reply" },
  { key: "alert", label: "Watch alert" },
];

export function EmbedDesignTab() {
  const [eTarget, setETarget] = useState<EmbedTarget>("plugin");
  const [embeds, setEmbeds] = useState<Record<EmbedTarget, EmbedConfig>>(() => JSON.parse(JSON.stringify(DEFAULT_EMBEDS)));
  const [ePrev, setEPrev] = useState<Record<EmbedTarget, string>>({ plugin: "p1", author: "a1", alert: "p4" });

  const E = embeds[eTarget];
  function setE(patch: Partial<EmbedConfig>) {
    setEmbeds((prev) => ({ ...prev, [eTarget]: { ...prev[eTarget], ...patch } }));
  }

  const pe = byId(ePrev[eTarget]);
  const v = vals(pe, eTarget);
  const fieldList = FIELDSETS[eTarget]
    .filter((f) => E.fields[f.key])
    .map((f) => {
      const value = f.key === "subs" ? v.subscribers : f.key === "change" ? (eTarget === "alert" ? (v.direction === "rose" ? "+" : "−") + v.pct : v.change) : (v as unknown as Record<string, string>)[f.key];
      const up = eTarget === "alert" ? v.direction === "rose" : pe.change >= 0;
      return { label: f.label, value, color: f.key === "change" ? (up ? "#e8c874" : "#e35d6f") : "#dcdde0" };
    });
  const prevPool = ENT.filter((e) => (eTarget === "author" ? e.kind === "author" : e.kind === "plugin"));
  const cmd = eTarget === "plugin" ? `/plugin ${pe.name.toLowerCase()}` : eTarget === "author" ? `/author ${pe.name.toLowerCase()}` : "";

  return (
    <>
      <div className="dc-tab-head">
        <h2 className="dc-h4">Embed design</h2>
        <span className="dc-muted">Choose how the bot&rsquo;s replies and alerts look in this server.</span>
      </div>

      <div className="dc-seg dc-seg--inline" style={{ alignSelf: "flex-start" }}>
        {TARGETS.map((t) => (
          <button key={t.key} type="button" className={eTarget === t.key ? "active" : ""} onClick={() => setETarget(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="dc-embed-grid">
        <div className="dc-card dc-card--pad">
          <div className="dc-field">
            <span>Accent colour</span>
            <div className="dc-swatches">
              {COLORS.map((c) => (
                <button
                  key={c.color}
                  type="button"
                  aria-label={c.label}
                  title={c.label}
                  className="dc-swatch"
                  style={{ background: c.color, boxShadow: E.color === c.color ? "0 0 0 2px var(--bg), 0 0 0 4px var(--gold)" : "inset 0 0 0 1px rgba(0,0,0,.25)" }}
                  onClick={() => setE({ color: c.color })}
                />
              ))}
            </div>
          </div>
          <label className="dc-field">
            <span>Title</span>
            <input value={E.title} onChange={(e) => setE({ title: e.target.value })} className="dc-input dc-mono" />
          </label>
          <label className="dc-field">
            <span>Description</span>
            <textarea value={E.desc} onChange={(e) => setE({ desc: e.target.value })} rows={2} className="dc-textarea dc-mono" />
          </label>
          <div className="dc-field">
            <span>Fields</span>
            <div className="dc-chip-wrap">
              {FIELDSETS[eTarget].map((f) => {
                const on = !!E.fields[f.key];
                return (
                  <button
                    key={f.key}
                    type="button"
                    aria-pressed={on}
                    className={`dc-field-chip ${on ? "on" : ""}`}
                    onClick={() => setE({ fields: { ...E.fields, [f.key]: on ? 0 : 1 } })}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="dc-field">
            <span>Image</span>
            <div className="dc-seg" style={{ alignSelf: "flex-start" }}>
              {(["none", "thumb", "card"] as const).map((v) => (
                <button key={v} type="button" className={E.img === v ? "active" : ""} onClick={() => setE({ img: v })}>
                  {v === "none" ? "None" : v === "thumb" ? "Thumbnail" : "Stats card"}
                </button>
              ))}
            </div>
          </div>
          <label className="dc-field">
            <span>Footer</span>
            <input value={E.foot} onChange={(e) => setE({ foot: e.target.value })} className="dc-input" />
          </label>
          <div className="dc-chip-row">
            <span className="dc-dim">Placeholders</span>
            {PLACEHOLDERS[eTarget].map((p) => (
              <span key={p} className="dc-ph-chip dc-mono">
                {p}
              </span>
            ))}
          </div>
        </div>

        <div className="dc-embed-preview">
          <div className="dc-embed-preview__head">
            <span className="dc-dim">Preview with live data</span>
            <select value={ePrev[eTarget]} onChange={(e) => setEPrev((prev) => ({ ...prev, [eTarget]: e.target.value }))} className="dc-select dc-select--sm">
              {prevPool.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} · {e.kind} · {e.game}
                </option>
              ))}
            </select>
          </div>
          <div className="dc-discord-msg">
            <img src="/logo/icon-2a-hex.svg" alt="" className="dc-discord-msg__avatar" />
            <div className="dc-discord-msg__body">
              <div className="dc-discord-msg__head">
                <b>PluginPulse</b>
                <span className="dc-discord-tag dc-discord-tag--bot">BOT</span>
                <span className="dc-discord-msg__time">Today at 14:02</span>
              </div>
              {cmd && <span className="dc-discord-msg__cmd dc-mono">{cmd}</span>}
              <div className="dc-embed" style={{ borderLeftColor: E.color, maxWidth: 460 }}>
                <div className="dc-embed-pv__top">
                  <div className="dc-embed-pv__text">
                    <b style={{ color: "#e8c874" }}>{fillRank(E.title, v)}</b>
                    <span className="dc-embed__body">{fillRank(E.desc, v)}</span>
                  </div>
                  {E.img === "thumb" && <img src="/logo/icon-2a-hex.svg" alt="" className="dc-embed-pv__thumb" />}
                </div>
                {fieldList.length > 0 && (
                  <div className="dc-embed-pv__fields">
                    {fieldList.map((f) => (
                      <div key={f.label} className="dc-embed__field">
                        <span className="dc-embed__field-k">{f.label}</span>
                        <span className="dc-embed__field-v" style={{ color: f.color }}>
                          {f.value}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {E.img === "card" && (
                  <div className="dc-stats-card">
                    <div className="dc-stats-card__head">
                      <span className="dc-stats-card__name brand-font">{pe.name}</span>
                      <span className="dc-stats-card__brand brand-font">PLUGINPULSE</span>
                    </div>
                    <div className="dc-stats-card__body">
                      <div className="dc-stats-card__big">
                        <span>{fmt(pe.installs)}</span>
                        <span className="dc-dim">installs · {pe.game}</span>
                      </div>
                      <svg width="140" height="40" viewBox="0 0 140 40">
                        <polyline points={spark(pe.id)} fill="none" stroke="#caa44d" strokeWidth={2} strokeLinejoin="round" />
                      </svg>
                    </div>
                  </div>
                )}
                <span className="dc-embed__foot">{fillRank(E.foot, v)}</span>
              </div>
            </div>
          </div>
          <span className="dc-note">&ldquo;Stats card&rdquo; attaches the same image as the site&rsquo;s share cards.</span>
        </div>
      </div>
    </>
  );
}
