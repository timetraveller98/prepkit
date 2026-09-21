import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { KitList, KitListHeader } from "@/components/kits/kit-list";

export const metadata: Metadata = { title: "Your kits" };

export default function KitsPage() {
  return (
    <AppShell>
      <KitListHeader />
      <KitList />
    </AppShell>
  );
}
