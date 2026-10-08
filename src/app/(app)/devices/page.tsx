import { eq, inArray } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { formatDistanceToNow } from "date-fns";
import { db, schema } from "@/db";
import { accessibleProfiles, isSuperAdmin, requireUser } from "@/lib/session";
import { listUserDevices, type TuyaDevice } from "@/lib/tuya/client";
import { hasEnergyCounter, parseStatus } from "@/lib/tuya/decode";
import { errorMessage } from "@/lib/action-result";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { NativeSelect } from "@/components/native-select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addDevice, deleteDevice, setDeviceActive, updateDevice } from "./actions";

type Meter = typeof schema.meters.$inferSelect;
type Device = typeof schema.devices.$inferSelect;

// Per-user data from the database on every request (see the (app) layout).
export const instant = false;

export default async function DevicesPage() {
  const user = await requireUser();
  const admin = isSuperAdmin(user);
  const profiles = await accessibleProfiles(user);
  const profileIds = profiles.map((p) => p.id);

  const [meters, devices] = profileIds.length
    ? await Promise.all([
        db.select().from(schema.meters).where(inArray(schema.meters.profileId, profileIds)).orderBy(schema.meters.meterNo),
        db
          .select({ device: schema.devices, profileId: schema.meters.profileId })
          .from(schema.devices)
          .innerJoin(schema.meters, eq(schema.meters.id, schema.devices.meterId))
          .where(inArray(schema.meters.profileId, profileIds))
          .orderBy(schema.devices.name),
      ])
    : [[], []];

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Devices"
        description="TOVA 63T breakers tracked for billing. The app only reads from them; it never switches them."
      />

      {profiles.length === 0 && (
        <p className="text-sm text-muted-foreground">
          You are not a member of any profile yet. Ask the super admin to add you.
        </p>
      )}

      {profiles.map((p) => (
        <ProfileDevices
          key={p.id}
          profile={p}
          meters={meters.filter((m) => m.profileId === p.id)}
          devices={devices.filter((d) => d.profileId === p.id).map((d) => d.device)}
          admin={admin}
        />
      ))}
    </div>
  );
}

