import type { WorkItem } from "./work";

/** Give every in-range milestone its own label lane; labels that would overlap sideways stack into the next lane. */
export function laneMilestones(milestones: WorkItem[], min: number, max: number, trackWidth: number, labelWidth = 170) {
  const sorted = milestones.filter(m => m.data.due && Date.parse(m.data.due) >= min && Date.parse(m.data.due) <= max).sort((a,b) => a.data.due!.localeCompare(b.data.due!));
  const laneEnds: number[] = [];
  return sorted.map(m => {
    const left = (Date.parse(m.data.due!) - min) / (max - min) * trackWidth;
    let lane = laneEnds.findIndex(end => left >= end);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = left + labelWidth + 12;
    return { m, lane };
  });
}
