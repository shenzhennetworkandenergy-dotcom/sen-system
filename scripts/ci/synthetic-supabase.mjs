import { createServer } from "node:http";

const host = "127.0.0.1";
const port = 19092;

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${host}:${port}`);
  const method = request.method ?? "UNKNOWN";

  process.stdout.write(`${method} ${url.pathname}\n`);
  response.setHeader("content-type", "application/json");
  response.setHeader("access-control-allow-origin", "*");

  if (method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return;
  }

  if (method !== "GET" && method !== "HEAD") {
    response.statusCode = 405;
    response.end(JSON.stringify({ message: "synthetic fixture is read-only" }));
    return;
  }

  if (url.pathname === "/health") {
    response.end(JSON.stringify({ status: "synthetic-only" }));
    return;
  }

  if (url.pathname.startsWith("/rest/v1/")) {
    response.setHeader("content-range", "0-0/0");
    response.end("[]");
    return;
  }

  if (url.pathname.startsWith("/auth/v1/")) {
    response.statusCode = 401;
    response.end(JSON.stringify({ message: "synthetic unauthenticated response" }));
    return;
  }

  response.statusCode = 404;
  response.end(JSON.stringify({ message: "synthetic endpoint not implemented" }));
});

const stop = () => {
  server.close(() => process.exit(0));
};

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

server.listen(port, host, () => {
  process.stdout.write(`synthetic service listening on ${host}:${port}\n`);
});
