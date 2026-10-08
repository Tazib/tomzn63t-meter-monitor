import Link from "next/link";
import { requireUser, isSuperAdmin } from "@/lib/session";
import { Brand } from "@/components/brand";
import { BottomNav, TopNav } from "@/components/app-nav";
import { AccountMenu } from "@/components/account-menu";

// Every page here is per-user and needs the session, so let the segment block on the request.
export const instant = false;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-4 sm:px-6">
          <Link href="/" aria-label="Energy Tracker home" className="shrink-0">
            <Brand />
          </Link>
          <TopNav />
          <div className="ml-auto">
            <AccountMenu name={user.name} email={user.email} admin={isSuperAdmin(user)} />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-8 pb-28 sm:px-6 md:pb-16">{children}</main>
      <BottomNav />
    </div>
  );
}
