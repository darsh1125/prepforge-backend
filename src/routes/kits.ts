import { Router } from "express";
import { createKit, deleteKit, extractKitRequirements, generateKitFlashcards, generateKitPipelineRequest, generateKitQuestions, generateKitSchedule, getKit, listKits, researchCompany, researchInterviewProcess, updateKit } from "../controllers/kitController.js";
import { requireAuth } from "../middleware/auth.js";

export const kitsRouter = Router();
kitsRouter.use(requireAuth);
kitsRouter.post("/", createKit);
kitsRouter.get("/", listKits);
kitsRouter.post("/:id/research/company", researchCompany);
kitsRouter.post("/:id/research/interview", researchInterviewProcess);
kitsRouter.post("/:id/extract", extractKitRequirements);
kitsRouter.post("/:id/generate/questions", generateKitQuestions);
kitsRouter.post("/:id/generate", generateKitPipelineRequest);
kitsRouter.post("/:id/generate/flashcards", generateKitFlashcards);
kitsRouter.post("/:id/generate/schedule", generateKitSchedule);
kitsRouter.get("/:id", getKit);
kitsRouter.patch("/:id", updateKit);
kitsRouter.delete("/:id", deleteKit);
