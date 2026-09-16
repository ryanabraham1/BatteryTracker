import { Suspense } from "react";
import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import { Header } from "@/components/header";
import { Realtime } from "@/components/realtime";
import { CompModeProvider } from "@/components/comp-mode";
import { OfflineBanner, OfflineProvider, ServiceWorker } from "@/components/offline";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // Full check: signature + hash matches the *current* team code.
  if (!(await isAuthed())) redirect("/login");
  return (
    <CompModeProvider>
      <OfflineProvider>
        <Suspense fallback={null}>
          <Header />
        </Suspense>
        <OfflineBanner />
        <ServiceWorker />
        <Realtime />
        {/* Bottom padding clears the fixed mobile tab bar (+ home indicator); desktop just needs breathing room. */}
        <main className="flex-1 mx-auto w-full max-w-[1400px] px-4 py-4 sm:py-5 pb-[calc(88px+env(safe-area-inset-bottom))] md:pb-16">
          {children}
        </main>
      </OfflineProvider>
    </CompModeProvider>
  );
}
