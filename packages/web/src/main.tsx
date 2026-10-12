import { Analytics } from "@vercel/analytics/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
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
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GameProvider>
      <BrowserRouter>
        <div className="app-shell">
          <GameUrlSync />
          <Header />
          <main className="app-main">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/plugin/:id" element={<PluginTrend />} />
              <Route path="/author/:id" element={<AuthorPage />} />
              <Route path="/api" element={<ApiExplorer />} />
              <Route path="/tags/:slug" element={<TagPage />} />
              <Route path="/stats" element={<SiteStats />} />
              <Route path="/compare" element={<SiteStats />} />
            </Routes>
          </main>
          <Footer />
        </div>
        <Analytics />
      </BrowserRouter>
    </GameProvider>
  </StrictMode>,
);
