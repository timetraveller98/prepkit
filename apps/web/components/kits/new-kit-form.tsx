"use client";

import { CalendarDays, FileUp, Globe, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ChangeEvent, type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/feedback";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/overlays";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiRequestError } from "@/lib/api";
import { type ParsedCase, parseCaseFile } from "@/lib/parse-cases";
import { useCreateKit, useCreateKitBatch } from "@/lib/queries";
import type { KitSummary } from "@/lib/types";

const DAY_PRESETS = [1, 3, 5, 7, 14];

export function NewKitForm() {
  return (
    <Tabs defaultValue="single" className="space-y-5">
      <TabsList>
        <TabsTrigger value="single">One role</TabsTrigger>
        <TabsTrigger value="batch">Several roles</TabsTrigger>
      </TabsList>
      <TabsContent value="single" keepMounted>
        <SingleKitForm />
      </TabsContent>
      <TabsContent value="batch" keepMounted>
        <BatchKitForm />
      </TabsContent>
    </Tabs>
  );
}

function SingleKitForm() {
  const router = useRouter();
  const createKit = useCreateKit();

  const [jobDescription, setJobDescription] = useState("");
  const [companyUrl, setCompanyUrl] = useState("");
  const [daysAvailable, setDaysAvailable] = useState(5);
  const [errors, setErrors] = useState<{ jobDescription?: string; companyUrl?: string }>({});
  const [duplicate, setDuplicate] = useState<KitSummary | null>(null);

  const submit = (event: FormEvent, force = false) => {
    event.preventDefault();

    const nextErrors: typeof errors = {};
    if (jobDescription.trim().length < 20) {
      nextErrors.jobDescription =
        "Paste a bit more of the posting so there is something to extract.";
    }
    if (companyUrl.trim().length < 3) nextErrors.companyUrl = "Add the company's website.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    createKit.mutate(
      { jobDescription, companyUrl, daysAvailable, force },
      {
        onSuccess: (result) => {
          if (result.duplicate) {
            setDuplicate(result.kit);
            return;
          }
          router.push(`/kits/${result.kit.id}`);
        },
        onError: (error) => toast.error(error.message),
      },
    );
  };

  return (
    <>
      <Card>
        <CardHeader
          title="Prepare for one role"
          description="Research starts as soon as you submit, and runs in the background."
        />
        <CardBody>
          <form onSubmit={(event) => submit(event)} className="space-y-5" noValidate>
            {createKit.error && !duplicate ? (
              <ErrorState
                title="Could not start the kit"
                message={
                  createKit.error instanceof ApiRequestError
                    ? createKit.error.message
                    : "Something went wrong."
                }
              />
            ) : null}

            <Field
              label="Job description"
              hint={`${jobDescription.trim().length} characters pasted. Paste the whole posting, including the bonus section.`}
              error={errors.jobDescription}
            >
              {(props) => (
                <Textarea
                  {...props}
                  rows={12}
                  value={jobDescription}
                  onChange={(event) => setJobDescription(event.target.value)}
                  placeholder={"Senior Backend Engineer\n\nWe are looking for..."}
                  className="font-mono text-small"
                />
              )}
            </Field>

            <Field
              label="Company website"
              hint="Just the homepage. The careers or hiring page is found by crawling from there."
              error={errors.companyUrl}
            >
              {(props) => (
                <div className="relative">
                  <Globe className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-faint" />
                  <Input
                    {...props}
                    value={companyUrl}
                    onChange={(event) => setCompanyUrl(event.target.value)}
                    placeholder="acme.com"
                    className="pl-8.5"
                    inputMode="url"
                  />
                </div>
              )}
            </Field>

            <Field label="Days until the interview">
              {(props) => (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    {...props}
                    type="number"
                    min={1}
                    max={90}
                    value={daysAvailable}
                    onChange={(event) => setDaysAvailable(Number(event.target.value) || 1)}
                    className="w-24"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {DAY_PRESETS.map((preset) => (
                      <Button
                        key={preset}
                        type="button"
                        size="sm"
                        variant={daysAvailable === preset ? "primary" : "secondary"}
                        onClick={() => setDaysAvailable(preset)}
                      >
                        {preset}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </Field>

            <div className="flex items-center gap-3 border-t border-line pt-4">
              <Button type="submit" variant="primary" size="lg" loading={createKit.isPending}>
                <CalendarDays className="size-4" />
                Build my kit
              </Button>
              <p className="text-tiny text-ink-faint">Usually ninety seconds to two minutes.</p>
            </div>
          </form>
        </CardBody>
      </Card>

      <Dialog open={duplicate !== null} onOpenChange={(open) => !open && setDuplicate(null)}>
        <DialogContent
          title="You already prepared this one"
          description="The same posting and company are already in your kits."
        >
          <p className="text-small text-ink-muted">{duplicate?.title}</p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button
              size="sm"
              onClick={(event) => {
                setDuplicate(null);
                submit(event, true);
              }}
            >
              Build it again anyway
            </Button>
            <DialogClose asChild>
              <Button
                size="sm"
                variant="primary"
                onClick={() => duplicate && router.push(`/kits/${duplicate.id}`)}
              >
                Open the existing kit
              </Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function BatchKitForm() {
  const router = useRouter();
  const createBatch = useCreateKitBatch();
  const [cases, setCases] = useState<ParsedCase[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");

  const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const contents = await file.text();
    const result = parseCaseFile(file.name, contents);
    setFileName(file.name);
    setCases(result.cases);
    setProblems(result.problems);
  };

  return (
    <Card>
      <CardHeader
        title="Prepare for several roles"
        description="Upload a JSON or CSV file of description and company pairs. Every row becomes its own kit."
      />
      <CardBody className="space-y-5">
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong px-6 py-10 text-center transition-colors hover:bg-sunken">
          <FileUp className="size-6 text-ink-faint" />
          <span className="text-small font-medium text-ink">
            {fileName || "Choose a .json or .csv file"}
          </span>
          <span className="max-w-md text-tiny leading-relaxed text-ink-faint">
            JSON: an array of objects with <code className="font-mono">jd</code>,{" "}
            <code className="font-mono">company_url</code> and{" "}
            <code className="font-mono">days</code>. CSV: one header row with the same column names.
          </span>
          <input
            type="file"
            accept=".json,.csv,text/csv,application/json"
            className="sr-only"
            onChange={readFile}
          />
        </label>

        {problems.length > 0 ? (
          <div className="rounded-xl border border-warning/40 bg-warning-soft/50 px-4 py-3">
            <p className="text-small font-medium text-warning">
              {problems.length} row{problems.length === 1 ? "" : "s"} skipped
            </p>
            <ul className="mt-1.5 space-y-0.5 text-tiny text-ink-muted">
              {problems.slice(0, 6).map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {cases.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-line">
            <table className="w-full text-left text-small">
              <thead className="bg-sunken text-tiny text-ink-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Company
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Posting
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Days
                  </th>
                </tr>
              </thead>
              <tbody>
                {cases.map((entry) => (
                  <tr
                    key={`${entry.companyUrl}-${entry.jobDescription.slice(0, 24)}`}
                    className="border-t border-line"
                  >
                    <td className="max-w-40 truncate px-3 py-2 text-ink">{entry.companyUrl}</td>
                    <td className="px-3 py-2 text-ink-muted">
                      {entry.jobDescription.slice(0, 60)}…
                    </td>
                    <td className="px-3 py-2">
                      <Badge>{entry.daysAvailable}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="flex items-center gap-3 border-t border-line pt-4">
          <Button
            variant="primary"
            size="lg"
            disabled={cases.length === 0}
            loading={createBatch.isPending}
            onClick={() =>
              createBatch.mutate(cases, {
                onSuccess: (result) => {
                  toast.success(
                    `${result.created.length} kit${result.created.length === 1 ? "" : "s"} queued`,
                  );
                  router.push("/kits");
                },
                onError: (error) => toast.error(error.message),
              })
            }
          >
            <Upload className="size-4" />
            Queue {cases.length || ""} kit{cases.length === 1 ? "" : "s"}
          </Button>
          <p className="text-tiny text-ink-faint">
            They generate a couple at a time to stay inside the free tier.
          </p>
        </div>
      </CardBody>
    </Card>
  );
}
