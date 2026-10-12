import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useGame } from "../context/GameContext";

// Keeps the current page's URL carrying `?game=` whenever we're off the
// default game (rs3), so leaderboard/stats/compare links can be shared and
// reopen in the right game -- plugin/author pages don't need this since
// their id alone already implies the game. Re-checks on every params
// change (not just game changes) so a page rebuilding its own query string
// from scratch doesn't silently drop it.
export function GameUrlSync() {
  const { game } = useGame();
  const [searchParams, setSearchParams] = useSearchParams();
  const paramsKey = searchParams.toString();

  useEffect(() => {
    const current = searchParams.get("game");
    if (game === "rs3") {
      if (current !== null) {
        const next = new URLSearchParams(searchParams);
        next.delete("game");
        setSearchParams(next, { replace: true });
      }
      return;
    }
    if (current !== game) {
      const next = new URLSearchParams(searchParams);
      next.set("game", game);
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, paramsKey]);

  return null;
}
