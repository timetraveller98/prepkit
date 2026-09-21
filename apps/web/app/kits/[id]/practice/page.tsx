import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { PracticeSession } from "@/components/practice/practice-session";

export const metadata: Metadata = { title: "Practice" };

export default async function PracticePage({ params }: PageProps<"/kits/[id]/practice">) {
  const { id } = await params;

  return (
    <AppShell>
      <PracticeSession kitId={id} />
    </AppShell>
  );
}
