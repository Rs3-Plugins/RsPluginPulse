import { useGame } from "../context/GameContext";
import { Leaderboard } from "../components/Leaderboard";
import { OsrsComingSoon } from "../components/OsrsComingSoon";

export function Home() {
  const { game } = useGame();

  return <div className="page">{game === "osrs" ? <OsrsComingSoon /> : <Leaderboard />}</div>;
}
