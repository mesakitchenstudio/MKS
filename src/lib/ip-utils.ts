export function isPublicIp(ip: string) {
  if (isLoopback(ip)) return false;
  const normalized = ip.replace(/^::ffff:/, "");
  if (/^10\./.test(normalized)) return false;
  if (/^192\.168\./.test(normalized)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(normalized)) return false;
  if (/^169\.254\./.test(normalized)) return false;
  return true;
}

export function ipv4ToDecimal(ip: string) {
  const normalized = ip.replace(/^::ffff:/, "");
  const parts = normalized.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return null;
  }
  return parts.reduce((total, part) => (total << 8) + part, 0) >>> 0;
}

export function uniqueIps(values: string[]) {
  const seen = new Set<string>();
  const ips: string[] = [];
  for (const value of values) {
    const ip = value.trim();
    if (!ip || isLoopback(ip) || seen.has(ip)) continue;
    seen.add(ip);
    ips.push(ip);
  }
  return ips;
}

function isLoopback(ip: string) {
  return (
    !ip ||
    ip === "unknown" ||
    ip === "localhost" ||
    ip === "::1" ||
    ip === "127.0.0.1" ||
    ip === "::ffff:127.0.0.1"
  );
}
