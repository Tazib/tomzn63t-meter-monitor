import { asc, desc, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { isSuperAdmin, requireUser } from "@/lib/session";
import { SLAB_ROWS } from "@/lib/billing";
import { slabRange, tk } from "@/lib/format";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dhakaDay } from "@/lib/energy";
import { addVersion, createPlan, deletePlan, deleteVersion, updatePlan } from "./actions";

type Version = typeof schema.tariffVersions.$inferSelect;
type Slab = typeof schema.tariffSlabs.$inferSelect;

// Per-user data from the database on every request (see the (app) layout).
export const instant = false;

export default async function TariffsPage() {
  const user = await requireUser();
  const admin = isSuperAdmin(user);

  const plans = await db.select().from(schema.tariffPlans).orderBy(asc(schema.tariffPlans.name));
  const versions = plans.length
    ? await db
        .select()
        .from(schema.tariffVersions)
        .where(inArray(schema.tariffVersions.planId, plans.map((p) => p.id)))
        .orderBy(desc(schema.tariffVersions.effectiveFrom))
    : [];
  const slabs = versions.length
    ? await db
        .select()
        .from(schema.tariffSlabs)
        .where(inArray(schema.tariffSlabs.versionId, versions.map((v) => v.id)))
        .orderBy(asc(schema.tariffSlabs.fromKwh))
    : [];
  const meterCounts = await db
    .select({ planId: schema.meters.tariffPlanId, id: schema.meters.id })
    .from(schema.meters);

  const today = dhakaDay(new Date());

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Tariffs</h1>
        <p className="text-sm text-muted-foreground">
          Rates are stored as data. When BERC changes them, add a new set of rates with its start date — old bills keep
          the rates they were made with.
        </p>
      </div>

      {admin && (
        <Card>
          <CardHeader>
            <CardTitle>Add tariff plan</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={createPlan} className="grid gap-4 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
              <div className="grid gap-2">
                <Label htmlFor="plan-name">Name</Label>
                <Input id="plan-name" name="name" placeholder="e.g. BERC LT-A Residential" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="plan-desc">Description</Label>
                <Input id="plan-desc" name="description" placeholder="Optional" />
              </div>
              <SubmitButton>Create plan</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      )}

      {plans.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No tariff plans yet.{admin && " Run npm run seed:tariffs to add the current BERC residential tariff."}
        </p>
      )}

      {plans.map((plan) => {
        const planVersions = versions.filter((v) => v.planId === plan.id);
        const current = planVersions.find((v) => v.effectiveFrom <= today) ?? planVersions.at(-1);
        const used = meterCounts.filter((m) => m.planId === plan.id).length;
        return (
          <Card key={plan.id}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {plan.name}
                <Badge variant="outline">
                  {used} meter{used === 1 ? "" : "s"}
                </Badge>
              </CardTitle>
              {plan.description && <CardDescription>{plan.description}</CardDescription>}
            </CardHeader>
            <CardContent className="grid gap-6">
              {planVersions.length === 0 && <p className="text-sm text-muted-foreground">No rates yet.</p>}
              {planVersions.map((v) => (
                <VersionTable
                  key={v.id}
                  version={v}
                  slabs={slabs.filter((s) => s.versionId === v.id)}
                  current={v.id === current?.id}
                  admin={admin}
                  canDelete={planVersions.length > 1}
                />
              ))}

              {admin && (
                <>
                  <details className="rounded-lg border p-3">
                    <summary className="cursor-pointer text-sm font-medium">Add new rates</summary>
                    <VersionForm
                      planId={plan.id}
                      base={planVersions[0]}
                      baseSlabs={planVersions[0] ? slabs.filter((s) => s.versionId === planVersions[0].id) : []}
                    />
                  </details>

                  <details className="rounded-lg border p-3">
                    <summary className="cursor-pointer text-sm font-medium">Edit or delete plan</summary>
                    <div className="mt-4 grid gap-4">
                      <ActionForm
                        action={updatePlan}
                        resetOnSuccess={false}
                        className="grid gap-4 sm:grid-cols-[1fr_2fr_auto] sm:items-end"
                      >
                        <input type="hidden" name="planId" value={plan.id} />
                        <div className="grid gap-2">
                          <Label htmlFor={`name-${plan.id}`}>Name</Label>
                          <Input id={`name-${plan.id}`} name="name" defaultValue={plan.name} required />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor={`desc-${plan.id}`}>Description</Label>
                          <Input id={`desc-${plan.id}`} name="description" defaultValue={plan.description ?? ""} />
                        </div>
                        <SubmitButton variant="outline">Save</SubmitButton>
                      </ActionForm>
                      <ActionForm action={deletePlan}>
                        <input type="hidden" name="planId" value={plan.id} />
                        <SubmitButton variant="destructive" size="sm">
                          Delete plan
                        </SubmitButton>
                      </ActionForm>
                    </div>
                  </details>
                </>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function VersionTable({
  version: v,
  slabs,
  current,
  admin,
  canDelete,
}: {
  version: Version;
  slabs: Slab[];
  current: boolean;
  admin: boolean;
  canDelete: boolean;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">From {v.effectiveFrom}</span>
        {current && <Badge>In force</Badge>}
        <span className="text-muted-foreground">
          Demand {tk(Number(v.demandChargePerKw))}/kW · VAT {Number(v.vatPercent)}%
          {v.lifelineMaxKwh !== null &&
            ` · Lifeline ${tk(Number(v.lifelineRate))}/kWh if ≤ ${Number(v.lifelineMaxKwh)} kWh a month`}
        </span>
        {admin && canDelete && (
          <ActionForm action={deleteVersion} className="ml-auto">
            <input type="hidden" name="versionId" value={v.id} />
            <input type="hidden" name="planId" value={v.planId} />
            <SubmitButton variant="ghost" size="sm">
              Delete these rates
            </SubmitButton>
          </ActionForm>
        )}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Units in the month</TableHead>
            <TableHead className="text-right">Tk per kWh</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {slabs.map((s) => (
            <TableRow key={s.id}>
              <TableCell>{slabRange(Number(s.fromKwh), s.toKwh === null ? null : Number(s.toKwh))}</TableCell>
              <TableCell className="text-right tabular-nums">{Number(s.rate).toFixed(2)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** New rates form, prefilled from the latest rates so a change only needs the new numbers. */
function VersionForm({ planId, base, baseSlabs }: { planId: string; base?: Version; baseSlabs: Slab[] }) {
  const num = (v: string | null | undefined) => (v === null || v === undefined ? "" : String(Number(v)));
  return (
    <ActionForm action={addVersion} resetOnSuccess={false} className="mt-4 grid gap-4">
      <input type="hidden" name="planId" value={planId} />
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <div className="grid gap-2">
          <Label htmlFor={`eff-${planId}`}>Starts on</Label>
          <Input id={`eff-${planId}`} name="effectiveFrom" type="date" required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`dem-${planId}`}>Demand charge (Tk/kW)</Label>
          <Input id={`dem-${planId}`} name="demandChargePerKw" inputMode="decimal" defaultValue={num(base?.demandChargePerKw) || "0"} required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`vat-${planId}`}>VAT %</Label>
          <Input id={`vat-${planId}`} name="vatPercent" inputMode="decimal" defaultValue={num(base?.vatPercent) || "5"} required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`llmax-${planId}`}>Lifeline up to (kWh)</Label>
          <Input id={`llmax-${planId}`} name="lifelineMaxKwh" inputMode="decimal" defaultValue={num(base?.lifelineMaxKwh)} placeholder="None" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`llrate-${planId}`}>Lifeline rate (Tk/kWh)</Label>
          <Input id={`llrate-${planId}`} name="lifelineRate" inputMode="decimal" defaultValue={num(base?.lifelineRate)} placeholder="None" />
        </div>
      </div>

      <div className="grid gap-2">
        <p className="text-sm font-medium">Slabs</p>
        <p className="text-xs text-muted-foreground">
          Each slab starts where the previous one ends. Leave &ldquo;up to&rdquo; empty on the last slab for no limit. Empty rows
          are ignored.
        </p>
        <div className="grid max-w-md grid-cols-[auto_1fr_1fr] items-center gap-2 text-sm">
          <span />
          <span className="text-muted-foreground">Up to (kWh)</span>
          <span className="text-muted-foreground">Tk per kWh</span>
          {Array.from({ length: SLAB_ROWS }, (_, i) => {
            const s = baseSlabs[i];
            return (
              <div key={i} className="contents">
                <span className="text-muted-foreground tabular-nums">{i + 1}</span>
                <Input name={`upTo-${i}`} inputMode="decimal" aria-label={`Slab ${i + 1} up to`} defaultValue={s ? num(s.toKwh) : ""} />
                <Input name={`rate-${i}`} inputMode="decimal" aria-label={`Slab ${i + 1} rate`} defaultValue={s ? num(s.rate) : ""} />
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <SubmitButton>Save rates</SubmitButton>
      </div>
    </ActionForm>
  );
}
