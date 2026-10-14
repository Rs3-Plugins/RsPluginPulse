import { Analytics } from "@vercel/analytics/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Outlet, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import { GameProvider } from "./context/GameContext";
import { GameUrlSync } from "./components/GameUrlSync";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { Home } from "./pages/Home";
import { PluginTrend } from "./pages/PluginTrend";
import { AuthorPage } from "./pages/AuthorPage";
import { ApiExplorer } from "./pages/ApiExplorer";
import { TagPage } from "./pages/TagPage";
import { SiteStats } from "./pages/SiteStats";
import { LegalPage } from "./pages/LegalPage";
import { NotFound } from "./pages/NotFound";
import { DiscordAuthProvider } from "./discord/DiscordAuthContext";
import { DiscordLayout } from "./discord/DiscordLayout";
import { DiscordLanding } from "./discord/DiscordLanding";
import { DiscordServers } from "./discord/DiscordServers";
import { DiscordServer } from "./discord/DiscordServer";
import { DiscordAdminPage } from "./discord/DiscordAdminPage";
import "./styles.css";
import "./discord/discord.css";

function MainSiteLayout() {
  return (
    <div className="app-shell">
      <GameUrlSync />
      <Header />
      <main className="app-main">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GameProvider>
      <BrowserRouter>
        {/* Wraps the whole app, not just /discord -- the main site's own
            <Header> shows the same signed-in servers dropdown as the
            Discord section's header, so both need the same auth state. */}
        <DiscordAuthProvider>
          <Routes>
            <Route element={<MainSiteLayout />}>
              <Route path="/" element={<Home />} />
              <Route path="/plugin/:id" element={<PluginTrend />} />
              <Route path="/author/:id" element={<AuthorPage />} />
              <Route path="/api" element={<ApiExplorer />} />
              <Route path="/tags/:slug" element={<TagPage />} />
              <Route path="/stats" element={<SiteStats />} />
              <Route path="/compare" element={<SiteStats />} />
              <Route path="/terms" element={<LegalPage doc="terms" />} />
              <Route path="/privacy" element={<LegalPage doc="privacy" />} />
              <Route path="/cookies" element={<LegalPage doc="cookies" />} />
              <Route path="*" element={<NotFound />} />
            </Route>
            <Route path="/discord" element={<DiscordLayout />}>
              <Route index element={<DiscordLanding />} />
              <Route path="servers" element={<DiscordServers />} />
              <Route path="servers/:guildId" element={<DiscordServer />} />
              <Route path="admin" element={<DiscordAdminPage />} />
            </Route>
          </Routes>
          <Analytics />
          <Toaster
            theme="dark"
            position="bottom-right"
            toastOptions={{
              style: {
                background: "var(--surface2)",
                border: "1px solid var(--line2)",
                color: "var(--text)",
              },
            }}
          />
        </DiscordAuthProvider>
      </BrowserRouter>
    </GameProvider>
  </StrictMode>,
);
