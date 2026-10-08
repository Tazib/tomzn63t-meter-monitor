"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { LogOut, Monitor, Moon, Sun, UserCog, Users } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const THEMES = [
  { value: "system", label: "Auto", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

/** Avatar button opening a native popover: who's signed in, admin pages, theme, sign out. */
export function AccountMenu({ name, email, admin }: { name: string; email: string; admin: boolean }) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const popover = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- theme is only known on the client
  useEffect(() => setMounted(true), []);

  const close = () => popover.current?.hidePopover();
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      <button
        type="button"
        popoverTarget="account-menu"
        aria-label="Account menu"
        className="grid size-9 place-items-center rounded-full bg-foreground/[0.07] text-xs font-semibold tracking-wide transition-colors hover:bg-foreground/[0.12] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {initials || "?"}
      </button>
      <div
        id="account-menu"
        ref={popover}
        popover="auto"
        className="account-popover m-0 w-72 rounded-2xl border border-border bg-popover p-2 text-popover-foreground shadow-[0_16px_48px_-12px_oklch(0.2_0.02_255/0.25)]"
      >
        <div className="px-3 pt-2 pb-3">
          <div className="truncate text-sm font-semibold">{name}</div>
          <div className="truncate text-xs text-muted-foreground">{email}</div>
          {admin && <div className="mt-1.5 text-xs font-medium text-muted-foreground">Super admin</div>}
        </div>

        {admin && (
          <div className="grid gap-0.5 border-t border-border py-1.5">
            <MenuLink href="/admin/profiles" icon={Users} onNavigate={close}>
              Profiles
            </MenuLink>
            <MenuLink href="/admin/users" icon={UserCog} onNavigate={close}>
              Users
            </MenuLink>
          </div>
        )}

        <div className="border-t border-border px-1 py-2.5">
          <div className="mb-1.5 px-2 text-xs text-muted-foreground">Appearance</div>
          <div role="radiogroup" aria-label="Appearance" className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
            {THEMES.map(({ value, label, icon: Icon }) => {
              const selected = mounted && theme === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setTheme(value)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-all duration-200",
                    selected ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="border-t border-border pt-1.5">
          <button
            type="button"
            onClick={async () => {
              await authClient.signOut();
              router.replace("/login");
              router.refresh();
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="size-4" />
            Sign out
          </button>
        </div>
      </div>
    </>
  );
}

function MenuLink({
  href,
  icon: Icon,
  onNavigate,
  children,
}: {
  href: string;
  icon: typeof Users;
  onNavigate: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <Icon className="size-4" />
      {children}
    </Link>
  );
}
