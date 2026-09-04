import { describe, expect, it } from "vitest";
import { buildOtpAuthUri, generateTotpSecret, verifyTotp } from "@/lib/mfa";

describe("MFA/TOTP", () => {
  it("generates a valid base32 secret and otpauth URI", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(buildOtpAuthUri(secret, "owner@example.com")).toContain(`secret=${secret}`);
  });

  it("rejects malformed or invalid codes", () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, "12345")).toBe(false);
    expect(verifyTotp(secret, "000000", Date.now())).toBe(false);
  });
});
