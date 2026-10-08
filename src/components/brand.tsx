import { cn } from "@/lib/utils";

/** Mark: a meter dial whose needle is a lightning stroke. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-7", className)}>
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <path
        d="M8.5 21.5a8 8 0 1 1 15 0"
        fill="none"
        strokeWidth="2.2"
        strokeLinecap="round"
        className="stroke-primary-foreground/35"
      />
      <path d="M17.6 9.5 12.4 17.4h4l-1.6 6.1 5.4-8.2h-4.1l1.5-5.8Z" className="fill-primary-foreground" />
    </svg>
  );
}

export function Brand({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <BrandMark />
      <span className="text-[0.95rem] font-semibold tracking-tight">Energy Tracker</span>
    </span>
  );
}
