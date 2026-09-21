import { readFile, stat } from "node:fs/promises";
import type { Server } from "node:http";
import { createServer } from "node:http";
import { join, normalize, resolve } from "node:path";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

export function createFixtureServer(rootDirectory: string): Server {
  const root = resolve(rootDirectory);

  return createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://fixtures.local");
    const safePath = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");

    if (safePath === "/" || safePath === "") {
      response.writeHead(200, { "content-type": CONTENT_TYPES[".html"] as string });
      response.end(
        "<!doctype html><html><body><ul><li><a href='/acme/'>acme</a></li><li><a href='/northwind/'>northwind</a></li></ul></body></html>",
      );
      return;
    }

    for (const candidate of [join(root, safePath), join(root, safePath, "index.html")]) {
      if (!candidate.startsWith(root)) break;
      try {
        const stats = await stat(candidate);
        if (!stats.isFile()) continue;
        const extension = candidate.slice(candidate.lastIndexOf("."));
        response.writeHead(200, {
          "content-type": CONTENT_TYPES[extension] ?? (CONTENT_TYPES[".html"] as string),
        });
        response.end(await readFile(candidate));
        return;
      } catch {}
    }

    response.writeHead(404, { "content-type": CONTENT_TYPES[".html"] as string });
    response.end("<!doctype html><html><body><h1>404</h1></body></html>");
  });
}

export function listen(server: Server, port: number): Promise<number> {
  return new Promise((resolvePort, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("fixture server did not bind to a port"));
        return;
      }
      resolvePort(address.port);
    });
  });
}
