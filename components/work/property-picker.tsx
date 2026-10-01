"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Icon } from "./icons";

export function PropertyPicker({ value, options, onChange, label, disabled = false, icon, display }: {
  value: string;
  options: { value: string; label: string; icon?: ReactNode }[];
  onChange: (value: string) => void;
  label: string;
  disabled?: boolean;
  icon?: ReactNode;
  display?: ReactNode;
}) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState({ left: 0, top: 0, maxHeight: 360 });
  const selected = options.find(o => o.value === value);
  useEffect(() => { if (open) search.current?.focus(); }, [open]);
  const choices = options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()));
  return <div className="work-picker">
    <button ref={button} type="button" className="work-property-button" aria-label={`${label}: ${selected?.label ?? "None"}`} aria-expanded={open} aria-haspopup="dialog" aria-controls={id} disabled={disabled}
      onClick={() => {
        const rect = button.current!.getBoundingClientRect();
        const below = window.innerHeight - rect.bottom;
        const height = Math.min(360, Math.max(below, rect.top) - 16);
        setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 288)), top: below >= Math.min(280, height) ? rect.bottom + 5 : Math.max(8, rect.top - height - 5), maxHeight: height });
        setQuery("");
        menu.current?.togglePopover();
      }}>
      {selected?.icon ?? icon}<span>{display ?? selected?.label ?? "None"}</span><span className="work-picker-chevron">⌄</span>
    </button>
    <div id={id} ref={menu} popover="auto" role="dialog" aria-label={`Choose ${label.toLowerCase()}`} className="work-picker-menu" style={position}
      onToggle={e => { const visible = e.newState === "open"; setOpen(visible); if (visible) search.current?.focus(); }}
      onKeyDown={e => {
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
        const buttons = Array.from(menu.current!.querySelectorAll<HTMLButtonElement>("button"));
        if (!buttons.length) return;
        e.preventDefault();
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : (index + (e.key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length;
        buttons[next].focus();
      }}>
      {open && <>
      <input ref={search} aria-label={`Search ${label.toLowerCase()}`} placeholder={`Search ${label.toLowerCase()}…`} value={query} onChange={e => setQuery(e.target.value)} />
      <div className="work-picker-options">
        {choices.map(o => <button type="button" key={o.value} aria-pressed={value === o.value} onClick={() => { onChange(o.value); menu.current?.hidePopover(); button.current?.focus(); }}>
          {o.icon ?? icon}<span>{o.label}</span>{o.value === value && <Icon name="check" size={14} />}
        </button>)}
        {!choices.length && <p>No matching options</p>}
      </div>
      </>}
    </div>
  </div>;
}
