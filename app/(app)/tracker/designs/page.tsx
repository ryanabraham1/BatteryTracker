import { isDone } from "@/lib/tracker";
import { getDesigns, getParts, getPartsSettings } from "@/lib/parts-data";
import { onshapeConfigured } from "@/lib/onshape";
import { PartsDesigns } from "@/components/parts-designs";
import { PageHead } from "@/components/fab-ui";

export const dynamic = "force-dynamic";
// A big assembly sync reads every Part Studio in it
export const maxDuration = 300;

export default async function DesignsPage() {
  const [designs, parts, settings] = await Promise.all([getDesigns({ includeArchived: true }), getParts({ includeMissing: true }), getPartsSettings()]);
  const counts = new Map<string, { live: number; missing: number; done: number }>();
  for (const p of parts) {
    if (!p.design_id || p.kind === "cots") continue;
    const c = counts.get(p.design_id) ?? { live: 0, missing: 0, done: 0 };
    if (p.missing) c.missing++;
    else c.live++;
    if (isDone(p.status) && !p.missing) c.done++;
    counts.set(p.design_id, c);
  }
  return (
    <>
      <PageHead eyebrow="Fab tracker" title="Designs" />
      <PartsDesigns designs={designs} counts={Object.fromEntries(counts)} connected={onshapeConfigured()} processProp={settings.onshape_process_prop} requireProp={settings.onshape_require_prop} />
    </>
  );
}
