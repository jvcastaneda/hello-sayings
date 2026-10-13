import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { deleteSaying, getSaying, listSayings, putSaying, randomSaying } from "./sayings.js";
import { httpRequestDuration, httpRequestsTotal, registry, sayingsMutationsTotal } from "./metrics.js";

const PORT = Number(process.env.PORT ?? 3000);
const MAX_BODY_BYTES = 10 * 1024;
const MAX_ID_LENGTH = 64;

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "Request body too large");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

function parseText(body: unknown): string {
  const text = (body as { text?: unknown } | null)?.text;
  if (typeof text !== "string" || text.trim() === "") {
    throw new HttpError(400, 'Body must be JSON like {"text": "..."}');
  }
  return text.trim();
}

// ctx.route is set to the matched route template and used as the metrics label
async function handle(req: IncomingMessage, res: ServerResponse, ctx: { route: string }) {
  // Match on the path only, so query strings like /?x=1 still route
  const path = new URL(`http://localhost${req.url ?? "/"}`).pathname;
  const method = req.method ?? "GET";

  if (path === "/health" && method === "GET") {
    ctx.route = "/health";
    sendJson(res, 200, { status: "ok" });
    return;
  }

  if (path === "/metrics" && method === "GET") {
    res.writeHead(200, { "Content-Type": registry.contentType });
    ctx.route = "/metrics";
    res.end(await registry.metrics());
    return;
  }

  if ((path === "/" || path === "/saying") && method === "GET") {
    ctx.route = path;
    const saying = randomSaying();
    if (!saying) throw new HttpError(404, "No sayings stored");
    sendJson(res, 200, { saying: saying.text, id: saying.id });
    return;
  }

  if (path === "/sayings") {
    ctx.route = "/sayings";
    if (method !== "GET") throw new HttpError(405, "Method not allowed");
    sendJson(res, 200, { sayings: listSayings() });
    return;
  }

  const match = /^\/sayings\/([^/]+)$/.exec(path);
  if (match) {
    ctx.route = "/sayings/:id";
    let id: string;
    try {
      id = decodeURIComponent(match[1]);
    } catch {
      throw new HttpError(400, "Malformed id");
    }
    if (id.length > MAX_ID_LENGTH) throw new HttpError(400, "id too long");

    if (method === "GET") {
      const saying = getSaying(id);
      if (!saying) throw new HttpError(404, "Saying not found");
      sendJson(res, 200, saying);
      return;
    }

    if (method === "PUT") {
      const text = parseText(await readJson(req));
      const created = putSaying(id, text);
      sayingsMutationsTotal.inc({ operation: created ? "create" : "update" });
      sendJson(res, created ? 201 : 200, { id, text });
      return;
    }

    if (method === "DELETE") {
      if (!deleteSaying(id)) throw new HttpError(404, "Saying not found");
      sayingsMutationsTotal.inc({ operation: "delete" });
      res.writeHead(204).end();
      return;
    }

    throw new HttpError(405, "Method not allowed");
  }

  // Unmatched paths share one label to keep cardinality bounded
  throw new HttpError(404, "Not found");
}

const server = createServer(async (req, res) => {
  const end = httpRequestDuration.startTimer();
  const ctx = { route: "unmatched" };
  try {
    await handle(req, res, ctx);
  } catch (err) {
    if (err instanceof HttpError) {
      sendJson(res, err.status, { error: err.message });
    } else {
      console.error(err);
      sendJson(res, 500, { error: "Internal server error" });
    }
  }
  const labels = { method: req.method ?? "GET", route: ctx.route, status: String(res.statusCode) };
  httpRequestsTotal.inc(labels);
  end(labels);
});

server.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
