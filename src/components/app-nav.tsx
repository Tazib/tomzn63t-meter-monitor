"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { Gauge, House, Layers, PlugZap, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/", label: "Home", icon: House },
  { href: "/bills", label: "Bills", icon: Receipt },
  { href: "/meters", label: "Meters", icon: Gauge },
  { href: "/devices", label: "Devices", icon: PlugZap },
  { href: "/tariffs", label: "Tariffs", icon: Layers },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Desktop: pill links with an indicator that slides to the current page. */
export function TopNav() {
  const pathname = usePathname();
  const refs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [box, setBox] = useState<{ x: number; w: number } | null>(null);
  const activeIndex = ITEMS.findIndex((i) => isActive(pathname, i.href));

  useLayoutEffect(() => {
    const el = refs.current[activeIndex];
    setBox(el ? { x: el.offsetLeft, w: el.offsetWidth } : null);
  }, [activeIndex]);

  return (
    <nav aria-label="Main" className="relative hidden items-center gap-0.5 md:flex">
      {box && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 rounded-full bg-foreground/[0.07] transition-[transform,width] duration-300 ease-[var(--ease-out-expo)] motion-reduce:transition-none"
          style={{ width: box.w, transform: `translateX(${box.x}px)` }}
        />
      )}
      {ITEMS.map((item, i) => {
        const active = i === activeIndex;
        return (
          <Link
            key={item.href}
            href={item.href}
            ref={(el) => {
              refs.current[i] = el;
            }}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors duration-200",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Phones: thumb-reach tab bar fixed to the bottom of the screen. */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border/80 bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[0.7rem] font-medium transition-colors duration-200",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <Icon className={cn("size-5 transition-transform duration-300", active && "scale-110")} strokeWidth={active ? 2.2 : 1.8} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
