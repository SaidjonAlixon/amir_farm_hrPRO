import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { ensurePersistentSchema, ensureEmployeesOrgColumns } from "./lib/ensure-schema";

const app: Express = express();

/**
 * Schema ensure — eng yaxshi urinish.
 * Vercel’da loginni bloklamaydi: fon rejimida ishlaydi (pool 1 ta ulanishni ushlab qolmasin).
 */
if (process.env.VERCEL === "1" || process.env.VERCEL === "true") {
  void ensureEmployeesOrgColumns().catch((err) => {
    logger.error({ err }, "Critical columns ensure failed (non-blocking)");
  });
} else {
  void ensurePersistentSchema().catch((err) => {
    logger.error({ err }, "Schema ensure failed (non-blocking)");
  });
}

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

app.use("/api", router);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "Unhandled API error");
  if (res.headersSent) return;
  const message =
    err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "ETIMEDOUT"
      ? "Baza bilan aloqa yo‘q — birozdan keyin qayta urinib ko‘ring"
      : "Server xatosi";
  res.status(503).json({ error: message });
});

export default app;
