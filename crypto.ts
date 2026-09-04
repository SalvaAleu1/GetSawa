import crypto from "crypto";

/**
 * Domain transfer auth codes (EPP codes) have to be stored somewhere between
 * checkout ("here's my auth code") and provisioning (which can happen
 * minutes later, after a PayPal redirect round-trip) — unlike a password,
 * we can't just hash it, because we need the original value back to hand to
 * NameSilo. So it's encrypted at rest with AES-256-GCM instead, using a key
 * derived from SESSION_SECRET, and only ever decrypted server-side at the
 * moment it's needed for the registrar API call.
 */

function getKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET must be set to encrypt/decrypt sensitive data.");
  return crypto.createHash("sha256").update(secret).digest(); // 32 bytes, fits AES-256
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(".");
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed encrypted payload.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return decrypted.toString("utf8");
}
