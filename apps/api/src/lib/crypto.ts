const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function randomId(): string {
  return crypto.randomUUID();
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return toHex(digest);
}

export async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return toBase64Url(new Uint8Array(digest));
}

export async function hmacSha256(key: BufferSource, data: BufferSource): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", cryptoKey, data);
}

export async function hmacHex(key: BufferSource, data: BufferSource): Promise<string> {
  return toHex(await hmacSha256(key, data));
}

export function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

async function aesKey(material: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(material));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptString(plain: string, material: string): Promise<string> {
  const iv = randomBytes(12);
  const key = await aesKey(material);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(plain));
  return `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
}

export async function decryptString(payload: string, material: string): Promise<string> {
  const [ivPart, dataPart] = payload.split(".");
  if (!ivPart || !dataPart) throw new Error("Malformed encrypted payload");
  const key = await aesKey(material);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(ivPart) },
    key,
    fromBase64Url(dataPart)
  );
  return decoder.decode(plain);
}

export function normalizeText(value: string | null | undefined, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, maxLength);
}

export function normalizeMultiline(value: string | null | undefined, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!cleaned) return null;
  return cleaned.slice(0, maxLength);
}
