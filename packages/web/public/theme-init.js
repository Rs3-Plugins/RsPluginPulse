// Runs before React mounts so the correct theme/game attributes are present
// for the very first paint, avoiding a flash of the wrong palette. Kept as
// an external file (not inline in index.html) so the production CSP can use
// a plain `script-src 'self'` with no 'unsafe-inline'.
document.documentElement.setAttribute("data-theme", localStorage.getItem("theme") === "light" ? "light" : "dark");
document.documentElement.setAttribute("data-game", localStorage.getItem("game") === "osrs" ? "osrs" : "runescape");
