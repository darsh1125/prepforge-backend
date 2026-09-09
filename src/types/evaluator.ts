import type { InterviewKit } from "./kit.js";

/** Future CLI input: npm run evaluate -- --input <cases.json> */
export type EvaluatorCase = {
  id: string;
  jd: string;
  company_url: string;
  days: number;
};

export type EvaluatorKitResult = {
  id: string;
  status: "ok" | "error";
  kit: InterviewKit | null;
  error: { code: string; message: string } | null;
};

/** Future CLI output shape. Do not emit this until generation exists. */
export type EvaluatorOutput = {
  version: "1.0";
  generated_at: string;
  kits: EvaluatorKitResult[];
};
