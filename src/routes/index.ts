import { Router } from "express";
import { healthRouter } from "./health.js";
import { authRouter } from "./auth.js";
import { kitsRouter } from "./kits.js";

export const routes = Router();

routes.use("/health", healthRouter);
routes.use("/api/auth", authRouter);
routes.use("/api/kits", kitsRouter);
