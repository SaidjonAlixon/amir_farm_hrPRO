import type { Response } from "express";

export function isProdEnv(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL === "1" ||
    process.env.VERCEL === "true"
  );
}

export function setSessionCookie(res: Response, userId: number): void {
  const token = Buffer.from(JSON.stringify({ userId })).toString("base64");
  res.cookie("session", token, {
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    signed: false,
    sameSite: "lax",
    secure: isProdEnv(),
    path: "/",
  });
}

/** Telegram Mini App WebView — SameSite=None kerak (secure) */
export function setTelegramSessionCookie(res: Response, userId: number): void {
  const token = Buffer.from(JSON.stringify({ userId })).toString("base64");
  const secure = isProdEnv();
  res.cookie("session", token, {
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    signed: false,
    sameSite: secure ? "none" : "lax",
    secure,
    path: "/",
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie("session", { path: "/", sameSite: "lax", secure: isProdEnv() });
}
