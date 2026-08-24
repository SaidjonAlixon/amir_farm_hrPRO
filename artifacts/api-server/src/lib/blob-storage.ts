import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { get, put } from "@vercel/blob";

const MAX_BYTES = 10 * 1024 * 1024;

function isServerless() {
  return (
    process.env.VERCEL === "1" ||
    process.env.VERCEL === "true" ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
    process.cwd().replace(/\\/g, "/").startsWith("/var/task")
  );
}

function blobToken() {
  const t = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  return t || undefined;
}

function uploadsDir() {
  // Vercel / Lambda da faqat /tmp yoziladi
  if (isServerless()) {
    return path.join("/tmp", "uploads");
  }
  return path.resolve(process.cwd(), "uploads");
}

function sanitizeFileName(name: string) {
  const base = path.basename(name || "fayl").slice(0, 120);
  return base.replace(/[^\w.\-()\s'а-яА-ЯёЁўқғҳЎҚҒҲ\-]/giu, "_") || "fayl";
}

export function makeUploadId(originalName: string) {
  const safe = sanitizeFileName(originalName);
  const stamp = Date.now().toString(36);
  const rand = randomBytes(5).toString("hex");
  return `tasks__${stamp}_${rand}__${safe}`;
}

export function hasBlobToken() {
  return Boolean(blobToken());
}

/** Private store: API orqali beriladi. Public/local: to‘g‘ridan URL. */
export async function storeUploadBuffer(opts: {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}): Promise<{ url: string; key: string; size: number }> {
  const { buffer, fileName, mimeType } = opts;
  if (!buffer.length) {
    throw new Error("Fayl bo'sh");
  }
  if (buffer.length > MAX_BYTES) {
    throw new Error("Fayl 10 MB dan katta");
  }

  const key = makeUploadId(fileName);
  const token = blobToken();

  if (token) {
    try {
      const blob = await put(`tasks/${key}`, buffer, {
        access: "private",
        contentType: mimeType || "application/octet-stream",
        token,
        addRandomSuffix: false,
      });
      return {
        url: `/api/uploads/remote?path=${encodeURIComponent(blob.pathname)}`,
        key: blob.pathname,
        size: buffer.length,
      };
    } catch (err: any) {
      const detail = err?.message || String(err);
      throw new Error(`Blob yuklash xatosi: ${detail}`);
    }
  }

  // Vercel serverless — hech qachon diskka yozilmasin
  if (isServerless()) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN sozlanmagan — Vercel → Settings → Environment Variables",
    );
  }

  const dir = uploadsDir();
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, key), buffer);
  return {
    url: `/api/uploads/${encodeURIComponent(key)}`,
    key,
    size: buffer.length,
  };
}

export async function readBlobUpload(pathname: string): Promise<{
  buffer: Buffer;
  contentType: string;
  downloadName: string;
} | null> {
  const token = blobToken();
  if (!token) return null;
  if (!pathname || pathname.includes("..") || !pathname.startsWith("tasks/")) {
    return null;
  }

  const result = await get(pathname, {
    access: "private",
    token,
    useCache: true,
  });
  if (!result || result.statusCode !== 200 || !result.stream) return null;

  const reader = result.stream.getReader();
  const chunks: Buffer[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(Buffer.from(value));
  }

  const downloadName =
    pathname.split("/").pop()?.includes("__")
      ? pathname.split("__").pop() || pathname
      : path.basename(pathname);

  return {
    buffer: Buffer.concat(chunks),
    contentType: result.blob.contentType || "application/octet-stream",
    downloadName,
  };
}

export async function readLocalUpload(key: string): Promise<Buffer | null> {
  const safe = path.basename(key);
  if (!safe || safe !== key.replace(/\\/g, "/").split("/").pop()) {
    return null;
  }
  try {
    return await readFile(path.join(uploadsDir(), safe));
  } catch {
    return null;
  }
}

export type AttachmentKind = "image" | "file" | "audio" | "video";

export function attachmentKind(mimeType: string): AttachmentKind {
  const m = (mimeType || "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("video/")) return "video";
  return "file";
}

export function contentHash(buffer: Buffer) {
  return createHash("sha1").update(buffer).digest("hex").slice(0, 12);
}

export { MAX_BYTES };
