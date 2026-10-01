import type { WorkSnapshot } from "./work";
/** Keep import provenance and full history in storage/export, not every navigation payload. */
export function compactWorkSnapshot(snapshot: WorkSnapshot): WorkSnapshot {
  return {
    ...snapshot,
    items: snapshot.items.map(i => ({ ...i, data: { ...i.data, source: i.data.source ? { ...i.data.source, raw: undefined } : undefined } })),
    events: snapshot.events.map(e => ({ ...e, data: Object.fromEntries(Object.entries(e.data).map(([key, value]) => {
      if (["before", "after"].includes(key)) {
        const record = value as WorkSnapshot["items"][number] | null;
        return [key, record ? { data: { status: record.data?.status } } : null];
      }
      if (key === "source" && value && typeof value === "object") return [key, { ...value, raw: undefined }];
      return [key, value];
    })) })),
  };
}
