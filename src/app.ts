import cors from "cors";
import express from "express";
import { loadEnv } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { routes } from "./routes/index.js";

export function createApp() {
  const env = loadEnv();
  const app = express();

  app.disable("x-powered-by");
  app.use(
    cors({
      origin: env.WEB_ORIGIN,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));

  app.use(routes);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
