import crypto from "crypto";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function randomBase32(bytes = 20): string {
  const input = crypto.randomBytes(bytes);
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31] ?? "";
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31] ?? "";
  return output;
}

function base32Decode(value: string): Buffer {
  const normalized = value.replace(/=+$/g, "").replace(/\s+/g, "").toUpperCase();
  let bits = 0;
  let buffer = 0;
  const out: number[] = [];
  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) throw new Error("Invalid MFA secret.");
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function hotp(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const data = Buffer.alloc(8);
  data.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac("sha1", key).update(data).digest();
  const lastByte = digest[digest.length - 1];
  if (lastByte === undefined) throw new Error("Invalid MFA digest.");
  const offset = lastByte & 0x0f;
  const b0 = digest[offset];
  const b1 = digest[offset + 1];
  const b2 = digest[offset + 2];
  const b3 = digest[offset + 3];
  if (b0 === undefined || b1 === undefined || b2 === undefined || b3 === undefined) {
    throw new Error("Invalid MFA digest.");
  }
  const code = ((b0 & 0x7f) << 24) |
    ((b1 & 0xff) << 16) |
    ((b2 & 0xff) << 8) |
    (b3 & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

export function generateTotpSecret(): string {
  return randomBase32(20);
}

export function verifyTotp(secret: string, token: string, at = Date.now()): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  const counter = Math.floor(at / 1000 / 30);
  for (let drift = -1; drift <= 1; drift += 1) {
    if (hotp(secret, counter + drift) === token) return true;
  }
  return false;
}

export function encryptTotpSecret(secret: string): string {
  return encryptSecret(secret);
}

export function decryptTotpSecret(secret: string): string {
  return decryptSecret(secret);
}

export function buildOtpAuthUri(secret: string, email: string): string {
  const issuer = encodeURIComponent(process.env.APP_NAME || "GetSawa");
  const account = encodeURIComponent(email);
  return `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}
