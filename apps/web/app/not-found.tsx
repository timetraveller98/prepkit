import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-3 px-4 py-24 text-center">
      <p className="text-sm font-medium text-ink">That page does not exist</p>
      <p className="text-[13px] text-ink-muted">
        The kit may have been deleted, or the link may be wrong.
      </p>
      <Button asChild variant="primary" className="mt-2">
        <Link href="/kits">Back to your kits</Link>
      </Button>
    </div>
  );
}
