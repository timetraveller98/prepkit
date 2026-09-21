import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { KitWorkspace } from "@/components/kits/kit-workspace";
import { Skeleton } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Kit" };

export default async function KitPage({ params }: PageProps<"/kits/[id]">) {
  const { id } = await params;

  return (
    <AppShell>
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <KitWorkspace kitId={id} />
      </Suspense>
    </AppShell>
  );
}
