import { useEffect, useState } from "react";

export type Theme = "dark" | "light";

function readStoredTheme(): Theme {
  const stored = localStorage.getItem("theme");
  return stored === "light" ? "light" : "dark";
}

// Shared by the main site's <Header> and the Discord section's own header
// -- both read/write the same "theme" localStorage key and the same
// <html data-theme> attribute that styles.css's CSS variables key off, so
// a toggle made on one surface is already in effect (via localStorage) the
// next time the other one mounts.
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }

  return [theme, toggleTheme];
}
