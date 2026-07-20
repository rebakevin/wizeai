import express, { type RequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env";
import { authHandler } from "./auth/routes";
import { apiRouter } from "./routes";
import { errorHandler } from "./middleware/errorHandler";
import { openApiDocument } from "./openapi";

// helmet's and Better Auth's node handlers are typed against plain
// node:http, which a newer @types/node doesn't structurally match
// Express 5's Request/Response closely enough for a direct assignment.
function asHandler(fn: unknown): RequestHandler {
  return fn as RequestHandler;
}

export const app = express();

app.use(asHandler(helmet()));
app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));

// Better Auth needs the raw (unparsed) request body, so its handler is
// mounted before express.json() runs.
app.all("/api/auth/*splat", asHandler(authHandler));

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Swagger UI injects an inline <script>, which the default CSP blocks.
app.use("/api/docs", asHandler(helmet({ contentSecurityPolicy: false })));
app.get("/api/openapi.json", (_req, res) => res.json(openApiDocument));
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));

app.use("/api", apiRouter);

app.use(errorHandler);
