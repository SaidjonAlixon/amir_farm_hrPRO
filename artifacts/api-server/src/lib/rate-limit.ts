const hits = new Map<string, number[]>();

export function rateLimitAllow(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const prev = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (prev.length >= max) {
    hits.set(key, prev);
    return false;
  }
  prev.push(now);
  hits.set(key, prev);
  return true;
}

export function clientKey(req: { ip?: string; headers: { [k: string]: unknown }; socket?: { remoteAddress?: string } }): string {
  const xf = req.headers["x-forwarded-for"];
  const forwarded = typeof xf === "string" ? xf.split(",")[0]?.trim() : "";
  return forwarded || req.ip || req.socket?.remoteAddress || "unknown";
}
