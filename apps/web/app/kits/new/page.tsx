import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { NewKitForm } from "@/components/kits/new-kit-form";

export const metadata: Metadata = { title: "New kit" };

export default function NewKitPage() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl">
        <Link
          href="/kits"
          className="mb-4 inline-flex items-center gap-1 text-[13px] text-ink-muted hover:text-ink"
        >
          <ChevronLeft className="size-3.5" />
          Back to your kits
        </Link>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Prepare for a role</h1>
        <p className="mt-1 mb-6 text-[13px] text-ink-muted">
          The posting is pasted here. Everything about the company is researched from their website.
        </p>
        <NewKitForm />
      </div>
    </AppShell>
  );
}
