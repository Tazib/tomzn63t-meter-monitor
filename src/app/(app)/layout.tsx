import Link from "next/link";
import { requireUser, isSuperAdmin } from "@/lib/session";
import { SignOutButton } from "@/components/sign-out-button";

// Every page here is per-user and needs the session, so let the segment block on the request.
export const instant = false;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const admin = isSuperAdmin(user);

  const links = [
    { href: "/", label: "Dashboard" },
    { href: "/bills", label: "Bills" },
    { href: "/meters", label: "Meters" },
    { href: "/devices", label: "Devices" },
    { href: "/tariffs", label: "Tariffs" },
    ...(admin
      ? [
          { href: "/admin/profiles", label: "Profiles" },
          { href: "/admin/users", label: "Users" },
        ]
      : []),
  ];

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="font-semibold">
            Energy Tracker
          </Link>
          <nav className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-foreground">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">
              {user.name}
              {admin && " · Super Admin"}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
