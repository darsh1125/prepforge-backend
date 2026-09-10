import { Router } from "express";
import { createKit, deleteKit, getKit, listKits, updateKit } from "../controllers/kitController.js";
import { requireAuth } from "../middleware/auth.js";

export const kitsRouter = Router();
kitsRouter.use(requireAuth);
kitsRouter.post("/", createKit);
kitsRouter.get("/", listKits);
kitsRouter.get("/:id", getKit);
kitsRouter.patch("/:id", updateKit);
kitsRouter.delete("/:id", deleteKit);
