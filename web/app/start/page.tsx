import type { Metadata } from "next";
import { StartPage } from "@/components/xray/start-page";
import { AppShell } from "@/components/xray/app-shell";

export const metadata: Metadata = {
  title: "Start — X Ray",
  robots: { index: false, follow: false },
};

/** Hidden operator route: pin the Blob focus group. Not linked from AppShell. */
export default function StartRoute() {
  return (
    <AppShell crumbs={[{ label: "Start" }]}>
      <StartPage />
    </AppShell>
  );
}
