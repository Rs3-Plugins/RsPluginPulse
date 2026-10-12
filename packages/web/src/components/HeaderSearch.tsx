import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getTopAuthors, getTopPlugins } from "../api";
import { useGame } from "../context/GameContext";
import { PluginAuthorPicker, type PickerItem } from "./PluginAuthorPicker";

// Desktop only (see Header.tsx / styles.css) -- mobile has no room for it
// next to the hamburger menu.
export function HeaderSearch() {
  const { game } = useGame();
  const navigate = useNavigate();
  const [items, setItems] = useState<PickerItem[] | null>(null);
  const loadedRef = useRef(false);

  // Lazy: only fetched once the user actually opens the picker, not on
  // every page load -- this is full plugin+author lists (limit=10000
  // each), the same "only pay for it when it's actually used" reasoning
  // as the badge/embed builder tabs.
  function loadIfNeeded() {
    if (loadedRef.current) return;
    loadedRef.current = true;
    Promise.all([getTopPlugins("alltime", game), getTopAuthors("alltime", game)])
      .then(([p, a]) => {
        const pluginItems: PickerItem[] = p.plugins.map((pl) => ({
          id: pl.id,
          name: pl.name,
          sub: `Plugin · by ${pl.authorName}`,
          kind: "plugin",
        }));
        const authorItems: PickerItem[] = a.authors.map((au) => ({
          id: au.authorId,
          name: au.authorName,
          sub: `Author · ${au.pluginCount} plugin${au.pluginCount === 1 ? "" : "s"}`,
          kind: "author",
        }));
        setItems([...pluginItems, ...authorItems]);
      })
      .catch(() => setItems([]));
  }

  // The loaded list is scoped to whichever game it was fetched for -- if
  // the game changes while the header stays mounted, drop it so the next
  // open reloads for the new game instead of showing stale cross-game
  // results.
  useEffect(() => {
    loadedRef.current = false;
    setItems(null);
  }, [game]);

  return (
    <div className="header-search" onMouseDown={loadIfNeeded} onFocus={loadIfNeeded}>
      <PluginAuthorPicker
        items={items ?? []}
        value={null}
        onChange={(_, item) => navigate(item.kind === "author" ? `/author/${item.id}` : `/plugin/${item.id}`)}
        placeholder="Search plugins or authors…"
        loading={items === null}
      />
    </div>
  );
}
