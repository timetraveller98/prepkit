import { resolve } from "node:path";
import { createFixtureServer, listen } from "../src/dev/fixture-server.ts";

const root = resolve(import.meta.dirname, "../test/fixtures/sites");
const port = Number.parseInt(process.env.FIXTURE_PORT ?? "8099", 10);

const bound = await listen(createFixtureServer(root), port);

process.stdout.write(`fixture sites on http://localhost:${bound}\n`);
process.stdout.write(`  /acme/       company with a hiring page buried in a handbook\n`);
process.stdout.write(`  /northwind/  company with no hiring page at all\n`);
process.stdout.write(`  /missing/    always 404\n`);
