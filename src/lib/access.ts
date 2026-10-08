import "server-only";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

export async function hashSecret(secret: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(secret, salt, 64)) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}

export async function verifySecret(secret: string, stored: string | null) {
  if (!stored) return true;
  const [salt, expectedHex] = stored.split(":");
  if (!salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = (await scrypt(secret, salt, expected.length)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
