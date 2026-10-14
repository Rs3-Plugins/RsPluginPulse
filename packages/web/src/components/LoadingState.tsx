// Centered icon + message, same layout as the leaderboard's EmptyState
// (see Leaderboard.tsx) -- just a slow pulse on the icon instead of a
// static one, to read as "still working" rather than "nothing here".
export function LoadingState({ message }: { message: string }) {
  return (
    <div className="empty-state loading-state">
      <img src="/logo/icon-2a-hex.svg" alt="" />
      <p style={{ margin: 0 }}>{message}</p>
    </div>
  );
}
