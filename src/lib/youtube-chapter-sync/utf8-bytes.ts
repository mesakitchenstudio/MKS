/** UTF-8 byte length for YouTube description limits (not JS string length). */
export function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

export const YOUTUBE_DESCRIPTION_BYTE_LIMIT = 5000;
