import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { db, schema } from "@/db";
import { requireSuperAdmin } from "@/lib/session";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { NativeSelect } from "@/components/native-select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addMember, createProfile, deleteProfile, removeMember, updateProfile } from "../actions";

// Per-user data from the database on every request (see the (app) layout).
export const instant = false;

export default async function ProfilesPage() {
  await requireSuperAdmin();
  const [profiles, users, memberships] = await Promise.all([
    db.select().from(schema.profiles).orderBy(schema.profiles.name),
    db.select({ id: schema.user.id, name: schema.user.name, email: schema.user.email }).from(schema.user),
    db
      .select({
        profileId: schema.profileMembers.profileId,
        userId: schema.user.id,
        name: schema.user.name,
        email: schema.user.email,
      })
      .from(schema.profileMembers)
      .innerJoin(schema.user, eq(schema.user.id, schema.profileMembers.userId)),
  ]);

  return (
    <div className="grid gap-6">
      <PageHeader title="Profiles" description="Households, the Smart Life account each one uses, and who can see it." />

      <Card>
        <CardHeader>
          <CardTitle>Add profile</CardTitle>
          <CardDescription>
            A profile is one household or place. Link it to the Smart Life account that owns its devices. The UID is
            on the Tuya developer site under Cloud → your project → Devices → Link App Account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={createProfile} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="grid gap-2">
              <Label htmlFor="new-name">Name</Label>
              <Input id="new-name" name="name" placeholder="e.g. Home" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-uid">Tuya app account UID</Label>
              <Input id="new-uid" name="tuyaUid" placeholder="Optional for now" />
            </div>
            <SubmitButton>Create profile</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>

      {profiles.map((p) => {
        const members = memberships.filter((m) => m.profileId === p.id);
        const others = users.filter((u) => !members.some((m) => m.userId === u.id));
        return (
          <Card key={p.id}>
            <CardHeader>
              <CardTitle>{p.name}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6">
              <ActionForm
                action={updateProfile}
                resetOnSuccess={false}
                className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
              >
                <input type="hidden" name="profileId" value={p.id} />
                <div className="grid gap-2">
                  <Label htmlFor={`name-${p.id}`}>Name</Label>
                  <Input id={`name-${p.id}`} name="name" defaultValue={p.name} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`uid-${p.id}`}>Tuya app account UID</Label>
                  <Input id={`uid-${p.id}`} name="tuyaUid" defaultValue={p.tuyaUid ?? ""} />
                </div>
                <SubmitButton variant="outline">Save</SubmitButton>
              </ActionForm>

              <div className="grid gap-2">
                <h3 className="text-sm font-medium">Members</h3>
                {members.length === 0 && <p className="text-sm text-muted-foreground">No members yet.</p>}
                {members.map((m) => (
                  <ActionForm key={m.userId} action={removeMember} className="flex items-center gap-3 text-sm">
                    <input type="hidden" name="profileId" value={p.id} />
                    <input type="hidden" name="userId" value={m.userId} />
                    <span>
                      {m.name} <span className="text-muted-foreground">({m.email})</span>
                    </span>
                    <SubmitButton variant="ghost" size="sm">
                      Remove
                    </SubmitButton>
                  </ActionForm>
                ))}
                {others.length > 0 && (
                  <ActionForm action={addMember} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="profileId" value={p.id} />
                    <NativeSelect name="userId" defaultValue="" className="w-64">
                      <option value="">Add a user…</option>
                      {others.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.email})
                        </option>
                      ))}
                    </NativeSelect>
                    <SubmitButton variant="outline" size="sm">
                      Add
                    </SubmitButton>
                  </ActionForm>
                )}
              </div>

              <ActionForm action={deleteProfile}>
                <input type="hidden" name="profileId" value={p.id} />
                <SubmitButton variant="destructive" size="sm">
                  Delete profile
                </SubmitButton>
              </ActionForm>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
