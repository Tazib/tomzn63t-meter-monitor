"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Tab = { key: string; label: React.ReactNode };

/**
 * Segmented control with a sliding thumb. Only the active panel is mounted (charts need a
 * visible box to size themselves); it fades in on switch to signal the change.
 */
export function SegmentedTabs({
  tabs,
  panels,
  label,
  className,
  size = "md",
}: {
  tabs: Tab[];
  panels: React.ReactNode[];
  label: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const id = useId();
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const el = refs.current[active];
      if (el) setThumb({ x: el.offsetLeft, w: el.offsetWidth });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [active, tabs.length]);

  function onKeyDown(e: React.KeyboardEvent) {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (active + dir + tabs.length) % tabs.length;
    setActive(next);
    refs.current[next]?.focus();
  }

  return (
    <div className={cn("grid gap-4", className)}>
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="relative inline-flex w-fit max-w-full overflow-x-auto rounded-full bg-foreground/[0.06] p-1 [scrollbar-width:none]"
      >
        {thumb && (
          <span
            aria-hidden
            className="absolute top-1 bottom-1 left-0 rounded-full bg-card shadow-[0_1px_3px_oklch(0.2_0.02_255/0.12)] ring-1 ring-foreground/[0.06] transition-[transform,width] duration-300 ease-[var(--ease-out-expo)] motion-reduce:transition-none dark:bg-foreground/[0.14] dark:ring-0"
            style={{ width: thumb.w, transform: `translateX(${thumb.x}px)` }}
          />
        )}
        {tabs.map((t, i) => (
          <button
            key={t.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${i}`}
            aria-selected={i === active}
            aria-controls={`${id}-panel`}
            tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
            className={cn(
              "relative shrink-0 rounded-full font-medium whitespace-nowrap transition-colors duration-200 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              size === "sm" ? "px-3 py-1 text-xs" : "px-4 py-1.5 text-sm",
              i === active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${active}`} key={tabs[active]?.key} className="rise">
        {panels[active]}
      </div>
    </div>
  );
}
