import "dotenv/config";
import { RPCHandler } from "@orpc/server/fetch";
import { createContext } from "./lib/context";
import { appRouter } from "./routers/index";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { createOpenAPIApp } from "./lib/openapi";

const app = new Hono();

app.use(logger());
app.use("/*", cors({
  origin: process.env.CORS_ORIGIN || "*",
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
}));

// OpenAPI app for VAD routes
const openAPIApp = createOpenAPIApp();

// Mount OpenAPI app
app.route("/", openAPIApp);

// RPC routes
const handler = new RPCHandler(appRouter);
app.use("/rpc/*", async (c, next) => {
  const context = await createContext({ context: c });
  const { matched, response } = await handler.handle(c.req.raw, {
    prefix: "/rpc",
    context: context,
  });

  if (matched) {
    return c.newResponse(response.body, response);
  }
  await next();
});

// Health check
app.get("/health", (c) => {
  return c.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    services: {
      vad: "operational",
      rpc: "operational"
    }
  });
});

import { serve } from "@hono/node-server";

const port = parseInt(process.env.PORT || "3000", 10);

serve({
  fetch: app.fetch,
  port: port,
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`);
  console.log(`VAD API endpoints: http://localhost:${info.port}/api/v1/vad`);
  console.log(`Mobile API endpoints: http://localhost:${info.port}/api/v1/mobile`);
  console.log(`Swagger UI: http://localhost:${info.port}/ui`);
  console.log(`OpenAPI spec: http://localhost:${info.port}/doc`);
});
