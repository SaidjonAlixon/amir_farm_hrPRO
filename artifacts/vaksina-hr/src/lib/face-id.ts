/** Face ID — faqat kamera orqali yuz vektori */

const FACE_API_SRC = "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js";
const MODEL_URL = "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights";

type Point = { x: number; y: number };

type FaceLandmarksResult = {
  detection: {
    score: number;
    box: { x: number; y: number; width: number; height: number };
  };
  landmarks: {
    positions?: Point[];
    getLeftEye?: () => Point[];
    getRightEye?: () => Point[];
    getNose?: () => Point[];
  };
  descriptor?: Float32Array;
};

type FaceApi = {
  nets: {
    tinyFaceDetector: { loadFromUri: (u: string) => Promise<void>; isLoaded?: boolean };
    faceLandmark68Net: { loadFromUri: (u: string) => Promise<void>; isLoaded?: boolean };
    faceRecognitionNet: { loadFromUri: (u: string) => Promise<void>; isLoaded?: boolean };
  };
  TinyFaceDetectorOptions: new (opts: { inputSize?: number; scoreThreshold?: number }) => unknown;
  detectAllFaces: (
    input: HTMLVideoElement,
    options: unknown,
  ) => Promise<Array<{ detection: { score: number } }>>;
  detectSingleFace: (
    input: HTMLVideoElement,
    options: unknown,
  ) => {
    withFaceLandmarks: () => Promise<FaceLandmarksResult | undefined> & {
      withFaceDescriptor: () => Promise<(FaceLandmarksResult & { descriptor: Float32Array }) | undefined>;
    };
  };
};

declare global {
  interface Window {
    faceapi?: FaceApi;
  }
}

