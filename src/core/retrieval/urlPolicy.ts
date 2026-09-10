/**
 * URL retrieval security boundary.
 *
 * Production web requests must reject dangerous private/loopback targets
 * (SSRF prevention). The CLI evaluator may fetch evaluator-provided
 * localhost fixtures such as http://localhost:8099/acme/.
 *
 * Do not add a global "disable SSRF protection" flag. Use a narrow
 * execution mode only for the evaluator path.
 */

import dns from "node:dns/promises";
import net from "node:net";

export const URL_FETCH_MODES = ["production", "evaluator"] as const;
export type UrlFetchMode = (typeof URL_FETCH_MODES)[number];

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^169\.254\./,
  /^metadata\.google\.internal$/i,
];

function isPrivateIp(value: string): boolean {
  if (net.isIPv4(value)) {
    const octets = value.split(".").map(Number);
    const first = octets[0] ?? -1;
    const second = octets[1] ?? -1;
    return first === 0 || first === 10 || first === 127 || first === 169 && second === 254 || first === 192 && second === 168 || first === 172 && second >= 16 && second <= 31;
  }
  if (net.isIPv6(value)) {
    const normalized = value.toLowerCase();
    return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb");
  }
  return false;
}

export type UrlPolicyIssue = {
  code: string;
  message: string;
};

export function inspectUrlPolicy(rawUrl: string, mode: UrlFetchMode): UrlPolicyIssue[] {
  const issues: UrlPolicyIssue[] = [];
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    return [{ code: "INVALID_URL", message: "URL could not be parsed" }];
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    issues.push({
      code: "UNSUPPORTED_PROTOCOL",
      message: "Only HTTP and HTTPS URLs are allowed",
    });
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  const isPrivate = PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname)) || isPrivateIp(hostname);

  if (isPrivate && mode === "production") {
    issues.push({
      code: "PRIVATE_ADDRESS_BLOCKED",
      message: "Loopback and private addresses are blocked in production retrieval",
    });
  }

  return issues;
}

export async function inspectResolvedUrlPolicy(rawUrl: string, mode: UrlFetchMode): Promise<UrlPolicyIssue[]> {
  const issues = inspectUrlPolicy(rawUrl, mode);
  if (issues.length > 0 || mode === "evaluator") return issues;
  const parsed = new URL(rawUrl);
  if (net.isIP(parsed.hostname)) return issues;
  try {
    const addresses = await dns.lookup(parsed.hostname, { all: true });
    if (addresses.some((address) => isPrivateIp(address.address))) {
      issues.push({ code: "PRIVATE_ADDRESS_BLOCKED", message: "Hostname resolves to a private or local address" });
    }
  } catch {
    issues.push({ code: "DNS_LOOKUP_FAILED", message: "Hostname could not be resolved" });
  }
  return issues;
}

export function isUrlAllowed(rawUrl: string, mode: UrlFetchMode): boolean {
  return inspectUrlPolicy(rawUrl, mode).length === 0;
}
