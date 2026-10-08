import { asc, desc, inArray } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { db, schema } from "@/db";
import { accessibleProfiles, requireUser } from "@/lib/session";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { NativeSelect } from "@/components/native-select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cycleUsageNow, prepaidBalance, type PrepaidBalance } from "@/lib/billing-data";
import { dhakaDay } from "@/lib/energy";
import { kwh, period, tk } from "@/lib/format";
import { addRecharge, createMeter, deleteMeter, deleteRecharge, setBalance, updateMeter } from "./actions";

type Meter = typeof schema.meters.$inferSelect;
type Plan = { id: string; name: string };
type Usage = Awaited<ReturnType<typeof cycleUsageNow>>;

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
  const usage = new Map(await Promise.all(meters.map(async (m) => [m.id, await cycleUsageNow(m.id, m.billingCycleDay)] as const)));
  const prepaid = meters.filter((m) => m.connectionType === "prepaid");
  const balances = new Map(await Promise.all(prepaid.map(async (m) => [m.id, await prepaidBalance(m)] as const)));
  const recharges = prepaid.length
    ? await db
        .select()
        .from(schema.meterRecharges)
        .where(inArray(schema.meterRecharges.meterId, prepaid.map((m) => m.id)))
        .orderBy(desc(schema.meterRecharges.at))
    : [];

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Meters"
        description="One entry per utility meter. Its tariff and charges decide the bill; the breakers under it add up to its usage."
      />

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
                <details key={m.id} className="rounded-xl bg-muted/60 px-4 py-3">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{m.label ? `${m.label} · ${m.meterNo}` : m.meterNo}</span>
                    <Badge variant="secondary">{m.connectionType === "prepaid" ? "Prepaid" : "Postpaid"}</Badge>
                    {m.utility && <Badge variant="outline">{m.utility}</Badge>}
                    <span className="text-muted-foreground">
                      {plans.find((pl) => pl.id === m.tariffPlanId)?.name} · {Number(m.sanctionedLoadKw)} kW
                      {m.billingCycleDay === 1 ? " · calendar month" : ` · cycle starts day ${m.billingCycleDay}`}
                    </span>
                    <span className="ml-auto flex gap-4 font-medium tabular-nums">
                      {balances.get(m.id) && <span>{tk(balances.get(m.id)!.balanceTk)} balance</span>}
                      <span>{kwh(Math.round((usage.get(m.id)?.total ?? 0) * 10) / 10)} this cycle</span>
                    </span>
                  </summary>
                  <div className="mt-4 grid gap-4">
                    <MeterForm meter={m} plans={plans} usage={usage.get(m.id)} />
                    {m.connectionType === "prepaid" && (
                      <PrepaidSection
                        meterId={m.id}
                        balance={balances.get(m.id) ?? null}
                        recharges={recharges.filter((r) => r.meterId === m.id).slice(0, 6)}
                      />
                    )}
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
                <details className="rounded-xl border border-dashed border-border px-4 py-3" open={own.length === 0}>
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

function MeterForm({ meter, profileId, plans, usage }: { meter?: Meter; profileId?: string; plans: Plan[]; usage?: Usage }) {
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
      <CycleUsageField id={id("usage")} usage={usage} />
      <div className="flex items-end sm:col-span-2 lg:col-span-3">
        <SubmitButton variant={meter ? "outline" : "default"}>{meter ? "Save" : "Add meter"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

/**
 * "Units used this cycle so far" from the utility meter, so a meter added mid-cycle starts with the
 * right total. For an existing meter it's prefilled with what's recorded now.
 */
function CycleUsageField({ id, usage }: { id: string; usage?: Usage }) {
  const value = usage && usage.adjustment !== null ? String(Math.round(usage.total * 100) / 100) : "";
  const today = dhakaDay(new Date());
  return (
    <div className="grid gap-2 rounded-xl bg-background/70 p-4 ring-1 ring-foreground/[0.06] sm:col-span-2 lg:col-span-3">
      <Label htmlFor={id}>Units used this cycle so far</Label>
      <div className="flex max-w-xs items-center gap-2">
        <Input
          id={id}
          name="cycleUsageKwh"
          inputMode="decimal"
          defaultValue={value}
          placeholder={usage ? String(Math.round(usage.tracked * 100) / 100) : "e.g. 86.4"}
        />
        <span className="text-sm text-muted-foreground">kWh</span>
      </div>
      <input type="hidden" name="cycleUsageOriginal" value={value} />
      <p className="max-w-[70ch] text-xs text-muted-foreground">
        {usage ? (
          <>
            Read it off your meter or utility app for {period(usage.cycle.start, today)}. The breakers have recorded{" "}
            {kwh(Math.round(usage.tracked * 100) / 100)} of it; the rest counts as used before tracking began.
            {usage.adjustment !== null && ` Currently ${kwh(Math.round(usage.adjustment * 100) / 100)} entered.`} Leave
            empty if tracking started on the cycle&apos;s first day.
          </>
        ) : (
          <>
            Adding the meter partway through a billing cycle? Enter the units it has used since the cycle started, from
            the meter display or your utility app. The bill and price steps then start from the right total. Leave empty
            on the cycle&apos;s first day.
          </>
        )}
      </p>
    </div>
  );
}

const dhakaTime = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Dhaka",
});

