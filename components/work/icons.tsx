import type { CSSProperties } from "react";
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
    <span className="work-status" data-status={status} title={status}>
      {status === "Done"
        ? "✓"
        : status === "Canceled" || status === "Duplicate"
          ? "×"
          : ""}
    </span>
  );
}
