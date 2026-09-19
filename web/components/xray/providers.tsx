"use client";

import { ThemeProvider } from "@/components/xray/theme-provider";
import { Toaster } from "@/components/ui/toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      forcedTheme="light"
      enableSystem={false}
    >
      <Toaster>{children}</Toaster>
    </ThemeProvider>
  );
}
