"use client";

import { ThemeProvider as NextThemes } from "next-themes";

/** Follows the device's light/dark setting unless the user picks one in the account menu. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}
