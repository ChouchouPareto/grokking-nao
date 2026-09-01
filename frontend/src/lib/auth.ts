export const SESSION_COOKIE = "grokking_session";
const requestedSessionTtl = Number(process.env.INVITE_SESSION_TTL_SECONDS ?? 60 * 60);
export const SESSION_TTL_SECONDS = Number.isFinite(requestedSessionTtl)
  ? Math.min(Math.max(Math.floor(requestedSessionTtl), 5 * 60), 24 * 60 * 60)
  : 60 * 60;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
}

async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)),
    ),
  );
}

export async function inviteCodeMatches(input: string): Promise<boolean> {
  const codes = [
    ...(process.env.INVITE_CODES ?? "").split(","),
    process.env.INVITE_CODE ?? "",
  ]
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);
  const normalizedInput = input.trim().toUpperCase();
  if (!normalizedInput || codes.length === 0) return false;
  const left = await digest(normalizedInput);
  const candidateDigests = await Promise.all(codes.map(digest));
  return candidateDigests.some((right) => {
    let difference = 0;
    for (let index = 0; index < left.length; index += 1) {
      difference |= left[index] ^ right[index];
    }
    return difference === 0;
  });
}

export async function createSessionToken(): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured");
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `v1.${expiresAt}`;
  return `${payload}.${await hmac(payload, secret)}`;
}

export async function verifySessionToken(token?: string): Promise<boolean> {
  const secret = process.env.AUTH_SECRET;
  if (!secret || !token) return false;
  const [version, expiryText, signature, ...rest] = token.split(".");
  if (version !== "v1" || rest.length > 0 || !expiryText || !signature) return false;
  const expiresAt = Number(expiryText);
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false;
  const expected = await hmac(`${version}.${expiryText}`, secret);
  if (expected.length !== signature.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
  }
  return difference === 0;
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
};
