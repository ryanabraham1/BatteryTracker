import type { CSSProperties } from "react";
export const PROJECT_ICONS = ["projects","rocket","bolt","gear","wrench","target","flag","cube","battery","bot","star","heart","flame","trophy","timeline","insights"];
const paths: Record<string, string> = {
  issues: "M4 5h16M4 12h16M4 19h16",
  inbox: "M4 4h16v16H4zM4 13h5l2 3h2l2-3h5",
  "my-issues": "M9 11l2 2 4-4M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18",
  projects: "M3 7h7l2-3h9v16H3z",
  initiatives: "M12 3l9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5",
  cycles: "M20 7a9 9 0 1 0 1 8M20 3v5h-5",
  views: "M3 4h7v7H3zM14 4h7v7h-7zM3 15h7v6H3zM14 15h7v6h-7z",
  documents: "M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h6",
  updates: "M4 4h16v13H8l-4 4zM8 8h8M8 12h5",
  insights: "M4 20V4M4 20h17M8 16v-5M13 16V7M18 16V3",
  requests: "M4 6h16v14H4zM4 6l8 7 8-7",
  releases: "M12 3l8 5v9l-8 5-8-5V8zM4 8l8 5 8-5M12 13v9",
  archive: "M3 3h18v5H3zM5 8v13h14V8M9 12h6",
  settings: "M4 7h16M4 17h16M8 4v6M16 14v6",
  triage: "M12 3l10 18H2zM12 9v5M12 17v1",
  plus: "M12 5v14M5 12h14",
  search: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14M15 15l6 6",
  close: "M6 6l12 12M18 6L6 18",
  arrow: "M5 12h14M13 6l6 6-6 6",
  check: "M5 12l4 4L19 6",
  star: "M12 3l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z",
  filter: "M3 5h18M6 12h12M9 19h6",
  board: "M3 4h5v16H3zM10 4h5v11h-5zM17 4h4v7h-4z",
  timeline: "M3 4v17M3 8h10M8 13h13M5 18h11",
  label: "M3 3h8l10 10-8 8L3 11zM7 7h.01",
  member: "M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M4 21v-3a8 8 0 0 1 16 0v3",
  team: "M8 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6M16 4a3 3 0 1 1 0 6M2 20v-3a6 6 0 0 1 12 0v3M18 13a6 6 0 0 1 4 5v2",
  milestone: "M5 3v18M5 4h14l-3 5 3 5H5",
  template: "M6 3h12v18H6zM9 7h6M9 11h6M9 15h3",
  customer: "M3 21V7h10v14M13 11h8v10M6 10h4M6 14h4M6 18h4M16 14h2M16 18h2",
  download: "M12 3v12M7 10l5 5 5-5M4 16v5h16v-5",
  menu: "M4 6h16M4 12h16M4 18h16",
  link: "M10 14l4-4M8 16l-2 2a4 4 0 0 1-6-6l4-4M16 8l2-2a4 4 0 0 1 6 6l-4 4",
  rocket: "M12 3c4 2 6 6 5 11l-5 4-5-4c-1-5 1-9 5-11zM12 10h.01M8 17l-3 4M16 17l3 4",
  bolt: "M13 3L5 14h6l-1 7 8-11h-6z",
  gear: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2",
  wrench: "M14 6a4 4 0 0 0 5 5l-9 9a2.5 2.5 0 0 1-4-4l9-9a4 4 0 0 0-1-1zM15 5l-2 2",
  target: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 12h.01",
  flag: "M5 3v18M5 4h13l-2 4 2 4H5",
  cube: "M12 3l8 4v10l-8 4-8-4V7zM4 7l8 4 8-4M12 11v10",
  battery: "M3 8h16v8H3zM19 11h2v2h-2zM6 11v2M9 11v2",
  bot: "M5 8h14v11H5zM12 4v4M9 13h.01M15 13h.01M9 17h6",
  heart: "M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2 4.5 4.5 0 0 1 8 2c0 6-8 11-8 11z",
  flame: "M12 3s5 4 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-8z",
  trophy: "M7 4h10v6a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M12 15v4M8 21h8",
  edit: "M4 20h4L19 9l-4-4L4 16zM13 7l4 4",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6",
  bell: "M5 17h14l-2-3V9a5 5 0 0 0-10 0v5zM10 21h4",
};
export function Icon({
  name,
  size = 18,
  style,
}: {
  name: string;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <path d={paths[name] ?? paths.issues} />
    </svg>
  );
}
export function StatusIcon({ status = "Backlog" }: { status?: string }) {
  return (
    <span className="work-status" data-status={status === "In Progress" ? "In progress" : status === "In Review" ? "In review" : status === "Completed" ? "Done" : status} title={status}>
      {(status === "Done" || status === "Completed")
        ? "✓"
        : status === "Canceled" || status === "Duplicate"
          ? "×"
          : ""}
    </span>
  );
}

/** Diamond that fills from the bottom up with milestone progress (Linear-style). */
export function MilestoneIcon({ percent = 0, complete = false, overdue = false, size = 15 }: { percent?: number; complete?: boolean; overdue?: boolean; size?: number }) {
  const pct = complete ? 100 : Math.max(0, Math.min(100, percent));
  const id = `ms-${Math.round(pct)}-${size}`;
  const color = complete ? "var(--purple)" : overdue ? "#cf5959" : "var(--muted)";
  return (
    <span className="work-milestone-diamond" data-complete={complete} data-overdue={overdue} title={`${pct}%`} style={{ color }}>
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
        <defs><clipPath id={id}><rect x="0" y={16 - (pct / 100) * 16} width="16" height="16" /></clipPath></defs>
        <path d="M8 1.5 14.5 8 8 14.5 1.5 8Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        {pct > 0 && <path d="M8 1.5 14.5 8 8 14.5 1.5 8Z" fill="currentColor" clipPath={`url(#${id})`} />}
      </svg>
    </span>
  );
}
