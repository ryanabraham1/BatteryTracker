import { Suspense } from "react";
import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import { Header } from "@/components/header";
import { Realtime } from "@/components/realtime";
import { CompModeProvider } from "@/components/comp-mode";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // Full check: signature + hash matches the *current* team code.
  if (!(await isAuthed())) redirect("/login");
  return (
    <CompModeProvider>
      <Suspense fallback={null}>
        <Header />
      </Suspense>
      <Realtime />
      <main className="flex-1 mx-auto w-full max-w-[1400px] px-4 py-5 pb-24">{children}</main>
    </CompModeProvider>
  );
}
