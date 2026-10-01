import { WorkWorkspace } from "@/components/work/workspace";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Work · 3256 Tools",
  description: "Issues, projects, and initiatives for the WarriorBorgs.",
};
export default async function WorkPage({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  const {section} = await params;
  return <WorkWorkspace section={section?.[0] ?? "issues"} entityId={section?.[1]} />;
}
