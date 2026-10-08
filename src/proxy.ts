import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Optimistic check only: real authorization happens in pages and Server Actions.
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Public: sign-in, auth API, Next assets, and the install files (manifest + icons) phones fetch signed-out.
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|icons/).*)"],
};
