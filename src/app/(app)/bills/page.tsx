import { desc, inArray } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { db, schema } from "@/db";
import { accessibleProfiles, isSuperAdmin, requireUser } from "@/lib/session";
import { currentCycleBill, type SolarResult, type StoredBreakdown } from "@/lib/billing-data";
import type { Bill } from "@/lib/billing";
import { kwh, period, tk } from "@/lib/format";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { BillBreakdown } from "@/components/bill-breakdown";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { finalizeNow, recalculateBill } from "./actions";

// Per-user data from the database on every request (see the (app) layout).
export const instant = false;

export default async function BillsPage() {
  const user = await requireUser();
  const admin = isSuperAdmin(user);
  const profiles = await accessibleProfiles(user);
  const meters = profiles.length
    ? await db
        .select()
        .from(schema.meters)
        .where(
          inArray(
            schema.meters.profileId,
            profiles.map((p) => p.id),
          ),
        )
        .orderBy(schema.meters.meterNo)
    : [];
  const [current, past] = await Promise.all([
    Promise.all(meters.map((m) => currentCycleBill(m))),
    meters.length
      ? db
          .select()
          .from(schema.bills)
          .where(
            inArray(
              schema.bills.meterId,
              meters.map((m) => m.id),
            ),
          )
          .orderBy(desc(schema.bills.periodStart))
      : Promise.resolve([] as (typeof schema.bills.$inferSelect)[]),
  ]);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Bills"
        description="Worked out from the breakers' readings and each meter's tariff. Your utility's meter may differ slightly."
        actions={admin && (
          <ActionForm action={finalizeNow} className="flex items-center gap-2">
            <SubmitButton variant="outline" size="sm">
              Store finished cycles now
            </SubmitButton>
          </ActionForm>
        )}
      />

      {meters.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No meters yet.{" "}
          <Link href="/meters" className="underline">
            Add one
          </Link>
          .
        </p>
      )}

      {meters.map((meter, i) => {
        const c = current[i];
        const history = past.filter((b) => b.meterId === meter.id);
        const profile = profiles.find((p) => p.id === meter.profileId);
        return (
          <Card key={meter.id}>
            <CardHeader>
              <CardTitle>{meter.label ?? `Meter ${meter.meterNo}`}</CardTitle>
              <CardDescription>
                {profiles.length > 1 && `${profile?.name} · `}Meter {meter.meterNo}
                {meter.utility && ` · ${meter.utility}`} · {meter.connectionType}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6">
              {!c ? (
                <p className="text-sm text-muted-foreground">This meter&apos;s tariff plan has no rates yet.</p>
              ) : (
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="grid content-start gap-2">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="text-sm font-medium">This cycle so far · {period(c.cycle.start, c.cycle.end)}</h3>
                      <Badge variant="secondary">
                        Day {Math.ceil(c.daysElapsed)} of {c.daysInCycle}
                      </Badge>
                    </div>
                    {c.partialFrom && <PartialNote from={c.partialFrom} />}
                    {c.adjustmentKwh !== null && <AdjustmentNote kwh={c.adjustmentKwh} />}
                    <BillBreakdown bill={c.bill} />
                  </div>
                  <div className="grid content-start gap-2">
                    <h3 className="text-sm font-medium">Projected for the full cycle</h3>
                    <p className="text-sm text-muted-foreground">
                      At the pace so far: about {kwh(Math.round(c.projectedKwh))}.
                      {!c.projectionReliable && " Rough estimate until there's a full day of readings."}
                    </p>
                    <BillBreakdown bill={c.projected} />
                  </div>
                  {c.solar && <SolarSaving solar={c.solar} bill={c.bill} />}
                </div>
              )}

              <div className="grid gap-2">
                <h3 className="text-sm font-medium">Past bills</h3>
                {history.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    None yet. A bill is stored automatically once a cycle ends.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Period</TableHead>
                        <TableHead className="text-right">Units</TableHead>
                        <TableHead className="text-right">Bill</TableHead>
                        <TableHead className="text-right">Saved by solar</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.map((b) => {
                        const breakdown = b.breakdown as StoredBreakdown;
                        return (
                          <TableRow key={b.id} className="align-top">
                            <TableCell>
                              <details>
                                <summary className="cursor-pointer">
                                  {period(b.periodStart, b.periodEnd)}{" "}
                                  {breakdown.partialFrom && <Badge variant="outline">Partial</Badge>}
                                </summary>
                                <div className="mt-2 grid min-w-80 gap-2">
                                  {breakdown.partialFrom && <PartialNote from={breakdown.partialFrom} />}
                                {breakdown.adjustmentKwh != null && <AdjustmentNote kwh={breakdown.adjustmentKwh} />}
                                  <BillBreakdown bill={breakdown} />
                                </div>
                              </details>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{kwh(Number(b.kwh))}</TableCell>
                            <TableCell className="text-right tabular-nums">{tk(Number(b.total))}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {b.solarSaving === null ? "—" : tk(Number(b.solarSaving))}
                            </TableCell>
                            <TableCell className="text-right">
                              {admin && (
                                <ActionForm action={recalculateBill}>
                                  <input type="hidden" name="billId" value={b.id} />
                                  <SubmitButton variant="ghost" size="sm">
                                    Recalculate
                                  </SubmitButton>
                                </ActionForm>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function AdjustmentNote({ kwh: units }: { kwh: number }) {
  return (
    <p className="text-xs text-muted-foreground">
      Includes {kwh(Math.round(units * 100) / 100)} entered from the meter for usage before the breakers started tracking.
    </p>
  );
}

function PartialNote({ from }: { from: string }) {
  return (
    <p className="text-xs text-muted-foreground">
      Partial: tracking started on {from}, so usage before that isn&apos;t counted and the real bill will be higher.
    </p>
  );
}

function SolarSaving({ solar, bill }: { solar: SolarResult; bill: Bill }) {
  return (
    <div className="grid content-start gap-2 lg:col-span-2">
      <h3 className="text-sm font-medium">Saved by solar this cycle: {tk(solar.saving)}</h3>
      <p className="text-sm text-muted-foreground">
        The inverter delivered {kwh(solar.outputKwh)} and drew {kwh(solar.inputKwh)} from the grid. Without it, those
        loads would have come straight from the grid: {kwh(solar.billWithoutSolar.kwh)} instead of {kwh(bill.kwh)}, a
        bill of {tk(solar.billWithoutSolar.total)} instead of {tk(bill.total)}.
      </p>
    </div>
  );
}
