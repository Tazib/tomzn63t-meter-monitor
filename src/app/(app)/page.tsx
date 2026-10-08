import Link from "next/link";
import { requireUser, accessibleProfiles } from "@/lib/session";
import { buildView, meterLabel, profileDashboard } from "@/lib/dashboard-data";
import { AutoRefresh } from "@/components/auto-refresh";
import { SegmentedTabs } from "@/components/segmented-tabs";
import { DashboardView, Panel } from "@/components/dashboard/dashboard-view";

// Per-user data from the database on every request (see the (app) layout).
export const instant = false;

export default async function DashboardPage() {
  const user = await requireUser();
  const profiles = await accessibleProfiles(user);
  const meters = (await Promise.all(profiles.map((p) => profileDashboard(p.id)))).flat();

  if (profiles.length === 0) {
    return (
      <Panel>
        <p className="text-sm text-muted-foreground">You are not a member of any profile yet. Ask the super admin to add you.</p>
      </Panel>
    );
  }
  if (meters.length === 0 || meters.every((m) => m.devices.length === 0)) {
    return <GettingStarted hasMeter={meters.length > 0} />;
  }

  const overview = buildView("all", meters.length > 1 ? "All meters" : meterLabel(meters[0].meter), meters);
  const perMeter = meters.map((m) => buildView(m.meter.id, meterLabel(m.meter), [m]));

  const views = [overview, ...(meters.length > 1 ? perMeter : [])];
  const subtitle = [profiles.length === 1 ? profiles[0].name : null, `${meters.length} meter${meters.length === 1 ? "" : "s"}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="grid min-w-0 gap-5">
      <AutoRefresh seconds={60} />
      <div className="rise flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-[1.75rem] leading-tight font-semibold tracking-[-0.025em]">
          {meters.length > 1 ? "Home" : overview.title}
        </h1>
        <span className="text-sm text-muted-foreground">{subtitle}</span>
      </div>

      {views.length > 1 ? (
        // One view at a time: all meters combined, or a single meter. Never both on screen.
        <SegmentedTabs
          label="Show"
          tabs={views.map((v) => ({ key: v.key, label: v.title }))}
          panels={views.map((v) => (
            <DashboardView key={v.key} view={v} />
          ))}
        />
      ) : (
        <DashboardView view={overview} />
      )}
    </div>
  );
}

/** First run: a real sequence, so numbered steps earn their place here. */
function GettingStarted({ hasMeter }: { hasMeter: boolean }) {
  const steps = [
    { title: "Add your meter", body: "Meter number, tariff, sanctioned load and meter rent from your electricity bill.", href: "/meters", done: hasMeter },
    { title: "Add your breakers", body: "Pick each 63T breaker from your Tuya account and put it under its meter. Mark the solar one.", href: "/devices", done: false },
    { title: "Watch it fill in", body: "Readings arrive every minute. Bills and the price steps appear as the cycle goes on.", href: null, done: false },
  ];
  return (
    <div className="mx-auto grid max-w-2xl gap-6 pt-6">
      <div className="rise grid gap-2">
        <h1 className="text-[1.75rem] leading-tight font-semibold tracking-[-0.025em]">Let&apos;s get your home connected</h1>
        <p className="text-muted-foreground">Three steps, a few minutes. After that this page shows live power, the projected bill and solar savings.</p>
      </div>
      <ol className="grid gap-3">
        {steps.map((s, i) => (
          <li key={s.title} className="rise" style={{ "--i": i + 1 } as React.CSSProperties}>
            <div className="flex gap-4 rounded-2xl bg-card p-5 ring-1 ring-foreground/[0.07]">
              <span
                className={
                  "grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold " +
                  (s.done ? "bg-grid text-white" : "bg-foreground/[0.07] text-foreground")
                }
              >
                {s.done ? "✓" : i + 1}
              </span>
              <div className="grid gap-1">
                <div className="font-medium">{s.title}</div>
                <p className="text-sm text-muted-foreground">{s.body}</p>
                {s.href && !s.done && (
                  <Link href={s.href} className="mt-1 w-fit text-sm font-medium text-grid underline-offset-4 hover:underline">
                    {s.title} →
                  </Link>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
