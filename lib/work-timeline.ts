import type { WorkItem } from "./work";

/** Every in-range milestone keeps its marker; its label gets the room up to the next marker, or none when that is too tight to read. */
export function labelSlots(milestones: WorkItem[], min: number, max: number, trackWidth: number, maxLabel = 170, minLabel = 44) {
  const sorted = milestones.filter(m => m.data.due && Date.parse(m.data.due) >= min && Date.parse(m.data.due) <= max).sort((a,b) => a.data.due!.localeCompare(b.data.due!));
  const px = (m: WorkItem) => (Date.parse(m.data.due!) - min) / (max - min) * trackWidth;
  return sorted.map((m, i) => {
    const next = sorted[i + 1];
    const room = next ? px(next) - px(m) - 10 : maxLabel;
    const width = Math.min(maxLabel, room);
    return { m, width: width >= minLabel ? width : 0 };
  });
}
