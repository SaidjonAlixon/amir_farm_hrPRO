import { and, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  employeesTable,
  attendanceRecordsTable,
  notificationsTable,
} from "@workspace/db";
import { logger } from "../lib/logger";
import { notifyAllActiveUsers } from "../lib/notify";
import { DAVOMAT_GEOFENCE_METERS } from "../routes/davomat";
import { isPharmacyShiftStaff, shiftWindow, hmToMinutes } from "../lib/shift-hours";

const FIVE_MIN_MS = 5 * 60 * 1000;

function tashkentParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "0";
  return {
    ymd: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

function dayStartUtcApprox(ymd: string): Date {
  return new Date(`${ymd}T00:00:00+05:00`);
}

async function alreadyNotifiedToday(userId: number, type: string, since: Date): Promise<boolean> {
  const [row] = await db
    .select({ id: notificationsTable.id })
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.userId, userId),
        eq(notificationsTable.type, type),
        gte(notificationsTable.createdAt, since),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** Kunlik qoida xabari — barcha faol xodimlarga (kuniga 1 marta) */
export async function broadcastDavomatRuleNotice(): Promise<number> {
  const { ymd, hour } = tashkentParts();
  // Ertalab 07:00 dan keyin
  if (hour < 7) return 0;

  const since = dayStartUtcApprox(ymd);
  const users = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.status, "active"));

  let sent = 0;
  const text =
    `Davomat: kelish va ketish faqat Face ID orqali. Belgilangan lokatsiyadan ${DAVOMAT_GEOFENCE_METERS} m ichida bo‘ling — aks holda qabul qilinmaydi.`;
  for (const u of users) {
    if (await alreadyNotifiedToday(u.id, "davomat_rule", since)) continue;
    await db.insert(notificationsTable).values({
      userId: u.id,
      text,
      type: "davomat_rule",
      linkUrl: "/davomat-face",
    });
    sent += 1;
  }
  if (sent > 0) logger.info({ sent }, "Davomat rule notices sent");
  return sent;
}

async function loadLinkedStaff() {
  return db
    .select({
      userId: employeesTable.userId,
      empId: employeesTable.id,
      fullName: employeesTable.fullName,
      orgRole: employeesTable.orgRole,
      shiftType: employeesTable.shiftType,
    })
    .from(employeesTable)
    .where(
      and(
        isNotNull(employeesTable.userId),
        sql`coalesce(${employeesTable.employmentStatus}, 'working') <> 'dismissed'`,
      ),
    );
}

async function userRoleMap(ids: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return map;
  const users = await db
    .select({ id: usersTable.id, role: usersTable.role })
    .from(usersTable)
    .where(inArray(usersTable.id, uniq));
  for (const u of users) map.set(u.id, u.role);
  return map;
}

/** Smena boshlanishidan 15 daqiqa oldin — qat’iy ogohlantirish */
export async function remindPharmacyShiftWarn(): Promise<number> {
  const { ymd, hour, minute } = tashkentParts();
  const mins = hour * 60 + minute;
  const since = dayStartUtcApprox(ymd);
  const linked = await loadLinkedStaff();
  const roles = await userRoleMap(linked.map((e) => e.userId || 0));
  let sent = 0;

  for (const e of linked) {
    if (!e.userId) continue;
    const role = roles.get(e.userId) || "";
    if (!isPharmacyShiftStaff(role, e.orgRole)) continue;
    const w = shiftWindow(e.shiftType);
    const warnMin = hmToMinutes(w.warnHm);
    if (mins < warnMin || mins >= warnMin + 15) continue;

    const [rec] = await db
      .select({ checkInAt: attendanceRecordsTable.checkInAt })
      .from(attendanceRecordsTable)
      .where(and(eq(attendanceRecordsTable.employeeId, e.empId), eq(attendanceRecordsTable.workDate, ymd)))
      .limit(1);
    if (rec?.checkInAt) continue;

    const type = `davomat_shift_warn_${w.key}`;
    if (await alreadyNotifiedToday(e.userId, type, since)) continue;

    await db.insert(notificationsTable).values({
      userId: e.userId,
      text: `${e.fullName}: ${w.warnText} Davomat: Face ID, ${DAVOMAT_GEOFENCE_METERS} m.`,
      type,
      linkUrl: "/davomat-face",
    });
    sent += 1;
  }
  if (sent > 0) logger.info({ sent }, "Pharmacy shift warnings sent");
  return sent;
}

