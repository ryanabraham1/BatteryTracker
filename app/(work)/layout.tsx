import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getWorkUser } from "@/lib/work-auth";
import { Header } from "@/components/header";
import { CompModeProvider } from "@/components/comp-mode";
import { Realtime } from "@/components/realtime";
export default async function WorkLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await getWorkUser())) redirect("/work/login");
  return (
    <CompModeProvider>
      <Suspense fallback={null}>
        <Header />
      </Suspense>
      <Realtime />
      <main className="flex-1 mx-auto w-full max-w-[1400px] px-4 py-4 sm:py-5 pb-12">
        {children}
      </main>
    </CompModeProvider>
  );
}
