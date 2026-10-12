import { useGame } from "../context/GameContext";
import { Leaderboard } from "../components/Leaderboard";
import { OsrsComingSoon } from "../components/OsrsComingSoon";
import { usePageMeta } from "../hooks/usePageMeta";

export function Home() {
  const { game } = useGame();

  usePageMeta({
    title: "RuneScape PluginPulse — RuneScape & RuneLite plugin download trends & leaderboards",
    description: "Track install, download and subscriber trends for RuneScape 3 (mod.io) and RuneLite plugins. Leaderboards, per-plugin charts and author rankings.",
    canonicalPath: game === "runescape" ? "/" : `/?game=${game}`,
  });

  return <div className="page">{game === "osrs" ? <OsrsComingSoon /> : <Leaderboard />}</div>;
}
