import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Game = "rs3" | "osrs" | "runelite";

const VALID_GAMES: Game[] = ["rs3", "osrs", "runelite"];

const GameContext = createContext<{ game: Game; setGame: (g: Game) => void }>({
  game: "rs3",
  setGame: () => {},
});

export function GameProvider({ children }: { children: ReactNode }) {
  const [game, setGame] = useState<Game>(() => {
    // A `?game=` in the URL (e.g. a shared leaderboard/stats link) wins over
    // whatever this browser last had selected, so links actually open in
    // the game they were shared for.
    const fromUrl = new URLSearchParams(window.location.search).get("game");
    if (VALID_GAMES.includes(fromUrl as Game)) return fromUrl as Game;
    const stored = localStorage.getItem("game");
    return VALID_GAMES.includes(stored as Game) ? (stored as Game) : "rs3";
  });

  useEffect(() => {
    // RuneLite is an OSRS client, so it shares the OSRS theme palette --
    // only the `game` value itself (used for API scoping, labels, etc.)
    // distinguishes the two.
    document.documentElement.setAttribute("data-game", game === "runelite" ? "osrs" : game);
    localStorage.setItem("game", game);
  }, [game]);

  return <GameContext.Provider value={{ game, setGame }}>{children}</GameContext.Provider>;
}

export function useGame() {
  return useContext(GameContext);
}
