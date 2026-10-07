"use client";

import { createContext, startTransition, use, useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";

type Props = {
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
};

const PendingContext = createContext(false);

/** A form bound to a Server Action that shows the action's success or error message. */
export function ActionForm({ action, children, className, resetOnSuccess = true }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  // Submit through onSubmit rather than `action` so React doesn't clear the inputs when the
  // server returns a validation error; we reset ourselves only on success.
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => formAction(data));
  }

  return (
    <form ref={ref} onSubmit={onSubmit} className={className}>
      <PendingContext value={pending}>{children}</PendingContext>
      {state && (
        <p className={state.ok ? "text-sm text-emerald-600" : "text-sm text-destructive"} role="status">
          {state.message}
        </p>
      )}
    </form>
  );
}

export function SubmitButton({
  children,
  variant,
  size,
}: {
  children: React.ReactNode;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
}) {
  const pending = use(PendingContext);
  return (
    <Button type="submit" disabled={pending} variant={variant} size={size}>
      {pending ? "Saving…" : children}
    </Button>
  );
}
