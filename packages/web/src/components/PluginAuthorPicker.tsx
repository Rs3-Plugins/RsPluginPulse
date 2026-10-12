import { useEffect, useRef, useState } from "react";
import { SearchBox, type SearchBoxGroup, type SearchBoxItem } from "./SearchBox";

export interface PickerItem {
  id: number;
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

interface Props {
  items: PickerItem[];
  value: number | null;
  onChange: (id: number, item: PickerItem) => void;
  placeholder: string;
  loading?: boolean;
}

// A combobox built on the shared SearchBox: shows the current selection's
// name while blurred, clears to let you browse/search the full list while
// focused, and restores the selection's name if you close without picking.
export function PluginAuthorPicker({ items, value, onChange, placeholder, loading }: Props) {
  const current = items.find((i) => i.id === value) ?? null;
  const [query, setQuery] = useState(current?.name ?? "");
  const isOpenRef = useRef(false);
  const pickedRef = useRef(false);

  useEffect(() => {
    if (!isOpenRef.current) setQuery(current ? current.name : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, items]);

  const q = query.trim().toLowerCase();
  const filtered = q ? items.filter((i) => i.name.toLowerCase().includes(q) || i.sub.toLowerCase().includes(q)) : items;

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
    const item = items.find((i) => i.id === picked.id);
    if (!item) return;
    pickedRef.current = true;
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
