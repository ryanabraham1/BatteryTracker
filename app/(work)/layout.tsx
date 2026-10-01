import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getWorkUser, getWorkAccess } from "@/lib/work-auth";
import { Header } from "@/components/header";
import { CompModeProvider } from "@/components/comp-mode";
import { Realtime } from "@/components/realtime";
import { getWork } from "@/lib/work-data";
import { WorkProvider } from "@/components/work/work-provider";
export default async function WorkLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getWorkUser();
  if (!user) redirect("/work/login");
  const [snapshot, access] = await Promise.all([getWork(), getWorkAccess()]);
  return (
    <CompModeProvider>
      <Suspense fallback={null}>
        <Header />
      </Suspense>
      <Realtime />
      <main className="flex-1 mx-auto w-full max-w-[1400px] px-4 py-4 sm:py-5 pb-12">
        <WorkProvider snapshot={snapshot} user={user} access={access}>{children}</WorkProvider>
      </main>
    </CompModeProvider>
  );
}
