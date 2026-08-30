import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

export type SealedSecret = {
  ciphertext: string;
  iv: string;
  authTag: string;
};

function encryptionKey(): Buffer {
  const secret = process.env.ADMIN_SECRET?.trim();
  if (!secret) {
    throw new Error("ADMIN_SECRET is not set");
  }
  return createHash("sha256").update(`mesa-yt-analytics:${secret}`).digest();
}

/** Encrypt a refresh token for DB storage (AES-256-GCM). */
export function sealSecret(plaintext: string): SealedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

/** Decrypt a sealed refresh token. Never log the result. */
export function openSecret(sealed: SealedSecret): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(sealed.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(sealed.authTag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
