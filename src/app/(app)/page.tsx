import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { requireUser, accessibleProfiles } from "@/lib/session";
import { profileDashboard, type MeterDashboard } from "@/lib/dashboard-data";
import { kwh, tk, watts } from "@/lib/format";
import { AutoRefresh } from "@/components/auto-refresh";
import { EnergyBarChart, PowerLineChart } from "@/components/charts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const dayLabel = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const monthLabel = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });

// Per-user data from the database on every request (see the (app) layout).
export const instant = false;

export default async function DashboardPage() {
  const user = await requireUser();
  const profiles = await accessibleProfiles(user);
  const dashboards = await Promise.all(profiles.map(async (p) => ({ profile: p, meters: await profileDashboard(p.id) })));

  return (
    <div className="grid gap-8">
      <AutoRefresh seconds={60} />
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Updates every minute.</p>
      </div>

      {profiles.length === 0 && (
        <p className="text-sm text-muted-foreground">You are not a member of any profile yet. Ask the super admin to add you.</p>
      )}

      {dashboards.map(({ profile, meters }) => (
        <section key={profile.id} className="grid gap-6">
          {profiles.length > 1 && <h2 className="text-lg font-semibold">{profile.name}</h2>}
          {meters.length === 0 ? (
            <Card>
              <CardContent className="text-sm text-muted-foreground">
                No meters yet.{" "}
                <Link href="/meters" className="underline">
                  Add a meter
                </Link>
                , then{" "}
                <Link href="/devices" className="underline">
                  add its breakers
                </Link>
                .
              </CardContent>
            </Card>
          ) : (
            meters.map((m) => <MeterSection key={m.meter.id} data={m} />)
          )}
        </section>
      ))}
    </div>
  );
}

