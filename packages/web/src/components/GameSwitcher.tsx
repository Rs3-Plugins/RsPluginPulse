import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGame, type Game } from "../context/GameContext";

export interface GameOption {
  key: Game;
  name: string;
  shortName: string;
  sub: string;
  icon: string;
  soon: boolean;
}

export const GAMES: GameOption[] = [
  {
    key: "runescape",
    name: "RuneScape",
    shortName: "RuneScape",
    sub: "Tracking live",
    icon: "https://play-lh.googleusercontent.com/bR5H4nOb0npgaFVxC5ynQPVZ9zDgxAypdx_UzjoF2ZUp-kKosNGFzA9Dmf3bisMXtxi1Ci4grz881ZlfT-rYIgQ=s64-rw",
    soon: false,
  },
  {
    key: "runelite",
    name: "RuneLite",
    shortName: "RuneLite",
    sub: "Tracking live",
    icon: "/game-icons/runelite.jpg",
    soon: false,
  },
  {
    key: "osrs",
    name: "Old School RuneScape",
    shortName: "Oldschool",
    sub: "Not available yet",
    icon: "https://play-lh.googleusercontent.com/RfLViYz3gNEawldoz6ufpy-dpeVRw8uomoITcpVmQ2n36949iCSqnZNW4ilyt41BaVisQV2q-ZtJM7G6IjJm2A=s64-rw",
    soon: true,
  },
];

// Pulled out of the picker UI for now (not ready to show even as
// disabled/"not available") without deleting its GameOption entry --
// OsrsComingSoon, the ?game=osrs route, etc. all keep working, there's
// just no way to reach them from the switcher/mobile menu right now.
export const VISIBLE_GAMES = GAMES.filter((g) => !g.soon);

interface Props {
  updatedLabel: string | null;
  sourceLabel: string;
}

export function GameSwitcher({ updatedLabel, sourceLabel }: Props) {
  const { game, setGame } = useGame();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = GAMES.find((g) => g.key === game) ?? GAMES[0];

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  return (
    <div className="game-switcher" ref={ref}>
      <button
        type="button"
        className={`game-switcher-trigger ${open ? "open" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <img src={current.icon} alt="" referrerPolicy="no-referrer" className="game-icon" />
        <span>{current.shortName}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" className={`game-switcher-chevron ${open ? "open" : ""}`}>
          <path d="M2 3.5L5 6.5L8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="game-switcher-panel" role="listbox" aria-label="Game">
          {VISIBLE_GAMES.map((g) => (
            <button
              key={g.key}
              type="button"
              className={`game-switcher-row ${g.soon ? "disabled" : ""}`}
              role="option"
              aria-selected={game === g.key}
              aria-disabled={g.soon}
              disabled={g.soon}
              onClick={() => {
                if (g.soon) return;
                setGame(g.key);
                navigate("/");
                setOpen(false);
              }}
            >
              <img src={g.icon} alt="" referrerPolicy="no-referrer" className="game-switcher-row-icon" />
              <span className="game-switcher-row-text">
                <span className="game-switcher-row-name">{g.name}</span>
                <span className="game-switcher-row-sub">{g.sub}</span>
              </span>
              {g.soon ? <span className="soon-tag">NOT AVAILABLE</span> : game === g.key ? <span className="game-switcher-check">✓</span> : null}
            </button>
          ))}
          {updatedLabel && (
            <div className="game-switcher-footer">
              {sourceLabel} · {updatedLabel}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