/** Balance estimate plus the two inputs that drive it: the meter's reading and recharges. */
function PrepaidSection({
  meterId,
  balance,
  recharges,
}: {
  meterId: string;
  balance: PrepaidBalance | null;
  recharges: (typeof schema.meterRecharges.$inferSelect)[];
}) {
  return (
    <section className="grid gap-4 rounded-xl bg-background/70 p-4 ring-1 ring-foreground/[0.06]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Prepaid balance</h3>
        {balance && (
          <span className="text-sm tabular-nums">
            <span className="text-lg font-semibold">{tk(balance.balanceTk)}</span>
            <span className="text-muted-foreground">
              {balance.daysLeft !== null && ` · about ${Math.floor(balance.daysLeft)} days left`}
            </span>
          </span>
        )}
      </div>
      {balance ? (
        <p className="text-xs text-muted-foreground">
          {tk(balance.anchorTk)} read on {dhakaTime.format(balance.anchorAt)}
          {balance.rechargedTk > 0 && `, + ${tk(balance.rechargedTk)} recharged`}, − {tk(balance.spentTk)} used since.
          Re-enter the meter&apos;s balance any time to correct drift.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Enter the balance your meter shows now. After that the app estimates it from your usage and recharges.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <ActionForm action={setBalance} className="grid content-start gap-2">
          <input type="hidden" name="meterId" value={meterId} />
          <Label htmlFor={`${meterId}-bal`}>Balance on the meter now (Tk)</Label>
          <div className="flex gap-2">
            <Input id={`${meterId}-bal`} name="balanceTk" inputMode="decimal" placeholder="e.g. 742.50" required />
            <SubmitButton variant="outline">Set</SubmitButton>
          </div>
        </ActionForm>
        <ActionForm action={addRecharge} className="grid content-start gap-2">
          <input type="hidden" name="meterId" value={meterId} />
          <Label htmlFor={`${meterId}-rc`}>Add a recharge (Tk)</Label>
          <div className="flex flex-wrap gap-2">
            <Input id={`${meterId}-rc`} name="amountTk" inputMode="decimal" placeholder="e.g. 1000" required className="w-28 flex-1" />
            <Input name="at" type="datetime-local" aria-label="When" className="w-auto flex-1" />
            <SubmitButton variant="outline">Add</SubmitButton>
          </div>
          <p className="text-xs text-muted-foreground">Leave the time empty for now.</p>
        </ActionForm>
      </div>

      {recharges.length > 0 && (
        <ul className="grid text-sm">
          {recharges.map((r) => {
            const included = balance && r.at <= balance.anchorAt;
            return (
              <li key={r.id} className="flex items-center justify-between gap-3 border-t border-border py-2 first:border-t-0">
                <span className="tabular-nums">
                  <span className="font-medium">{tk(Number(r.amountTk))}</span>
                  <span className="text-muted-foreground"> · {dhakaTime.format(r.at)}</span>
                  {included && <span className="text-xs text-muted-foreground"> · already in the balance you entered</span>}
                </span>
                <ActionForm action={deleteRecharge}>
                  <input type="hidden" name="rechargeId" value={r.id} />
                  <SubmitButton variant="ghost" size="sm">
                    Remove
                  </SubmitButton>
                </ActionForm>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
