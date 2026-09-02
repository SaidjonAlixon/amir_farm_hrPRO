import { Router, type IRouter } from "express";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { isHrRole } from "../lib/roles";
import {
  getCatalogShifts,
  isValidHm,
  normalizeHm,
  reloadShiftCatalog,
  reloadShiftCatalogIfStale,
  updateShiftTemplate,
} from "../lib/shift-catalog";
import { ALL_SHIFTS, isValidShiftType } from "../lib/shift-hours";

const router: IRouter = Router();

function isAdminLike(role: string) {
  return role === "admin" || role === "director" || isHrRole(role);
}

function canEditGlobalShiftTemplates(role: string): boolean {
  return isAdminLike(role) || role === "koordinator" || role === "mudir";
}

router.get("/shift-templates", requireAuth, async (_req, res): Promise<void> => {
  await reloadShiftCatalogIfStale();
  const shifts = getCatalogShifts().map((s) => ({
    key: s.key,
    label: s.label,
    hint: s.hint,
    start: s.start,
    end: s.end,
    overnight: Boolean(s.overnight),
    skipGeofence: Boolean(s.skipGeofence),
    warnHm: s.warnHm,
    warnText: s.warnText,
    hoursNote: s.skipGeofence
      ? `${s.label}: ${s.start}–${s.end} · GPS majburiy emas`
      : s.overnight
        ? `${s.label}: ${s.start}–${s.end} (ertalab)`
        : `${s.label}: ${s.start}–${s.end}`,
  }));
  res.json({ shifts, keys: ALL_SHIFTS.map((s) => s.key) });
});

router.patch("/shift-templates/:key", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const role = req.userRole || "";
  if (!canEditGlobalShiftTemplates(role)) {
    res.status(403).json({ error: "Smena vaqtini o‘zgartirish uchun ruxsat yo‘q" });
    return;
  }
  const key = String(req.params.key || "");
  if (!isValidShiftType(key) || key === "custom") {
    res.status(400).json({ error: "Smena turi noto‘g‘ri" });
    return;
  }
  const body = req.body as {
    label?: string;
    hint?: string;
    start?: string;
    end?: string;
    overnight?: boolean;
    skipGeofence?: boolean;
    warnHm?: string;
    warnText?: string;
  };
  if (body.start != null && !isValidHm(body.start)) {
    res.status(400).json({ error: "Boshlanish vaqti HH:MM ko‘rinishida bo‘lishi kerak" });
    return;
  }
  if (body.end != null && !isValidHm(body.end)) {
    res.status(400).json({ error: "Tugash vaqti HH:MM ko‘rinishida bo‘lishi kerak" });
    return;
  }
  if (body.warnHm != null && !isValidHm(body.warnHm)) {
    res.status(400).json({ error: "Ogohlantirish vaqti HH:MM ko‘rinishida bo‘lishi kerak" });
    return;
  }

  const updated = await updateShiftTemplate(key, {
    label: body.label,
    hint: body.hint,
    startHm: body.start != null ? normalizeHm(body.start) : undefined,
    endHm: body.end != null ? normalizeHm(body.end) : undefined,
    overnight: body.overnight,
    skipGeofence: body.skipGeofence,
    warnHm: body.warnHm != null ? normalizeHm(body.warnHm) : undefined,
    warnText: body.warnText,
  });
  if (!updated) {
    res.status(404).json({ error: "Smena topilmadi" });
    return;
  }
  res.json({
    ok: true,
    shift: {
      key: updated.key,
      label: updated.label,
      hint: updated.hint,
      start: updated.start,
      end: updated.end,
      overnight: Boolean(updated.overnight),
      skipGeofence: Boolean(updated.skipGeofence),
      warnHm: updated.warnHm,
      warnText: updated.warnText,
    },
  });
});

export default router;
