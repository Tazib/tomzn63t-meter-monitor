import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { db, schema } from "@/db";
import { requireSuperAdmin } from "@/lib/session";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { NativeSelect } from "@/components/native-select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createUser, deleteUser, setUserPassword } from "../actions";

// Per-user data from the database on every request (see the (app) layout).
export const instant = false;

export default async function UsersPage() {
  const me = await requireSuperAdmin();
  const [users, profiles, memberships] = await Promise.all([
    db.select().from(schema.user).orderBy(schema.user.createdAt),
    db.select().from(schema.profiles).orderBy(schema.profiles.name),
    db
      .select({ userId: schema.profileMembers.userId, name: schema.profiles.name })
      .from(schema.profileMembers)
      .innerJoin(schema.profiles, eq(schema.profiles.id, schema.profileMembers.profileId)),
  ]);

  return (
    <div className="grid gap-6">
      <PageHeader title="Users" description="Everyone who can sign in. Only the super admin can create accounts." />

      <Card>
        <CardHeader>
          <CardTitle>Add user</CardTitle>
          <CardDescription>Share the password with the person directly. They can&apos;t sign up on their own.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={createUser} className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" minLength={8} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="role">Role</Label>
              <NativeSelect id="role" name="role" defaultValue="user">
                <option value="user">User</option>
                <option value="admin">Super Admin</option>
              </NativeSelect>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="profileId">Profile</Label>
              <NativeSelect id="profileId" name="profileId" defaultValue="">
                <option value="">— None —</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex items-end">
              <SubmitButton>Create user</SubmitButton>
            </div>
          </ActionForm>
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {users.map((u) => (
          <Card key={u.id} size="sm">
            <CardContent className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2 font-medium">
                  {u.name}
                  {u.role === "admin" && <Badge>Super Admin</Badge>}
                  {u.id === me.id && <Badge variant="outline">You</Badge>}
                </div>
                <div className="text-sm text-muted-foreground">{u.email}</div>
                <div className="text-sm text-muted-foreground">
                  Profiles:{" "}
                  {memberships
                    .filter((m) => m.userId === u.id)
                    .map((m) => m.name)
                    .join(", ") || "none"}
                </div>
              </div>
              <ActionForm action={setUserPassword} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="userId" value={u.id} />
                <Input name="password" type="password" placeholder="New password" minLength={8} required className="w-40" />
                <SubmitButton variant="outline" size="sm">
                  Set password
                </SubmitButton>
              </ActionForm>
              {u.id !== me.id && (
                <ActionForm action={deleteUser}>
                  <input type="hidden" name="userId" value={u.id} />
                  <SubmitButton variant="destructive" size="sm">
                    Delete
                  </SubmitButton>
                </ActionForm>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
