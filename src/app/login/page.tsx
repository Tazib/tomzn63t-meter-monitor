"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    setPending(false);
    if (error) {
      setError(error.message ?? "Sign in failed");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="rise grid w-full max-w-sm gap-8">
        <div className="grid justify-items-center gap-4 text-center">
          <BrandMark className="size-12" />
          <div className="grid gap-1">
            <h1 className="text-2xl font-semibold tracking-[-0.025em]">Energy Tracker</h1>
            <p className="text-sm text-muted-foreground">Live usage, bills and solar savings for your home.</p>
          </div>
        </div>
        <form onSubmit={onSubmit} className="grid gap-4 rounded-3xl bg-card p-6 ring-1 ring-foreground/[0.07] sm:p-7">
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required className="h-10" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-10" />
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={pending} className="mt-1 h-10">
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </main>
  );
}
