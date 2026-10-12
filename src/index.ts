import { createServer } from "node:http";
import { randomSaying } from "./sayings.js";

const PORT = Number(process.env.PORT ?? 3000);

const server = createServer((req, res) => {
  // Match on the path only, so query strings like /?x=1 still route
  const path = new URL(`http://localhost${req.url ?? "/"}`).pathname;

  if (req.method === "GET" && (path === "/" || path === "/saying")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ saying: randomSaying() }));
    return;
  }

  if (req.method === "GET" && path === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
