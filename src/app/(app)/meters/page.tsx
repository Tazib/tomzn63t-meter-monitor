import { asc, inArray } from "drizzle-orm";
import Link from "next/link";
import { db, schema } from "@/db";
import { accessibleProfiles, requireUser } from "@/lib/session";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { NativeSelect } from "@/components/native-select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createMeter, deleteMeter, updateMeter } from "./actions";

type Meter = typeof schema.meters.$inferSelect;
type Plan = { id: string; name: string };

const UTILITIES = ["DESCO", "DPDC", "BPDB", "NESCO", "WZPDCL", "BREB"];

// Per-user data from the database on every request (see the (app) layout).
export const instant = false;

export default async function MetersPage() {
  const user = await requireUser();
  const profiles = await accessibleProfiles(user);
  const [plans, meters] = await Promise.all([
    db.select({ id: schema.tariffPlans.id, name: schema.tariffPlans.name }).from(schema.tariffPlans).orderBy(asc(schema.tariffPlans.name)),
    profiles.length
      ? db
          .select()
          .from(schema.meters)
          .where(
            inArray(
              schema.meters.profileId,
              profiles.map((p) => p.id),
            ),
          )
          .orderBy(asc(schema.meters.meterNo))
      : Promise.resolve([] as Meter[]),
  ]);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Meters</h1>
        <p className="text-sm text-muted-foreground">
          One entry per utility meter. Its tariff and charges decide the bill; the breakers under it add up to its usage.
        </p>
      </div>

      {profiles.length === 0 && (
        <p className="text-sm text-muted-foreground">You are not a member of any profile yet. Ask the super admin to add you.</p>
      )}
      {profiles.length > 0 && plans.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No tariff plans exist yet. The super admin adds them on the{" "}
          <Link href="/tariffs" className="underline">
            Tariffs
          </Link>{" "}
          page.
        </p>
      )}

      {profiles.map((p) => {
        const own = meters.filter((m) => m.profileId === p.id);
        return (
          <Card key={p.id}>
            <CardHeader>
              <CardTitle>{p.name}</CardTitle>
              <CardDescription>
                {own.length} meter{own.length === 1 ? "" : "s"}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {own.map((m) => (
                <details key={m.id} className="rounded-lg border p-3">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{m.label ? `${m.label} · ${m.meterNo}` : m.meterNo}</span>
                    <Badge variant="secondary">{m.connectionType === "prepaid" ? "Prepaid" : "Postpaid"}</Badge>
                    {m.utility && <Badge variant="outline">{m.utility}</Badge>}
                    <span className="text-muted-foreground">
                      {plans.find((pl) => pl.id === m.tariffPlanId)?.name} · {Number(m.sanctionedLoadKw)} kW
                      {m.billingCycleDay === 1 ? " · calendar month" : ` · cycle starts day ${m.billingCycleDay}`}
                    </span>
                  </summary>
                  <div className="mt-4 grid gap-4">
                    <MeterForm meter={m} plans={plans} />
                    <ActionForm action={deleteMeter}>
                      <input type="hidden" name="meterId" value={m.id} />
                      <SubmitButton variant="destructive" size="sm">
                        Delete meter
                      </SubmitButton>
                    </ActionForm>
                  </div>
                </details>
              ))}

              {plans.length > 0 && (
                <details className="rounded-lg border border-dashed p-3" open={own.length === 0}>
                  <summary className="cursor-pointer text-sm font-medium">Add meter</summary>
                  <div className="mt-4">
                    <MeterForm profileId={p.id} plans={plans} />
                  </div>
                </details>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function MeterForm({ meter, profileId, plans }: { meter?: Meter; profileId?: string; plans: Plan[] }) {
  const key = meter?.id ?? `new-${profileId}`;
  const id = (f: string) => `${key}-${f}`;
  return (
    <ActionForm
      action={meter ? updateMeter : createMeter}
      resetOnSuccess={!meter}
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {meter ? <input type="hidden" name="meterId" value={meter.id} /> : <input type="hidden" name="profileId" value={profileId} />}
      <div className="grid gap-2">
        <Label htmlFor={id("no")}>Meter number</Label>
        <Input id={id("no")} name="meterNo" defaultValue={meter?.meterNo} required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={id("label")}>Label</Label>
        <Input id={id("label")} name="label" defaultValue={meter?.label ?? ""} placeholder="e.g. Ground floor" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={id("utility")}>Utility</Label>
        <NativeSelect id={id("utility")} name="utility" defaultValue={meter?.utility ?? ""}>
          <option value="">—</option>
          {UTILITIES.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={id("type")}>Connection</Label>
        <NativeSelect id={id("type")} name="connectionType" defaultValue={meter?.connectionType ?? "prepaid"}>
          <option value="prepaid">Prepaid</option>
          <option value="postpaid">Postpaid</option>
        </NativeSelect>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={id("plan")}>Tariff plan</Label>
        <NativeSelect id={id("plan")} name="tariffPlanId" defaultValue={meter?.tariffPlanId ?? (plans.length === 1 ? plans[0].id : "")}>
          {plans.length > 1 && <option value="">Pick a plan…</option>}
          {plans.map((pl) => (
            <option key={pl.id} value={pl.id}>
              {pl.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={id("load")}>Sanctioned load (kW)</Label>
        <Input id={id("load")} name="sanctionedLoadKw" inputMode="decimal" defaultValue={meter ? Number(meter.sanctionedLoadKw) : ""} placeholder="On your bill, e.g. 2" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={id("rent")}>Meter rent (Tk/month)</Label>
        <Input id={id("rent")} name="meterRent" inputMode="decimal" defaultValue={meter ? Number(meter.meterRent) : ""} placeholder="e.g. 40 single phase" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={id("rebate")}>Rebate %</Label>
        <Input id={id("rebate")} name="rebatePercent" inputMode="decimal" defaultValue={meter ? Number(meter.rebatePercent) : "0"} placeholder="Prepaid: usually 0.5" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={id("cycle")}>Billing cycle starts on day</Label>
        <Input id={id("cycle")} name="billingCycleDay" type="number" min={1} max={28} defaultValue={meter?.billingCycleDay ?? 1} required />
      </div>
      <div className="flex items-end sm:col-span-2 lg:col-span-3">
        <SubmitButton variant={meter ? "outline" : "default"}>{meter ? "Save" : "Add meter"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
