import mongoose, { type HydratedDocument } from "mongoose";
import type { Request, Response } from "express";
import { Kit, type KitDocument } from "../models/Kit.js";
import { PracticeState } from "../models/PracticeState.js";
import { AppError } from "../core/errors/appError.js";
import { normalizeMetadata } from "../core/builder/state.js";
import { practiceStats, sortPracticeCards, type PracticeCard, type PracticeState as PracticeStateValue } from "../core/practice/index.js";
import { confidenceUpdateSchema } from "../schemas/practice.js";
import { flashcardSchema } from "../schemas/kit.js";

type KitRecordDocument = HydratedDocument<KitDocument>;
function owner(req: Request): string { if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required", 401, { expose: true }); return req.auth.userId; }
function kitId(req: Request): string { if (typeof req.params.id !== "string" || !mongoose.isValidObjectId(req.params.id)) throw new AppError("NOT_FOUND", "Kit not found", 404, { expose: true }); return req.params.id; }
async function owned(req: Request): Promise<KitRecordDocument> { const record = await Kit.findOne({ _id: kitId(req), ownerId: owner(req) }); if (!record) throw new AppError("NOT_FOUND", "Kit not found", 404, { expose: true }); return record; }

async function cardsFor(record: KitRecordDocument): Promise<{ cards: PracticeCard[]; order: { card: PracticeCard; internalId: string; order: number }[] }> {
  const cards = flashcardSchema.array().parse(record.flashcards ?? []); const metadata = normalizeMetadata(cards, record.flashcardMetadata, "f");
  if (!record.flashcardMetadata || record.flashcardMetadata.length !== metadata.length) { record.set("flashcardMetadata", metadata); await record.save(); }
  const states = await PracticeState.find({ kitId: record._id, ownerId: record.ownerId });
  const stateMap = new Map(states.map((state) => [state.flashcardInternalId, state]));
  const practiceCards = cards.map((card) => { const meta = metadata.find((entry) => entry.id === card.id)!; const state = stateMap.get(meta.internalId); return { ...card, internalId: meta.internalId, confidence: (state?.confidence ?? null) as 1 | 2 | 3 | null, practiceCount: state?.practiceCount ?? 0, lastPracticedAt: state?.lastPracticedAt?.toISOString() ?? null }; });
  return { cards: practiceCards, order: practiceCards.map((card, index) => ({ card, internalId: card.internalId, order: metadata.find((entry) => entry.internalId === card.internalId)?.order ?? index })) };
}

export async function getPracticeSession(req: Request, res: Response): Promise<void> {
  const record = await owned(req); const { cards, order } = await cardsFor(record); const states: PracticeStateValue[] = cards.map((card) => ({ flashcardInternalId: card.internalId, confidence: card.confidence, practiceCount: card.practiceCount, lastPracticedAt: card.lastPracticedAt }));
  const orderedIds = sortPracticeCards(order, states); const byId = new Map(cards.map((card) => [card.internalId, card]));
  res.json({ cards: orderedIds.map((internalId) => byId.get(internalId)!), stats: practiceStats(cards) });
}

export async function updatePracticeConfidence(req: Request, res: Response): Promise<void> {
  const record = await owned(req); const internalId = req.params.flashcardInternalId; if (typeof internalId !== "string" || internalId.length === 0) throw new AppError("NOT_FOUND", "Flashcard not found", 404, { expose: true });
  const { cards } = await cardsFor(record); if (!cards.some((card) => card.internalId === internalId)) throw new AppError("NOT_FOUND", "Flashcard not found", 404, { expose: true });
  const { confidence } = confidenceUpdateSchema.parse(req.body);
  const state = await PracticeState.findOneAndUpdate({ kitId: record._id, ownerId: record.ownerId, flashcardInternalId: internalId }, { $set: { confidence, lastPracticedAt: new Date() }, $inc: { practiceCount: 1 } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  if (!state) throw new AppError("PRACTICE_STATE_UPDATE_FAILED", "Could not save practice confidence", 500);
  res.json({ practice: { flashcardInternalId: state.flashcardInternalId, confidence: state.confidence, practiceCount: state.practiceCount, lastPracticedAt: state.lastPracticedAt?.toISOString() ?? null } });
}
