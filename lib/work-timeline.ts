import type { WorkItem } from "./work";

/** Cluster neighboring markers so timeline labels always have a readable slot. */
export function clusterMilestones(milestones: WorkItem[], min: number, max: number, trackWidth: number, labelWidth = 170) {
  const sorted = milestones.filter(m => m.data.due && Date.parse(m.data.due) >= min && Date.parse(m.data.due) <= max).sort((a,b) => a.data.due!.localeCompare(b.data.due!));
  const groups: WorkItem[][] = [];
  for (const milestone of sorted) {
    const previous = groups.at(-1);
    const distance = previous ? (Date.parse(milestone.data.due!) - Date.parse(previous[0].data.due!)) / (max - min) * trackWidth : Infinity;
    if (previous && distance < labelWidth + 16) previous.push(milestone);
    else groups.push([milestone]);
  }
  return groups;
}
