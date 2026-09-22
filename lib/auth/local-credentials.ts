import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const keyLength = 64;

export async function hashPassword(password: string) {
  if (password.length < 12) throw new Error("Password must contain at least 12 characters.");
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, keyLength) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, encoded: string) {
  try {
    const [algorithm, saltText, hashText, extra] = encoded.split("$");
    if (algorithm !== "scrypt" || !saltText || !hashText || extra !== undefined) return false;
    const expected = Buffer.from(hashText, "base64url");
    if (expected.length !== keyLength) return false;
    const actual = await scrypt(password, Buffer.from(saltText, "base64url"), keyLength) as Buffer;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