function MeterSection({ data }: { data: MeterDashboard }) {
  const { meter, cycle, nextStep } = data;
  const hasSolar = data.devices.some((d) => d.source === "solar");
  const remainingKwh = cycle ? Math.max(cycle.projectedKwh - cycle.kwh, 0) : 0;
  const stepSoon = nextStep && cycle && nextStep.unitsLeft < remainingKwh;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {meter.label ?? `Meter ${meter.meterNo}`}
          {meter.utility && <Badge variant="outline">{meter.utility}</Badge>}
        </CardTitle>
        <CardDescription>
          Meter {meter.meterNo}
          {cycle && ` · cycle ${cycle.cycle.start} to ${cycle.cycle.end}, day ${Math.ceil(cycle.daysElapsed)} of ${cycle.daysInCycle}`}
          {cycle?.partialFrom && ` · tracking started ${cycle.partialFrom}, so this cycle's figures are partial`}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        {data.devices.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No breakers on this meter yet.{" "}
            <Link href="/devices" className="underline">
              Add one
            </Link>
            .
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Using now" value={data.liveGridW === null ? "—" : watts(data.liveGridW)} hint={data.liveGridW === null ? "No live reading" : "From the grid"} />
              <Stat label="Today" value={kwh(data.todayGridKwh)} hint={cycle ? `≈ ${tk(estimateCost(data.todayGridKwh, cycle))} energy charge` : undefined} />
              <Stat label="This cycle so far" value={cycle ? kwh(cycle.kwh) : "—"} hint={cycle ? `${tk(cycle.bill.total)} incl. charges` : "No tariff rates"} />
              <Stat
                label="Projected bill"
                value={cycle ? tk(cycle.projected.total) : "—"}
                hint={cycle ? `≈ ${kwh(Math.round(cycle.projectedKwh))} by ${cycle.cycle.end}` : undefined}
                emphasis
              />
              {hasSolar && (
                <>
                  <Stat label="Solar now" value={data.liveSolarW === null ? "—" : watts(data.liveSolarW)} hint="Inverter output" />
                  <Stat label="Solar today" value={kwh(data.todaySolarKwh)} />
                  <Stat label="Solar this cycle" value={cycle?.solar ? kwh(cycle.solar.outputKwh) : "—"} />
                  <Stat label="Saved by solar" value={cycle?.solar ? tk(cycle.solar.saving) : "—"} hint="This cycle so far" emphasis />
                </>
              )}
            </div>

            {nextStep && cycle && (
              <Alert variant={stepSoon ? "destructive" : "default"}>
                <AlertTitle>
                  {cycle.bill.lifeline
                    ? `${kwh(Math.max(nextStep.unitsLeft, 0))} left on the lifeline rate`
                    : `${kwh(Math.max(nextStep.unitsLeft, 0))} until the next slab`}
                </AlertTitle>
                <AlertDescription>
                  {cycle.bill.lifeline
                    ? `Going over ends the lifeline rate of ${tk(nextStep.currentRate)}/kWh — every unit this cycle would then be billed on the slabs.`
                    : `Units now cost ${tk(nextStep.currentRate)}/kWh; after that they cost ${tk(nextStep.nextRate)}/kWh.`}
                  {stepSoon && " At the current pace you will cross it before the cycle ends."}
                </AlertDescription>
              </Alert>
            )}

            <ChartBlock title="Power today">
              {data.power.length ? (
                <PowerLineChart points={data.power} showSolar={hasSolar} />
              ) : (
                <p className="text-sm text-muted-foreground">No readings yet today. Is the poller running?</p>
              )}
            </ChartBlock>

            <div className="grid gap-6 lg:grid-cols-2">
              <ChartBlock title="Last 30 days">
                <EnergyBarChart points={data.daily.map((d) => ({ label: dayLabel(d.day), grid: d.grid, solar: d.solar }))} showSolar={hasSolar} />
              </ChartBlock>
              <ChartBlock title="Last 12 months">
                <EnergyBarChart points={data.monthly.map((d) => ({ label: monthLabel(d.month), grid: d.grid, solar: d.solar }))} showSolar={hasSolar} />
              </ChartBlock>
            </div>

            <DeviceTable devices={data.devices} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Rough Tk value of some kWh at the cycle's average energy rate so far. */
function estimateCost(units: number, cycle: NonNullable<MeterDashboard["cycle"]>) {
  const rate = cycle.projected.kwh > 0 ? cycle.projected.energyCharge / cycle.projected.kwh : 0;
  return units * rate;
}

function Stat({ label, value, hint, emphasis }: { label: string; value: string; hint?: string; emphasis?: boolean }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 tabular-nums ${emphasis ? "text-2xl font-semibold" : "text-xl font-medium"}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function ChartBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <h3 className="text-sm font-medium">{title}</h3>
      {children}
    </div>
  );
}

function DeviceTable({ devices }: { devices: MeterDashboard["devices"] }) {
  return (
    <div className="grid gap-2">
      <h3 className="text-sm font-medium">Breakers</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="text-right">Power</TableHead>
            <TableHead className="text-right">Voltage</TableHead>
            <TableHead className="text-right">Current</TableHead>
            <TableHead className="text-right">Leakage</TableHead>
            <TableHead className="text-right">Today</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {devices.map((d) => (
            <TableRow key={d.id}>
              <TableCell className="font-medium">
                {d.name} {d.source === "solar" && <Badge variant="outline">Solar</Badge>}
              </TableCell>
              <TableCell className="text-right tabular-nums">{d.live?.powerW != null ? watts(d.live.powerW) : "—"}</TableCell>
              <TableCell className="text-right tabular-nums">{d.live?.voltageV != null ? `${d.live.voltageV.toFixed(1)} V` : "—"}</TableCell>
              <TableCell className="text-right tabular-nums">{d.live?.currentA != null ? `${d.live.currentA.toFixed(2)} A` : "—"}</TableCell>
              <TableCell className="text-right tabular-nums">{d.live?.leakageMa != null ? `${d.live.leakageMa} mA` : "—"}</TableCell>
              <TableCell className="text-right tabular-nums">{kwh(d.todayKwh)}</TableCell>
              <TableCell>
                {!d.active ? (
                  <Badge variant="outline">Paused</Badge>
                ) : d.live ? (
                  <Badge variant="secondary">Live</Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {d.online === false ? "Offline" : "No data"}
                    {d.lastSeenAt && ` · ${formatDistanceToNow(d.lastSeenAt, { addSuffix: true })}`}
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
