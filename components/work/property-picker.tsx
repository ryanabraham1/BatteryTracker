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

/** Small popover that toggles several options at once (labels); it stays open so you can pick more than one. */
export function MultiPicker({ values, options, onChange, label, disabled = false, children, empty = "No options" }: {
  values: string[];
  options: { value: string; label: string; color?: string }[];
  onChange: (values: string[]) => void;
  label: string;
  disabled?: boolean;
  children: ReactNode;
  empty?: string;
}) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState({ left: 0, top: 0, maxHeight: 360 });
  const choices = options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()));
  return <div className="work-picker">
    <button ref={button} type="button" className="work-text-button" aria-label={label} aria-expanded={open} aria-haspopup="dialog" aria-controls={id} disabled={disabled}
      onClick={() => {
        const rect = button.current!.getBoundingClientRect();
        const below = window.innerHeight - rect.bottom;
        const height = Math.min(360, Math.max(below, rect.top) - 16);
        setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 288)), top: below >= Math.min(280, height) ? rect.bottom + 5 : Math.max(8, rect.top - height - 5), maxHeight: height });
        setQuery("");
        menu.current?.togglePopover();
      }}>{children}</button>
    <div id={id} ref={menu} popover="auto" role="dialog" aria-label={label} className="work-picker-menu" style={position}
      onToggle={e => { const visible = e.newState === "open"; setOpen(visible); if (visible) search.current?.focus(); }}>
      {open && <>
        <input ref={search} aria-label={`Search ${label.toLowerCase()}`} placeholder="Search…" value={query} onChange={e => setQuery(e.target.value)} />
        <div className="work-picker-options">
          {choices.map(o => {
            const on = values.includes(o.value);
            return <button type="button" key={o.value} role="menuitemcheckbox" aria-checked={on} onClick={() => onChange(on ? values.filter(v => v !== o.value) : [...values, o.value])}>
              <span className="work-color-dot" style={{ background: o.color || "var(--purple)" }} /><span>{o.label}</span>{on && <Icon name="check" size={14} />}
            </button>;
          })}
          {!choices.length && <p>{options.length ? "No matching options" : empty}</p>}
        </div>
      </>}
    </div>
  </div>;
}

/** Click-to-edit text: shows `children`, becomes a field with Save/Cancel; Enter saves single-line fields, Escape cancels. */
export function InlineEdit({ value, onSave, multiline = false, disabled = false, label, placeholder, children }: {
  value: string; onSave: (value: string) => void; multiline?: boolean; disabled?: boolean; label: string; placeholder?: string; children: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  function commit() { const next = draft.trim(); setEditing(false); if (next !== value.trim() && (multiline || next)) onSave(next); }
  if (!editing) return <div className="work-inline-edit" data-disabled={disabled}>
    <div role={disabled ? undefined : "button"} tabIndex={disabled ? undefined : 0} aria-label={disabled ? undefined : `Edit ${label.toLowerCase()}`} onClick={() => { if (!disabled) { setDraft(value); setEditing(true); } }} onKeyDown={e => { if (!disabled && e.key === "Enter") { setDraft(value); setEditing(true); } }}>{children}</div>
  </div>;
  const Field = multiline ? "textarea" : "input";
  return <div className="work-inline-edit work-inline-editing">
    <Field autoFocus className="input" aria-label={label} placeholder={placeholder} value={draft} {...(multiline ? { rows: 6 } : {})}
      onChange={e => setDraft(e.target.value)}
      onKeyDown={e => { if (e.key === "Escape") setEditing(false); else if (e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey)) { e.preventDefault(); commit(); } }}
      onBlur={e => { if (!e.relatedTarget || !(e.currentTarget.parentElement?.contains(e.relatedTarget as Node))) commit(); }} />
    {multiline && <div><button type="button" className="btn btn-primary" onClick={commit}>Save</button><button type="button" className="work-text-button" onClick={() => setEditing(false)}>Cancel</button><span className="work-muted">Markdown · ⌘↵ to save</span></div>}
  </div>;
}
