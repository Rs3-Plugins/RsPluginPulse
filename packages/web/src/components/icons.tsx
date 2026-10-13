import type { Theme } from "../hooks/useTheme";

// Small presentational icons shared across the main site's <Header> and the
// Discord section's own header, which otherwise mirror a lot of the same
// icon-button UI (coffee link, theme toggle, mobile menu).
export function CoffeeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 6.5h9v3.5a3 3 0 01-3 3h-3a3 3 0 01-3-3V6.5Z" />
      <path d="M11.5 7h1a1.8 1.8 0 010 3.6h-1" />
      <path d="M5.2 4.3c-.4-.5-.4-1 0-1.6M7.8 4.3c-.4-.5-.4-1 0-1.6" />
    </svg>
  );
}

export function ThemeIcon({ theme }: { theme: Theme }) {
  if (theme === "dark") {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <circle cx="8" cy="8" r="3" />
        <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M3.5 12.5l1.4-1.4M11.1 4.9l1.4-1.4" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M13.8 9.9A5.8 5.8 0 116.1 2.2a4.6 4.6 0 107.7 7.7Z" />
    </svg>
  );
}

export function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M3 5h12M3 9h12M3 13h12" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M3 3l10 10M13 3L3 13" />
    </svg>
  );
}

export function EditIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11.3 2.3a1.6 1.6 0 0 1 2.4 2.4L5.5 12.9l-3 .7.7-3 8.1-8.3Z" />
    </svg>
  );
}

export function TrashIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 4.5h10M6.3 4.5V3a1 1 0 0 1 1-1h1.4a1 1 0 0 1 1 1v1.5" />
      <path d="M4.6 4.5l.6 8.1a1 1 0 0 0 1 .9h3.6a1 1 0 0 0 1-.9l.6-8.1" />
    </svg>
  );
}

// Circular-arrow "revert to default" -- distinct from TrashIcon, which
// visually implies permanent removal rather than resetting to the bot's
// own default avatar (there's no such thing as "no avatar" to delete to).
export function ResetIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 8A5 5 0 1 1 11.5 4.3" />
      <path d="M13 2.5v3.3h-3.3" />
    </svg>
  );
}

export function ZoomOutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <circle cx="7" cy="7" r="5" />
      <path d="M13.5 13.5 11 11M4.6 7h4.8" />
    </svg>
  );
}

export function ZoomInIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <circle cx="7" cy="7" r="5" />
      <path d="M13.5 13.5 11 11M7 4.6v4.8M4.6 7h4.8" />
    </svg>
  );
}

export function LockIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5 7V4.5a3 3 0 0 1 6 0V7" />
    </svg>
  );
}

export function UploadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 10.5V2.5M5 5.5 8 2.5l3 3" />
      <path d="M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2" />
    </svg>
  );
}

// Admin-only manual "Refresh now" button on a channel-topic binding (see
// ChannelTopicsTab.tsx) -- a circular-arrow distinct from ResetIcon's
// single-pointed one, since this means "re-render right now", not "revert".
export function RefreshIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" />
      <path d="M13.5 2.5v3.3h-3.3" />
    </svg>
  );
}

export function DiceIcon({ rolling }: { rolling: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" className={`dice-icon ${rolling ? "rolling" : ""}`}>
      <rect x="1.5" y="1.5" width="13" height="13" rx="3" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="5" cy="5" r="1.1" fill="currentColor" />
      <circle cx="11" cy="5" r="1.1" fill="currentColor" />
      <circle cx="8" cy="8" r="1.1" fill="currentColor" />
      <circle cx="5" cy="11" r="1.1" fill="currentColor" />
      <circle cx="11" cy="11" r="1.1" fill="currentColor" />
    </svg>
  );
}
