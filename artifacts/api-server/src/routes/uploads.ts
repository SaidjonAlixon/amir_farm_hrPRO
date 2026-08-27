import express, { Router, type IRouter } from "express";
import path from "node:path";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import {
  attachmentKind,
  MAX_BYTES,
  readBlobUpload,
  readLocalUpload,
  storeUploadBuffer,
} from "../lib/blob-storage";

const router: IRouter = Router();

function decodeFileName(raw: string | undefined): string {
  if (!raw) return "fayl";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function guessMime(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const map: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx":
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".txt": "text/plain",
    ".zip": "application/zip",
    ".webm": "video/webm",
    ".ogg": "audio/ogg",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".wav": "audio/wav",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
  };
  return map[ext] || "application/octet-stream";
}

function shouldInline(mime: string) {
  return (
    mime.startsWith("image/") ||
    mime.startsWith("audio/") ||
    mime.startsWith("video/")
  );
}

/**
 * POST /api/uploads
 * Body: raw file bytes
 * Headers: Content-Type, X-File-Name (URL-encoded)
 */
router.post(
  "/uploads",
  requireAuth,
  express.raw({ type: () => true, limit: MAX_BYTES }),
  async (req: AuthRequest, res): Promise<void> => {
    try {
      const buffer = Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from(req.body ?? []);

      if (!buffer.length) {
        res.status(400).json({ error: "Fayl yuborilmadi" });
        return;
      }

      const fileName = decodeFileName(
        (req.headers["x-file-name"] as string | undefined) || "fayl",
      );
      const mimeType =
        (req.headers["content-type"] as string | undefined)?.split(";")[0]?.trim() ||
        "application/octet-stream";

      const stored = await storeUploadBuffer({ buffer, fileName, mimeType });
      const kind = attachmentKind(mimeType);

      res.status(201).json({
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: fileName.slice(0, 200),
        mimeType,
        kind,
        url: stored.url,
        size: stored.size,
      });
    } catch (err: any) {
      const msg = err?.message || "Yuklashda xatolik";
      const status = msg.includes("10 MB") ? 413 : 500;
      res.status(status).json({ error: msg });
    }
  },
);

/**
 * GET /api/uploads/remote?path=tasks/... — Vercel private blob
 */
router.get("/uploads/remote", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const pathname = decodeFileName(String(req.query.path || ""));
  const data = await readBlobUpload(pathname);
  if (!data) {
    res.status(404).json({ error: "Fayl topilmadi" });
    return;
  }

  const forceDownload = String(req.query.download || "") === "1";
  const mime = data.contentType || guessMime(data.downloadName);

  res.setHeader("Content-Type", mime);
  res.setHeader(
    "Content-Disposition",
    `${forceDownload || !shouldInline(mime) ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(data.downloadName)}`,
  );
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.send(data.buffer);
});

/**
 * GET /api/uploads/:key — lokal diskdagi fayl
 */
router.get("/uploads/:key", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const key = decodeFileName(
    Array.isArray(req.params.key) ? req.params.key[0] : req.params.key,
  );
  if (!key || key.includes("..") || key === "remote") {
    res.status(400).json({ error: "Noto‘g‘ri fayl" });
    return;
  }

  const data = await readLocalUpload(key);
  if (!data) {
    res.status(404).json({ error: "Fayl topilmadi" });
    return;
  }

  const downloadName = key.includes("__") ? key.split("__").pop() || key : key;
  const mime = guessMime(downloadName);
  const forceDownload = String(req.query.download || "") === "1";

  res.setHeader("Content-Type", mime);
  res.setHeader(
    "Content-Disposition",
    `${forceDownload || !shouldInline(mime) ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
  );
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.send(data);
});

export default router;