let modelsReady = false;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-face-api="1"]`);
    if (existing && window.faceapi) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.dataset.faceApi = "1";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Face ID moduli yuklanmadi — internetni tekshiring"));
    document.head.appendChild(s);
  });
}

export async function ensureFaceModels(): Promise<FaceApi> {
  await loadScript(FACE_API_SRC);
  const faceapi = window.faceapi;
  if (!faceapi) throw new Error("Face ID moduli yuklanmadi");
  if (!modelsReady) {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    modelsReady = true;
  }
  return faceapi;
}

export type FaceAlignStatus =
  | "no_face"
  | "too_far"
  | "too_close"
  | "outside"
  | "ok"
  | "hold_still"
  | "low_quality"
  | "turn_face"
  | "dark"
  | "many_faces"
  | "low_camera"
  | "covered";

export type FacePose = "center" | "left" | "right" | "up" | "down";

export type FaceDetectResult = {
  descriptor: number[] | null;
  status: FaceAlignStatus;
  score?: number;
  pose?: FacePose | "unknown";
  yaw?: number;
  pitch?: number;
  ear?: number;
  eyesOpen?: boolean;
  faceCount?: number;
};

export type FaceOvalFrame = {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
};

function mapVideoBoxToElement(
  video: HTMLVideoElement,
  box: { x: number; y: number; width: number; height: number },
  mirrored: boolean,
) {
  const cw = video.clientWidth;
  const ch = video.clientHeight;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!cw || !ch || !vw || !vh) return null;
  const scale = Math.max(cw / vw, ch / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  const ox = (cw - dw) / 2;
  const oy = (ch - dh) / 2;
  let x = ox + box.x * scale;
  const y = oy + box.y * scale;
  const w = box.width * scale;
  const h = box.height * scale;
  if (mirrored) x = cw - x - w;
  return { x, y, width: w, height: h, cx: x + w / 2, cy: y + h / 2 };
}

function ellipseNorm(px: number, py: number, frame: FaceOvalFrame): number {
  const dx = (px - frame.cx) / frame.rx;
  const dy = (py - frame.cy) / frame.ry;
  return dx * dx + dy * dy;
}

function noseOffsetRatio(landmarks: FaceLandmarksResult["landmarks"], box: { x: number; width: number }): number {
  const nose = landmarks.getNose?.();
  const tip = nose?.[nose.length - 1] ?? nose?.[3];
  const positions = landmarks.positions;
  const nx = tip?.x ?? positions?.[30]?.x;
  if (nx == null || !box.width) return 0;
  const mid = box.x + box.width / 2;
  return Math.abs(nx - mid) / box.width;
}

function centroid(pts?: Point[]): Point | null {
  if (!pts?.length) return null;
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
}

function poseFromLandmarks(
  landmarks: FaceLandmarksResult["landmarks"],
  box: { x: number; y: number; width: number; height: number },
  mirrored = true,
): { yaw: number; pitch: number; pose: FacePose | "unknown" } {
  const positions = landmarks.positions ?? [];
  const nosePts = landmarks.getNose?.();
  const nose = nosePts?.[nosePts.length - 1] ?? positions[30];
  const left = centroid(landmarks.getLeftEye?.() ?? positions.slice(36, 42));
  const right = centroid(landmarks.getRightEye?.() ?? positions.slice(42, 48));
  if (!nose || !box.width || !box.height) return { yaw: 0, pitch: 0, pose: "unknown" };
  let yaw = (nose.x - (box.x + box.width / 2)) / box.width;
  if (mirrored) yaw = -yaw;
  const eyeY = left && right ? (left.y + right.y) / 2 : box.y + box.height * 0.38;
  // Selfie: iyagni ko‘tarib tepaga qaraganda burun rasmdа pastga ketadi (Y katta) → pitch > 0
  const pitch = (nose.y - eyeY) / box.height - 0.18;
  const ay = Math.abs(yaw);
  const ap = Math.abs(pitch);
  let pose: FacePose | "unknown" = "center";
  if (ay >= 0.11 && ay >= ap) pose = yaw > 0 ? "right" : "left";
  else if (ap >= 0.05) pose = pitch > 0 ? "up" : "down";
  return { yaw, pitch, pose };
}

export function poseMatchesWant(
  want: FacePose,
  pose?: FacePose | "unknown",
  yaw = 0,
  pitch = 0,
  pitchFrom?: number,
): boolean {
  if (want === "center") return Math.abs(yaw) < 0.18 && Math.abs(pitch) < 0.16;
  if (want === "left") return yaw < -0.14;
  if (want === "right") return yaw > 0.14;
  if (want === "up") return pitch > 0.07 || pose === "up";
  if (want === "down") {
    const dropped = pitchFrom != null && pitch <= pitchFrom - 0.06;
    return pitch < -0.025 || pose === "down" || dropped;
  }
  return pose === want;
}

export function poseHint(pose: FacePose): string {
  switch (pose) {
    case "center":
      return "Kameraga qarang";
    case "left":
      return "Boshni sekin chapga buring";
    case "right":
      return "Boshni sekin o‘ngga buring";
    case "up":
      return "Iyagni biroz ko‘taring — shiftga qarang";
    case "down":
      return "Boshni oldinga egib, iyakni pastga tushiring";
  }
}

function eyeWidthRatio(landmarks: FaceLandmarksResult["landmarks"]): number {
  const left = landmarks.getLeftEye?.();
  const right = landmarks.getRightEye?.();
  if (!left?.length || !right?.length) return 1;
  const span = (pts: Point[]) => {
    let minX = pts[0]!.x;
    let maxX = pts[0]!.x;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
    }
    return Math.max(1, maxX - minX);
  };
  const lw = span(left);
  const rw = span(right);
  return Math.min(lw, rw) / Math.max(lw, rw);
}

function eyeEar(pts?: Point[]): number | null {
  if (!pts || pts.length < 6) return null;
  const d = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const h = d(pts[0]!, pts[3]!);
  if (h < 1) return null;
  return (d(pts[1]!, pts[5]!) + d(pts[2]!, pts[4]!)) / (2 * h);
}

function frameSharpness(video: HTMLVideoElement): number {
  try {
    const w = 48;
    const h = 36;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return 40;
    ctx.drawImage(video, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    const g: number[] = [];
    for (let i = 0; i < data.length; i += 4) {
      g.push((data[i]! + data[i + 1]! + data[i + 2]!) / 3);
    }
    let acc = 0;
    let n = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const lap =
          -4 * g[i]! + g[i - 1]! + g[i + 1]! + g[i - w]! + g[i + w]!;
        acc += lap * lap;
        n += 1;
      }
    }
    return n ? acc / n : 0;
  } catch {
    return 40;
  }
}

function frameBrightness(video: HTMLVideoElement): number {
  try {
    const c = document.createElement("canvas");
    c.width = 48;
    c.height = 36;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return 128;
    ctx.drawImage(video, 0, 0, 48, 36);
    const data = ctx.getImageData(0, 0, 48, 36).data;
    let s = 0;
    for (let i = 0; i < data.length; i += 4) s += (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
    return s / (data.length / 4);
  } catch {
    return 128;
  }
}

/** Yuqori sifat: katta inputSize + qattiq score */
const DETECT_OPTS = { inputSize: 416 as const, scoreThreshold: 0.5 };
const MIN_DETECT_SCORE = 0.58;

export async function detectFaceDescriptor(
  video: HTMLVideoElement,
  frame?: FaceOvalFrame | null,
  mirrored = true,
  opts?: { allowTurn?: boolean; allowBlink?: boolean },
): Promise<FaceDetectResult> {
  const faceapi = await ensureFaceModels();
  const detector = new faceapi.TinyFaceDetectorOptions(DETECT_OPTS);

  if (video.videoWidth > 0 && video.videoWidth < 420) {
    return { descriptor: null, status: "low_camera" };
  }
  const brightness = frameBrightness(video);
  if (brightness < 42) {
    return { descriptor: null, status: "dark" };
  }
  if (!opts?.allowTurn && !opts?.allowBlink && frameSharpness(video) < 22) {
    return { descriptor: null, status: "low_quality" };
  }

  let many: Array<{ detection: { score: number } }> = [];
  try {
    many = (await faceapi.detectAllFaces(video, detector)) ?? [];
  } catch {
    many = [];
  }
  if (many.length > 1) {
    return { descriptor: null, status: "many_faces", faceCount: many.length };
  }

  const result = await faceapi.detectSingleFace(video, detector).withFaceLandmarks().withFaceDescriptor();

  const minScore = opts?.allowTurn || opts?.allowBlink ? 0.38 : MIN_DETECT_SCORE;
  if (!result || result.detection.score < minScore) {
    return { descriptor: null, status: "no_face" };
  }
  if (!frame || frame.rx < 8 || frame.ry < 8) {
    return { descriptor: null, status: "outside" };
  }

  const mapped = mapVideoBoxToElement(video, result.detection.box, mirrored);
  if (!mapped) return { descriptor: null, status: "no_face" };

  if (ellipseNorm(mapped.cx, mapped.cy, frame) > (opts?.allowTurn ? 1.35 : 0.92)) {
    return { descriptor: null, status: "outside" };
  }

  const fillW = mapped.width / (frame.rx * 2);
  const fillH = mapped.height / (frame.ry * 2);
  const minFill = opts?.allowTurn ? 0.22 : 0.38;
  if (fillW < minFill || fillH < minFill - 0.05) return { descriptor: null, status: "too_far" };
  if (fillW > 1.75 || fillH > 1.75) return { descriptor: null, status: "too_close" };

  const positions = result.landmarks.positions ?? [];
  const leftEye = result.landmarks.getLeftEye?.() ?? positions.slice(36, 42);
  const rightEye = result.landmarks.getRightEye?.() ?? positions.slice(42, 48);
  const leftEar = eyeEar(leftEye);
  const rightEar = eyeEar(rightEye);
  const ear =
    leftEar != null && rightEar != null ? (leftEar + rightEar) / 2 : leftEar ?? rightEar ?? undefined;
  const eyesOpen = ear == null ? undefined : ear >= 0.19;
  const head = poseFromLandmarks(result.landmarks, result.detection.box, mirrored);
  if (!opts?.allowTurn && !opts?.allowBlink) {
    if (noseOffsetRatio(result.landmarks, result.detection.box) > 0.2) {
      return { descriptor: null, status: "turn_face", score: result.detection.score, ear, eyesOpen, ...head };
    }
    if (eyeWidthRatio(result.landmarks) < 0.58) {
      return { descriptor: null, status: "turn_face", score: result.detection.score, ear, eyesOpen, ...head };
    }
    if (ear != null && ear < 0.13) {
      return { descriptor: null, status: "covered", score: result.detection.score, ear, eyesOpen, ...head };
    }
  }

  if (!result.descriptor) {
    return { descriptor: null, status: "low_quality", score: result.detection.score, ear, eyesOpen, ...head };
  }

  const desc = Array.from(result.descriptor);
  let norm = 0;
  for (const x of desc) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < desc.length; i++) desc[i] = desc[i]! / norm;

  return {
    descriptor: desc,
    status: "ok",
    score: result.detection.score,
    ear,
    eyesOpen,
    faceCount: 1,
    ...head,
  };
}

export function euclideanDescriptor(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i]! - b[i]!;
    s += d * d;
  }
  return Math.sqrt(s);
}

export function isStableSample(prev: number[] | null, next: number[], maxDist = 0.11): boolean {
  if (!prev) return true;
  return euclideanDescriptor(prev, next) <= maxDist;
}

export function averageDescriptors(list: number[][]): number[] {
  const n = list[0]?.length ?? 0;
  const out = new Array<number>(n).fill(0);
  for (const d of list) {
    for (let i = 0; i < n; i++) out[i] += d[i]!;
  }
  for (let i = 0; i < n; i++) out[i] /= list.length;
  return out;
}

/** Chetki namunalarni tashlab o‘rtacha olish */
export function averageDescriptorsRobust(list: number[][]): number[] {
  if (list.length <= 2) return averageDescriptors(list);
  const mean = averageDescriptors(list);
  const scored = list.map((d) => ({ d, dist: euclideanDescriptor(d, mean) }));
  scored.sort((a, b) => a.dist - b.dist);
  const keep = scored.slice(0, Math.max(4, Math.ceil(scored.length * 0.65))).map((x) => x.d);
  return averageDescriptors(keep.length ? keep : list);
}

export function faceAlignHint(status: FaceAlignStatus): string {
  switch (status) {
    case "ok":
      return "Yuz aniq — harakatsiz turing…";
    case "hold_still":
      return "Biroz to‘xtang — aniqroq olinmoqda…";
    case "low_quality":
      return "Yuz aniq emas — yorug‘likni yaxshilang";
    case "turn_face":
      return "Kameraga to‘g‘ri qarang (yon tomonga emas)";
    case "dark":
      return "Yoritish yetarli emas — yorug‘roq joyga o‘ting";
    case "too_far":
      return "Yuz juda uzoq — ramkaga yaqinroq keling";
    case "too_close":
      return "Yuz juda yaqin — biroz orqaga turing";
    case "covered":
      return "Yuz qisman yopilgan — ko‘z/og‘iz ochiq bo‘lsin";
    case "low_camera":
      return "Kamera sifati past — boshqa kamera yoki yorug‘likni yaxshilang";
    case "many_faces":
      return "Bir nechta yuz aniqlandi — kadirda faqat siz bo‘ling";
    case "outside":
      return "Yuzni oval ramka ichiga joylashtiring";
    default:
      return "Yuzingizni ramka ichiga tuting";
  }
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    ...init,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((body as { error?: string }).error || "Face ID xatosi") as Error & {
      code?: string;
      fullName?: string;
      neighbors?: unknown;
    };
    err.code = (body as { code?: string }).code;
    err.fullName = (body as { fullName?: string }).fullName;
    err.neighbors = (body as { neighbors?: unknown }).neighbors;
    throw err;
  }
  return body as T;
}

export function isFaceIdSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

export type FaceIdStatus = {
  registered: boolean;
  count: number;
  hasPhoto?: boolean;
  photoUrl?: string | null;
  createdAt?: string | null;
};

export async function fetchFaceIdStatus(): Promise<FaceIdStatus> {
  return apiJson<FaceIdStatus>("/auth/face/status");
}

export async function updateMyProfile(input: {
  firstName: string;
  lastName: string;
  password: string;
}): Promise<{ user: { id: number; fullName: string; role: string; login?: string }; message?: string }> {
  return apiJson("/auth/profile", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function compressFaceSnapshotAsync(
  dataUrl: string | undefined,
  maxSide = 480,
  quality = 0.82,
): Promise<string | undefined> {
  if (!dataUrl?.startsWith("data:image/")) return undefined;
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("image"));
      el.src = dataUrl;
    });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return dataUrl.startsWith("data:image/") ? dataUrl : undefined;
  }
}

export type FaceLivenessProof = {
  blinked: boolean;
  poses: string[];
  steps?: string[];
  motion: number;
  score: number;
  challenge?: string;
};

export type FaceChallengeStep = {
  key: string;
  pose?: FacePose;
  blink?: boolean;
  need: number;
};

export async function fetchFaceChallenge(mode: "enroll" | "login"): Promise<{
  token: string;
  steps: FaceChallengeStep[];
}> {
  return apiJson(`/auth/face/challenge?mode=${mode}`);
}

export function livenessMotion(samples: number[][]): number {
  if (samples.length < 2) return 0;
  let max = 0;
  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++) {
      max = Math.max(max, euclideanDescriptor(samples[i]!, samples[j]!));
    }
  }
  return max;
}
export async function enrollFace(
  descriptor: number[] | number[][],
  snapshot?: string,
  liveness?: FaceLivenessProof,
): Promise<{ photoUrl?: string | null }> {
  if (!snapshot?.startsWith("data:image/")) {
    throw new Error("Yuz rasmi olinmadi — qayta urinib ko‘ring");
  }
  const photo = (await compressFaceSnapshotAsync(snapshot)) || snapshot;
  const body =
    Array.isArray(descriptor[0])
      ? { descriptors: descriptor, snapshot: photo, photo, liveness }
      : { descriptor, snapshot: photo, photo, liveness };
  const res = await apiJson<{ photoUrl?: string | null }>("/auth/face/enroll", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res;
}

export async function loginWithFace<TUser>(
  descriptor: number[] | number[][],
  snapshot?: string,
  liveness?: FaceLivenessProof,
): Promise<{ user: TUser; fullName?: string; message?: string }> {
  const list = (Array.isArray(descriptor[0]) ? descriptor : [descriptor]) as number[][];
  const photo = snapshot ? await compressFaceSnapshotAsync(snapshot) : undefined;
  return apiJson<{ user: TUser; fullName?: string; message?: string }>("/auth/face/login", {
    method: "POST",
    body: JSON.stringify({ descriptors: list, snapshot: photo, liveness }),
  });
}

export async function removeFaceId(): Promise<void> {
  await apiJson("/auth/face", { method: "DELETE" });
}

export type AdminFaceRow = {
  id: number;
  userId: number;
  fullName: string;
  login: string;
  role: string;
  roleLabel: string;
  status: string;
  phone: string | null;
  departmentName: string | null;
  photoUrl: string | null;
  hasPhoto: boolean;
  faceRegistered: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  lastUsedAt: string | null;
  nearest: {
    userId: number;
    fullName: string;
    login: string;
    distance: number;
  } | null;
  similarRisk: "none" | "medium" | "high";
};

export type AdminFacesResponse = {
  total: number;
  registered: number;
  notRegistered: number;
  withPhoto: number;
  similarPairs: number;
  enrollBlockMax: number;
  faces: AdminFaceRow[];
  duplicates: Array<{
    a: { userId: number; fullName: string; login: string };
    b: { userId: number; fullName: string; login: string };
    distance: number;
  }>;
};

export async function fetchAdminFaces(): Promise<AdminFacesResponse> {
  return apiJson<AdminFacesResponse>("/admin/faces");
}

export async function downloadAdminFacesExcel(params?: {
  q?: string;
  status?: "all" | "yes" | "no";
  onlyRisk?: boolean;
}): Promise<void> {
  const sp = new URLSearchParams();
  if (params?.q?.trim()) sp.set("q", params.q.trim());
  if (params?.status && params.status !== "all") sp.set("status", params.status);
  if (params?.onlyRisk) sp.set("onlyRisk", "1");
  const qs = sp.toString();
  const res = await fetch(`/api/admin/faces/export${qs ? `?${qs}` : ""}`, {
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || "Excel yuklanmadi");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `face-id_${stamp}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function adminResetFace(userId: number): Promise<{ message: string }> {
  return apiJson(`/admin/faces/${userId}`, { method: "DELETE" });
}

export async function adminResetAllFaces(): Promise<{ message: string; removed: number }> {
  return apiJson(`/admin/faces`, { method: "DELETE" });
}

export function isFaceIdCancelled(err: unknown): boolean {
  const name = err instanceof DOMException ? err.name : "";
  return name === "NotAllowedError" || name === "AbortError";
}