async function ProfileDevices({
  profile,
  meters,
  devices,
  admin,
}: {
  profile: { id: string; name: string; tuyaUid: string | null };
  meters: Meter[];
  devices: Device[];
  admin: boolean;
}) {
  let tuyaDevices: TuyaDevice[] = [];
  let tuyaError: string | null = null;
  if (profile.tuyaUid) {
    try {
      tuyaDevices = await listUserDevices(profile.tuyaUid);
    } catch (e) {
      tuyaError = errorMessage(e);
    }
  }

  const tracked = new Set(devices.map((d) => d.tuyaDeviceId));
  const addable = tuyaDevices.filter((d) => !tracked.has(d.id) && hasEnergyCounter(d.status));
  const unsupported = tuyaDevices.filter((d) => !hasEnergyCounter(d.status));
  const gridDevices = devices.filter((d) => d.source === "grid");
  const meterLabel = (id: string) => {
    const m = meters.find((x) => x.id === id);
    return m ? (m.label ? `${m.label} (${m.meterNo})` : m.meterNo) : "—";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{profile.name}</CardTitle>
        <CardDescription>
          {profile.tuyaUid ? `Tuya account ${profile.tuyaUid}` : "No Tuya account linked yet"}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <section className="grid gap-3">
          <h3 className="text-sm font-medium">Tracked devices</h3>
          {devices.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
          <div>
          {devices.map((d) => (
            <div key={d.id} className="grid gap-3 border-t border-border py-4 first:border-t-0 first:pt-0 md:grid-cols-[1fr_auto] md:items-center">
              <div className="grid gap-1">
                <div className="flex flex-wrap items-center gap-2 font-medium">
                  {d.name}
                  <Badge variant={d.source === "solar" ? "default" : "secondary"}>{d.source === "solar" ? "Solar" : "Grid"}</Badge>
                  {!d.active ? (
                    <Badge variant="outline">Paused</Badge>
                  ) : d.online === false ? (
                    <Badge variant="destructive">Offline</Badge>
                  ) : null}
                </div>
                <div className="text-sm text-muted-foreground">
                  {d.source === "solar" ? "Valued against meter" : "Meter"} {meterLabel(d.meterId)}
                  {d.inverterInputDeviceId &&
                    ` · inverter input: ${devices.find((x) => x.id === d.inverterInputDeviceId)?.name ?? "?"}`}
                </div>
                <div className="text-sm text-muted-foreground tabular-nums">
                  Counter {d.lastEnergyKwh ? `${Number(d.lastEnergyKwh).toFixed(2)} kWh` : "—"}
                  {d.lastSeenAt && ` · last reading ${formatDistanceToNow(d.lastSeenAt, { addSuffix: true })}`}
                </div>
              </div>
              <div className="flex flex-wrap items-start gap-2">
                <ActionForm action={setDeviceActive}>
                  <input type="hidden" name="deviceId" value={d.id} />
                  <input type="hidden" name="active" value={String(!d.active)} />
                  <SubmitButton variant="outline" size="sm">
                    {d.active ? "Pause" : "Resume"}
                  </SubmitButton>
                </ActionForm>
                {admin && (
                  <ActionForm action={deleteDevice}>
                    <input type="hidden" name="deviceId" value={d.id} />
                    <SubmitButton variant="destructive" size="sm">
                      Delete
                    </SubmitButton>
                  </ActionForm>
                )}
              </div>
              <details className="md:col-span-2">
                <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">Settings</summary>
                <ActionForm
                  action={updateDevice}
                  resetOnSuccess={false}
                  className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
                >
                  <input type="hidden" name="deviceId" value={d.id} />
                  <PlacementFields
                    idPrefix={d.id}
                    name={d.name}
                    source={d.source}
                    meterId={d.meterId}
                    inverterInputDeviceId={d.inverterInputDeviceId}
                    meters={meters}
                    gridDevices={gridDevices.filter((g) => g.id !== d.id)}
                  />
                  <div className="sm:col-span-2 lg:col-span-4">
                    <SubmitButton variant="outline" size="sm">
                      Save settings
                    </SubmitButton>
                  </div>
                </ActionForm>
              </details>
            </div>
          ))}
          </div>
        </section>

        <section className="grid gap-3">
          <h3 className="text-sm font-medium">Add a device</h3>
          {!profile.tuyaUid ? (
            <p className="text-sm text-muted-foreground">
              Link this profile to its Tuya app account first{admin ? " (Profiles page)" : " (ask the super admin)"}.
            </p>
          ) : tuyaError ? (
            <Alert variant="destructive">
              <AlertTitle>Couldn&apos;t reach Tuya</AlertTitle>
              <AlertDescription>{tuyaError}</AlertDescription>
            </Alert>
          ) : meters.length === 0 ? (
            <p className="text-sm text-muted-foreground">Add a meter to this profile first. Every device belongs to a meter.</p>
          ) : addable.length === 0 ? (
            <p className="text-sm text-muted-foreground">All energy-metering devices in this account are already tracked.</p>
          ) : (
            addable.map((t) => <AddDeviceForm key={t.id} profileId={profile.id} device={t} meters={meters} gridDevices={gridDevices} />)
          )}
          {unsupported.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Skipped (no energy meter): {unsupported.map((d) => d.name).join(", ")}
            </p>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

function AddDeviceForm({
  profileId,
  device,
  meters,
  gridDevices,
}: {
  profileId: string;
  device: TuyaDevice;
  meters: Meter[];
  gridDevices: Device[];
}) {
  const m = parseStatus(device.status);

  return (
    <ActionForm action={addDevice} className="grid gap-4 rounded-xl bg-muted/60 p-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
      <input type="hidden" name="profileId" value={profileId} />
      <input type="hidden" name="tuyaDeviceId" value={device.id} />
      <div className="text-sm sm:col-span-2 lg:col-span-4">
        <span className="font-medium">{device.name}</span>{" "}
        <span className="text-muted-foreground tabular-nums">
          · {device.online ? "online" : "offline"}
          {m.energyKwh !== null && ` · ${m.energyKwh.toFixed(2)} kWh`}
          {m.powerW !== null && ` · ${m.powerW} W now`}
          {m.voltageV !== null && ` · ${m.voltageV} V`}
        </span>
      </div>
      <PlacementFields
        idPrefix={device.id}
        name={device.name}
        source="grid"
        meterId={meters.length === 1 ? meters[0].id : ""}
        inverterInputDeviceId={null}
        meters={meters}
        gridDevices={gridDevices}
      />
      <div className="sm:col-span-2 lg:col-span-4">
        <SubmitButton>Track this device</SubmitButton>
      </div>
    </ActionForm>
  );
}

/** Name, type, meter and inverter input — shared by the add form and a tracked device's settings. */
function PlacementFields({
  idPrefix,
  name,
  source,
  meterId,
  inverterInputDeviceId,
  meters,
  gridDevices,
}: {
  idPrefix: string;
  name: string;
  source: "grid" | "solar";
  meterId: string;
  inverterInputDeviceId: string | null;
  meters: Meter[];
  gridDevices: Device[];
}) {
  const id = (field: string) => `${idPrefix}-${field}`;
  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor={id("name")}>Name</Label>
        <Input id={id("name")} name="name" defaultValue={name} required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={id("source")}>Type</Label>
        <NativeSelect id={id("source")} name="source" defaultValue={source}>
          <option value="grid">Grid (under a meter)</option>
          <option value="solar">Solar (inverter output)</option>
        </NativeSelect>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={id("meter")}>Meter (solar: tariff to value savings)</Label>
        <NativeSelect id={id("meter")} name="meterId" defaultValue={meterId}>
          {!meterId && <option value="">Pick a meter…</option>}
          {meters.map((mt) => (
            <option key={mt.id} value={mt.id}>
              {mt.label ? `${mt.label} (${mt.meterNo})` : mt.meterNo}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={id("input")}>Inverter input (solar only)</Label>
        <NativeSelect id={id("input")} name="inverterInputDeviceId" defaultValue={inverterInputDeviceId ?? ""}>
          <option value="">—</option>
          {gridDevices.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </NativeSelect>
      </div>
    </>
  );
}
