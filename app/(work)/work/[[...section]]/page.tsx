import { getWorkUser, getWorkAccess } from "@/lib/work-auth";
import { redirect } from "next/navigation";
import { getWork } from "@/lib/work-data";
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
  const user = await getWorkUser();
  if (!user) redirect("/work/login");
  const [{ section }, snapshot, access] = await Promise.all([
    params,
    getWork(),
    getWorkAccess(),
  ]);
  return (
    <WorkWorkspace
      snapshot={snapshot}
      user={user}
      access={access}
      section={section?.[0] ?? "issues"}
      entityId={section?.[1]}
    />
  );
}
