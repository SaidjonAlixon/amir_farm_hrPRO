import type { Request } from "express";

function hostnameFromUrlOrHost(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (!s) return "";
  try {
    if (s.includes("://")) return new URL(s).hostname;
  } catch {
    /* ignore */
  }
  if (s.startsWith("[")) {
    const end = s.indexOf("]");
    return end > 0 ? s.slice(1, end) : s;
  }
  return s.replace(/:\d+$/, "");
}

function originFromUrl(raw: string): string {
  try {
    if (raw.includes("://")) return new URL(raw).origin;
  } catch {
    /* ignore */
  }
  return "";
}

function isLoopbackIp(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "::1" || hostname === "0.0.0.0";
}

/** IPv4 / IPv6 — WebAuthn RP ID sifatida yaroqsiz. */
export function isIpHostname(hostname: string): boolean {
  if (!hostname || hostname === "localhost") return false;
  if (hostname.includes(":")) return true;
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname);
}

export function rpFromRequest(req: Request): { rpID: string; origin: string; rpName: string } {
  const originHeader = String(req.headers.origin || "").trim();
  const referer = String(req.headers.referer || "").trim();
  const forwarded = String(req.headers["x-forwarded-host"] || "").split(",")[0].trim();
  const hostHeader = forwarded || String(req.headers.host || "localhost");

  const originHost = hostnameFromUrlOrHost(originHeader);
  const refererHost = hostnameFromUrlOrHost(referer);
  const proxyHost = hostnameFromUrlOrHost(hostHeader);

  // Brauzer domeni — Vite proxy Host: 127.0.0.1:8080 ni e'tiborsiz qoldirish
  let hostname = originHost || refererHost || proxyHost || "localhost";
  if (!originHost && isLoopbackIp(hostname)) {
    hostname = "localhost";
  }

  const protoHeader = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const proto = protoHeader || (hostname === "localhost" || isLoopbackIp(hostname) ? "http" : "https");
  const origin = originHeader || originFromUrl(referer) || `${proto}://${hostHeader}`;

  return { rpID: hostname, origin, rpName: "VAKSINA MED" };
}

export function webauthnUnsupportedHostMessage(rpID: string): string | null {
  if (isIpHostname(rpID)) {
    return "Face ID IP manzilda ishlamaydi. Kompyuterda http://localhost:3000 dan oching.";
  }
  return null;
}
