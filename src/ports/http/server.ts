import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";

export type HttpHandler = (req: IncomingMessage, res: ServerResponse, body: Buffer) => Promise<void>;

export interface HttpRoutes {
  webhook: HttpHandler;
  wake: HttpHandler;
}

export function buildHttpServer(routes: HttpRoutes): Server {
  return createServer((req, res) => {
    void handleRequest(req, res, routes);
  });
}

async function handleRequest(req: IncomingMessage, res: ServerResponse, routes: HttpRoutes): Promise<void> {
  const method = req.method ?? "";
  const path = (req.url ?? "").split("?")[0];

  const handler =
    method === "POST" && path === "/webhook/telegram"
      ? routes.webhook
      : method === "POST" && path === "/wake"
        ? routes.wake
        : null;

  if (!handler) {
    res.statusCode = 404;
    res.end();
    return;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const body = Buffer.concat(chunks);

  await handler(req, res, body);
}
