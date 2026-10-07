export type ActionResult = { ok: boolean; message: string };

export function errorMessage(e: unknown) {
  if (e && typeof e === "object" && "body" in e) {
    const body = (e as { body?: { message?: string } }).body;
    if (body?.message) return body.message;
  }
  if (e instanceof Error) return e.message;
  return "Something went wrong";
}
