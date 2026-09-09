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

export const URL_FETCH_MODES = ["production", "evaluator"] as const;
export type UrlFetchMode = (typeof URL_FETCH_MODES)[number];

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^0\.0\.0\.0$/,
  /^\[::1\]$/,
  /^::1$/,
  /^169\.254\./,
  /^metadata\.google\.internal$/i,
];

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
  const isPrivate = PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname));

  if (isPrivate && mode === "production") {
    issues.push({
      code: "PRIVATE_ADDRESS_BLOCKED",
      message: "Loopback and private addresses are blocked in production retrieval",
    });
  }

  return issues;
}

export function isUrlAllowed(rawUrl: string, mode: UrlFetchMode): boolean {
  return inspectUrlPolicy(rawUrl, mode).length === 0;
}
