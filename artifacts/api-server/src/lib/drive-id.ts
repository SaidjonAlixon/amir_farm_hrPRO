/** Google Drive fayl havolasidan ID (file/d/... yoki ?id=). */
export function parseDriveFileId(raw: string): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (/^[a-zA-Z0-9_-]{20,}$/.test(s) && !s.includes("/")) return s;
  const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withProto);
    const host = u.hostname.replace(/^www\./, "");
    if (host !== "drive.google.com" && host !== "docs.google.com") return null;
    const fromPath = u.pathname.match(/\/(?:file|document|presentation|spreadsheets)\/d\/([a-zA-Z0-9_-]{20,})/);
    if (fromPath?.[1]) return fromPath[1];
    const fromOpen = u.pathname.match(/\/open\/?$/);
    const qid = u.searchParams.get("id");
    if ((fromOpen || host === "drive.google.com") && qid && /^[a-zA-Z0-9_-]{20,}$/.test(qid)) {
      return qid;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function drivePreviewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/preview`;
}
