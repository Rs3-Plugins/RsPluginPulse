export default function Home() {
  return (
    <main style={{ fontFamily: "monospace", padding: 24 }}>
      <h1>RuneScape PluginPulse API</h1>
      <p>Public, read-only data on mod.io RuneScape plugin installs.</p>
      <ul>
        <li><code>GET /api/leaderboard/plugins?period=alltime|hot|weekly|monthly</code></li>
        <li><code>GET /api/leaderboard/authors?period=alltime|hot|weekly|monthly</code></li>
        <li><code>GET /api/plugins/:id/trend</code></li>
      </ul>
    </main>
  );
}
