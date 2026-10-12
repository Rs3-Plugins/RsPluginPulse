import { useEffect, useRef, useState } from "react";

interface Option {
  value: string;
  label: string;
}

interface Props {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  ariaLabel: string;
}

const MIN_SPACE_BELOW = 160;

export function Dropdown({ value, options, onChange, ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    let spaceBelow = window.innerHeight - triggerRect.bottom;

    for (let el = triggerRef.current.parentElement; el; el = el.parentElement) {
      const style = getComputedStyle(el);
      if (style.overflowY === "hidden" || style.overflowY === "auto" || style.overflowY === "scroll") {
        spaceBelow = Math.min(spaceBelow, el.getBoundingClientRect().bottom - triggerRect.bottom);
      }
    }

    setDropUp(spaceBelow < MIN_SPACE_BELOW);
  }, [open]);

  return (
    <div className="dropdown" ref={ref}>
      <button
        ref={triggerRef}
        type="button"
        className="dropdown-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{current?.label ?? value}</span>
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path d="M2 3.5L5 6.5L8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul role="listbox" aria-label={ariaLabel} className={`dropdown-list ${dropUp ? "drop-up" : ""}`}>
          {options.map((o) => (
            <li key={o.value} role="option" aria-selected={o.value === value}>
              <button
                type="button"
                className={`dropdown-option ${o.value === value ? "active" : ""}`}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
