export interface ParsedCase {
  jobDescription: string;
  companyUrl: string;
  daysAvailable: number;
}

export interface ParseResult {
  cases: ParsedCase[];
  problems: string[];
}

const DEFAULT_DAYS = 5;

export function parseCaseFile(fileName: string, contents: string): ParseResult {
  const trimmed = contents.trim();
  if (trimmed.length === 0) return { cases: [], problems: ["The file is empty."] };

  const looksJson = fileName.toLowerCase().endsWith(".json") || trimmed.startsWith("[");
  return looksJson ? parseJsonCases(trimmed) : parseCsvCases(trimmed);
}

function parseJsonCases(contents: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    return { cases: [], problems: ["That file is not valid JSON."] };
  }

  if (!Array.isArray(parsed)) {
    return { cases: [], problems: ["Expected a JSON array of cases."] };
  }

  const cases: ParsedCase[] = [];
  const problems: string[] = [];

  parsed.forEach((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      problems.push(`Row ${index + 1} is not an object.`);
      return;
    }
    const row = entry as Record<string, unknown>;
    const jobDescription = firstString(row.jd, row.job_description, row.jobDescription);
    const companyUrl = firstString(row.company_url, row.companyUrl, row.company);
    const days = Number(row.days ?? row.daysAvailable ?? DEFAULT_DAYS);

    const problem = validate(jobDescription, companyUrl, index + 1);
    if (problem) {
      problems.push(problem);
      return;
    }

    cases.push({
      jobDescription,
      companyUrl,
      daysAvailable: Number.isFinite(days) ? clampDays(days) : DEFAULT_DAYS,
    });
  });

  return { cases, problems };
}

function parseCsvCases(contents: string): ParseResult {
  const rows = parseCsv(contents);
  if (rows.length === 0) return { cases: [], problems: ["No rows found."] };

  const header = (rows[0] ?? []).map((cell) => cell.trim().toLowerCase());
  const jdIndex = findColumn(header, ["jd", "job_description", "jobdescription", "description"]);
  const urlIndex = findColumn(header, ["company_url", "companyurl", "url", "website", "company"]);
  const daysIndex = findColumn(header, ["days", "days_available", "daysavailable"]);

  if (jdIndex === -1 || urlIndex === -1) {
    return {
      cases: [],
      problems: ["The CSV needs a job description column and a company url column."],
    };
  }

  const cases: ParsedCase[] = [];
  const problems: string[] = [];

  rows.slice(1).forEach((row, index) => {
    const jobDescription = (row[jdIndex] ?? "").trim();
    const companyUrl = (row[urlIndex] ?? "").trim();
    if (jobDescription === "" && companyUrl === "") return;

    const problem = validate(jobDescription, companyUrl, index + 2);
    if (problem) {
      problems.push(problem);
      return;
    }

    const days = daysIndex === -1 ? DEFAULT_DAYS : Number((row[daysIndex] ?? "").trim());
    cases.push({
      jobDescription,
      companyUrl,
      daysAvailable: Number.isFinite(days) && days > 0 ? clampDays(days) : DEFAULT_DAYS,
    });
  });

  return { cases, problems };
}

export function parseCsv(contents: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < contents.length; index += 1) {
    const character = contents[index];

    if (quoted) {
      if (character === '"') {
        if (contents[index + 1] === '"') {
          value += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        value += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(value);
      value = "";
    } else if (character === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else if (character !== "\r") {
      value += character;
    }
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  return rows.filter((entry) => entry.some((cell) => cell.trim().length > 0));
}

function validate(jobDescription: string, companyUrl: string, rowNumber: number): string | null {
  if (jobDescription.trim().length < 20) {
    return `Row ${rowNumber}: the job description is too short to work from.`;
  }
  if (companyUrl.trim().length < 3) return `Row ${rowNumber}: missing a company website.`;
  return null;
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return "";
}

function findColumn(header: string[], names: string[]): number {
  return header.findIndex((column) => names.includes(column));
}

function clampDays(days: number): number {
  return Math.min(90, Math.max(1, Math.round(days)));
}
