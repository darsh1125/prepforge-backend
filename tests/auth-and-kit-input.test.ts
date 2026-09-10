import { describe, expect, it } from "vitest";
import { loginRequestSchema, registerRequestSchema } from "../src/schemas/auth.js";
import { kitInputSchema } from "../src/schemas/kitInput.js";
import { createInputFingerprint } from "../src/core/fingerprint.js";

describe("authentication request validation", () => {
  it("normalizes registration email and rejects short passwords", () => {
    expect(registerRequestSchema.parse({ email: "  USER@Example.com ", password: "password123" }).email).toBe("user@example.com");
    expect(registerRequestSchema.safeParse({ email: "user@example.com", password: "short" }).success).toBe(false);
  });

  it("accepts login email and rejects malformed email", () => {
    expect(loginRequestSchema.parse({ email: "USER@example.com", password: "secret" }).email).toBe("user@example.com");
    expect(loginRequestSchema.safeParse({ email: "not-an-email", password: "secret" }).success).toBe(false);
  });
});

describe("kit input validation", () => {
  const input = { jd: "Frontend Engineer\nReact experience required.", company_url: "https://example.com", days: 5 };
  it("accepts thin descriptions and boundary day counts", () => {
    expect(kitInputSchema.safeParse(input).success).toBe(true);
    expect(kitInputSchema.safeParse({ ...input, days: 1 }).success).toBe(true);
    expect(kitInputSchema.safeParse({ ...input, days: 60 }).success).toBe(true);
  });

  it("rejects empty descriptions, non-http URLs, and invalid days", () => {
    expect(kitInputSchema.safeParse({ ...input, jd: "" }).success).toBe(false);
    expect(kitInputSchema.safeParse({ ...input, company_url: "ftp://example.com" }).success).toBe(false);
    expect(kitInputSchema.safeParse({ ...input, days: 0 }).success).toBe(false);
    expect(kitInputSchema.safeParse({ ...input, days: 61 }).success).toBe(false);
    expect(kitInputSchema.safeParse({ ...input, days: 5.5 }).success).toBe(false);
  });

  it("creates a deterministic conservative fingerprint", () => {
    expect(createInputFingerprint("A  job\r\ndescription", "https://EXAMPLE.com/")).toBe(createInputFingerprint("A job\ndescription", "https://example.com"));
  });
});
