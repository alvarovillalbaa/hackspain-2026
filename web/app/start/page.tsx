import type { Metadata } from "next";
import { StartPage } from "@/components/xray/start-page";

export const metadata: Metadata = {
  title: "Start — X Ray",
  robots: { index: false, follow: false },
};

/** Hidden operator route: pick the shared demo group. Not linked from AppShell. */
export default function StartRoute() {
  return <StartPage />;
}
