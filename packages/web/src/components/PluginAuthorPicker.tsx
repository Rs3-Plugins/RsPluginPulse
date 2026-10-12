import { useEffect, useRef, useState } from "react";
import { SearchBox, type SearchBoxGroup, type SearchBoxItem } from "./SearchBox";

export interface PickerItem {
  id: number;
  // The pretty-URL slug (e.g. "117hd") -- optional since a couple of
  // older callers (header search's navigational items) don't need it,
  // but anything that ends up in an API request URL should prefer this
  // over the raw numeric id now that the backend accepts both.
  nameId?: string;
  name: string;
  sub: string;
  // Optional, additive: callers that only pick a plain id (the badge/embed
  // builders) ignore this. A navigational search needs to know which kind
  // of page to go to, which onChange's second argument carries.
  kind?: string;
  // Omit entirely for no avatar slot at all (plugin items); pass null when
  // the entity just doesn't have one set (author items with no avatar).
  avatarUrl?: string | null;
}

function dedupeById(items: PickerItem[]): PickerItem[] {
  const seen = new Set<number>();
  const out: PickerItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

interface Props {
  items: PickerItem[];
  value: number | null;
  onChange: (id: number, item: PickerItem) => void;
  placeholder: string;
  loading?: boolean;
  // `items` is only the top few hundred by downloads (fetching the full
  // catalog up front is what we're avoiding), so typing a query that
  // doesn't match anything in it needs a real server-side search over
  // everything -- otherwise anything outside that top slice is
  // unfindable here even though it exists.
  onSearch?: (query: string) => Promise<PickerItem[]>;
}

// A combobox built on the shared SearchBox: shows the current selection's
// name while blurred, clears to let you browse/search the full list while
// focused, and restores the selection's name if you close without picking.
export function PluginAuthorPicker({ items, value, onChange, placeholder, loading, onSearch }: Props) {
  // A value picked from a remote search result never makes it into `items`
  // (that's still just the capped local list) -- remembering the picked
  // item directly is what lets its name keep showing once the dropdown
  // closes and `remoteResults` resets back to empty.
  const [pickedItem, setPickedItem] = useState<PickerItem | null>(null);
  const current = items.find((i) => i.id === value) ?? (pickedItem?.id === value ? pickedItem : null);
  const [query, setQuery] = useState(current?.name ?? "");
  const isOpenRef = useRef(false);
  const pickedRef = useRef(false);

  useEffect(() => {
    if (!isOpenRef.current) setQuery(current ? current.name : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, items, pickedItem]);

  const q = query.trim().toLowerCase();
  const localFiltered = q ? items.filter((i) => i.name.toLowerCase().includes(q) || i.sub.toLowerCase().includes(q)) : items;

  const [remoteResults, setRemoteResults] = useState<PickerItem[]>([]);
  const searchSeq = useRef(0);

  useEffect(() => {
    if (!onSearch || !q) {
      setRemoteResults([]);
      return;
    }
    const seq = ++searchSeq.current;
    const timer = setTimeout(() => {
      onSearch(query.trim())
        .then((results) => {
          if (searchSeq.current === seq) setRemoteResults(results);
        })
        .catch(() => {
          if (searchSeq.current === seq) setRemoteResults([]);
        });
    }, 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, onSearch]);

  const filtered = q && onSearch ? dedupeById([...localFiltered, ...remoteResults]) : localFiltered;

  const groups: SearchBoxGroup[] = [
    {
      label: `${filtered.length} result${filtered.length === 1 ? "" : "s"}`,
      items: filtered.map((i) => ({
        id: i.id,
        name: i.name,
        sub: i.sub,
        value: i.id === value ? "✓" : undefined,
        avatarUrl: i.avatarUrl,
      })),
    },
  ];

  function handleOpenChange(open: boolean) {
    isOpenRef.current = open;
    if (open) {
      setQuery("");
    } else if (pickedRef.current) {
      pickedRef.current = false;
    } else {
      setQuery(current ? current.name : "");
    }
  }

  function handlePick(picked: SearchBoxItem) {
    // `filtered` is what's actually rendered (local list + any merged-in
    // remote search results), so it's the only list guaranteed to contain
    // whatever the user just clicked.
    const item = filtered.find((i) => i.id === picked.id);
    if (!item) return;
    pickedRef.current = true;
    setPickedItem(item);
    onChange(item.id, item);
  }

  return (
    <SearchBox
      className="picker-search-box"
      query={query}
      onQueryChange={setQuery}
      groups={groups}
      onPick={handlePick}
      onOpenChange={handleOpenChange}
      placeholder={loading ? "Loading…" : placeholder}
      emptyMessage="No matches."
      dropdownAnchor="left"
      dropdownMinWidth={280}
    />
  );
}
