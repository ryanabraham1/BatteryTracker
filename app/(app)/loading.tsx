export default function Loading() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5 animate-pulse">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className={`flex flex-col gap-2 ${i > 0 ? "hidden md:flex" : ""}`}>
          <div className="h-3 w-24 rounded" style={{ background: "var(--line)" }} />
          <div className="h-24 rounded-[10px]" style={{ background: "var(--line)" }} />
          <div className="h-24 rounded-[10px]" style={{ background: "var(--line)", opacity: 0.6 }} />
        </div>
      ))}
    </div>
  );
}
