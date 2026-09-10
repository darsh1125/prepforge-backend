export function allocateMinutes(days: number, totalMinutes: number): number[] {
  const base = Math.floor(totalMinutes / days);
  const remainder = totalMinutes % days;
  return Array.from({ length: days }, (_, index) => base + (index < remainder ? 1 : 0));
}

export function totalStudyMinutes(days: number, questions: number, weightedWorkload: number): number {
  const minimum = days * 30;
  const maximum = days * 120;
  return Math.min(maximum, Math.max(minimum, questions === 0 ? minimum : weightedWorkload * 12));
}
