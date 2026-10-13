export interface AvatarPreset {
  id: string;
  label: string;
  url: string;
}

// Pre-rendered 512x512 PNGs in public/discord-bot-icons, exported from the
// same icon set the main site's /logo SVGs use.
export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: "classic", label: "Classic", url: "/discord-bot-icons/classic.png" },
  { id: "classic-dark", label: "Classic Dark", url: "/discord-bot-icons/classic-dark.png" },
  { id: "hex-badge", label: "Hex Badge", url: "/discord-bot-icons/hex-badge.png" },
  { id: "hex-outline", label: "Hex Outline", url: "/discord-bot-icons/hex-outline.png" },
  { id: "hex-line-gold", label: "Hex Line (Gold)", url: "/discord-bot-icons/hex-line-gold.png" },
  { id: "hex-line-white", label: "Hex Line (White)", url: "/discord-bot-icons/hex-line-white.png" },
  { id: "mono-gold", label: "Mono (Gold)", url: "/discord-bot-icons/mono-gold.png" },
  { id: "mono-white", label: "Mono (White)", url: "/discord-bot-icons/mono-white.png" },
];
