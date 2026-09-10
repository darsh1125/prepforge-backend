import { createHash } from "node:crypto";

export function createInputFingerprint(jd: string, companyUrl: string): string {
  const normalizedJd = jd.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").trim();
  const url = new URL(companyUrl.trim());
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname === "/") url.pathname = "";
  return createHash("sha256").update(`${normalizedJd}\n${url.toString()}`).digest("hex");
}
