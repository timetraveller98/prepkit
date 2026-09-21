import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { KitList } from "@/components/kits/kit-list";

export const metadata: Metadata = { title: "Your kits" };

export default function KitsPage() {
  return (
    <AppShell>
      <KitList />
    </AppShell>
  );
}