/** Hali kelmaganlarga eslatma (smena soatiga qarab) */
export async function remindDavomatCheckIn(): Promise<number> {
  const { ymd, hour, minute } = tashkentParts();
  const mins = hour * 60 + minute;
  const since = dayStartUtcApprox(ymd);
  const linked = await loadLinkedStaff();
  const roles = await userRoleMap(linked.map((e) => e.userId || 0));
  let sent = 0;

  for (const e of linked) {
    if (!e.userId) continue;
    const role = roles.get(e.userId) || "";
    const pharmacy = isPharmacyShiftStaff(role, e.orgRole);
    if (pharmacy) {
      const start = hmToMinutes(shiftWindow(e.shiftType).start);
      if (mins < start || mins > start + 150) continue;
    } else if (mins < 8 * 60 + 30 || mins > 11 * 60) {
      continue;
    }

    const [rec] = await db
      .select({ id: attendanceRecordsTable.id, checkInAt: attendanceRecordsTable.checkInAt })
      .from(attendanceRecordsTable)
      .where(
        and(
          eq(attendanceRecordsTable.employeeId, e.empId),
          eq(attendanceRecordsTable.workDate, ymd),
        ),
      )
      .limit(1);
    if (rec?.checkInAt) continue;
    if (await alreadyNotifiedToday(e.userId, "davomat_checkin", since)) continue;

    const w = pharmacy ? shiftWindow(e.shiftType) : null;
    await db.insert(notificationsTable).values({
      userId: e.userId,
      text: w
        ? `${e.fullName}: ${w.label} (${w.start}) boshlandi, hali kelish yo‘q. Face ID qiling — kechikish jarima.`
        : `${e.fullName}: bugun hali kelish belgilanmagan. Face ID bilan davomatdan o‘ting (${DAVOMAT_GEOFENCE_METERS} m hudud).`,
      type: "davomat_checkin",
      linkUrl: "/davomat-face",
    });
    sent += 1;
  }
  if (sent > 0) logger.info({ sent }, "Davomat check-in reminders sent");
  return sent;
}

/** Ketmaganlarga — smena oxiriga qarab */
export async function remindDavomatCheckOut(): Promise<number> {
  const { ymd, hour, minute } = tashkentParts();
  const mins = hour * 60 + minute;
  const since = dayStartUtcApprox(ymd);
  const open = await db
    .select({
      userId: attendanceRecordsTable.userId,
      empId: attendanceRecordsTable.employeeId,
      fullName: employeesTable.fullName,
      orgRole: employeesTable.orgRole,
      shiftType: employeesTable.shiftType,
    })
    .from(attendanceRecordsTable)
    .innerJoin(employeesTable, eq(employeesTable.id, attendanceRecordsTable.employeeId))
    .where(
      and(
        eq(attendanceRecordsTable.workDate, ymd),
        isNotNull(attendanceRecordsTable.checkInAt),
        isNull(attendanceRecordsTable.checkOutAt),
        isNotNull(attendanceRecordsTable.userId),
      ),
    );

  let sent = 0;
  for (const r of open) {
    if (!r.userId) continue;
    const pharmacy = isPharmacyShiftStaff(null, r.orgRole);
    let inWindow = mins >= 17 * 60 + 30 && mins <= 21 * 60;
    if (pharmacy) {
      const end = hmToMinutes(shiftWindow(r.shiftType).end);
      inWindow = mins >= end - 60 && mins <= end + 30;
    }
    if (!inWindow) continue;
    if (await alreadyNotifiedToday(r.userId, "davomat_checkout", since)) continue;
    await db.insert(notificationsTable).values({
      userId: r.userId,
      text: `${r.fullName || "Xodim"}: ketishni Face ID bilan belgilang (${DAVOMAT_GEOFENCE_METERS} m hudud).`,
      type: "davomat_checkout",
      linkUrl: "/davomat-face",
    });
    sent += 1;
  }
  if (sent > 0) logger.info({ sent }, "Davomat check-out reminders sent");
  return sent;
}

export async function runDavomatReminderCycle(): Promise<void> {
  await broadcastDavomatRuleNotice();
  await remindPharmacyShiftWarn();
  await remindDavomatCheckIn();
  await remindDavomatCheckOut();
}

export function startDavomatReminderJob(): void {
  runDavomatReminderCycle().catch((err) =>
    logger.error({ err }, "Davomat reminder job failed"),
  );
  setInterval(() => {
    runDavomatReminderCycle().catch((err) =>
      logger.error({ err }, "Davomat reminder job failed"),
    );
  }, FIVE_MIN_MS);
  logger.info("Davomat reminder job started (every 5 minutes)");
}

/** Darhol barcha faol xodimlarga bir marta yuborish (admin/HR) */
export async function forceBroadcastDavomatToAll(): Promise<number> {
  return notifyAllActiveUsers({
    text:
      `Muhim: endi barcha xodimlar davomatdan Face ID orqali o‘tadi. Kelish/ketish — faqat belgilangan joydan ${DAVOMAT_GEOFENCE_METERS} m ichida. Ochish: Davomat Face ID.`,
    type: "davomat_rule",
    linkUrl: "/davomat-face",
  });
}
