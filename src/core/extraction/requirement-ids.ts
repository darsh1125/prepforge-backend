import type { ExtractedRole, NormalizedRole } from "./types.js";

export function assignRequirementIds(role: ExtractedRole): NormalizedRole {
  return { ...role, requirements: role.requirements.map((requirement, index) => ({ id: `r${index + 1}`, ...requirement })) };
}
