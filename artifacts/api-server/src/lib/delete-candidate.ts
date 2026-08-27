import { eq } from "drizzle-orm";
import {
  db,
  candidatesTable,
  vacanciesTable,
  requestsTable,
  phoneInterviewsTable,
  onlineInterviewsTable,
  offlineInterviewsTable,
  preboardingsTable,
  offersTable,
  employeesTable,
} from "@workspace/db";

/** Nomzod va unga bog‘liq barcha yozuvlarni o‘chiradi. */
export async function deleteCandidateCascade(candidateId: number): Promise<boolean> {
  const [existing] = await db
    .select({ id: candidatesTable.id })
    .from(candidatesTable)
    .where(eq(candidatesTable.id, candidateId));
  if (!existing) return false;

  await db.delete(phoneInterviewsTable).where(eq(phoneInterviewsTable.candidateId, candidateId));
  await db.delete(onlineInterviewsTable).where(eq(onlineInterviewsTable.candidateId, candidateId));
  await db.delete(offlineInterviewsTable).where(eq(offlineInterviewsTable.candidateId, candidateId));
  await db.delete(preboardingsTable).where(eq(preboardingsTable.candidateId, candidateId));
  await db.delete(offersTable).where(eq(offersTable.candidateId, candidateId));
  await db
    .update(employeesTable)
    .set({ candidateId: null })
    .where(eq(employeesTable.candidateId, candidateId));
  await db.delete(candidatesTable).where(eq(candidatesTable.id, candidateId));
  return true;
}

export async function deleteVacancyCascade(vacancyId: number): Promise<boolean> {
  const [existing] = await db
    .select({ id: vacanciesTable.id })
    .from(vacanciesTable)
    .where(eq(vacanciesTable.id, vacancyId));
  if (!existing) return false;

  const related = await db
    .select({ id: candidatesTable.id })
    .from(candidatesTable)
    .where(eq(candidatesTable.vacancyId, vacancyId));

  for (const c of related) {
    await deleteCandidateCascade(c.id);
  }

  await db.delete(vacanciesTable).where(eq(vacanciesTable.id, vacancyId));
  return true;
}

export async function deleteRequestCascade(requestId: number): Promise<boolean> {
  const [existing] = await db
    .select({ id: requestsTable.id })
    .from(requestsTable)
    .where(eq(requestsTable.id, requestId));
  if (!existing) return false;

  const vacancies = await db
    .select({ id: vacanciesTable.id })
    .from(vacanciesTable)
    .where(eq(vacanciesTable.requestId, requestId));

  for (const v of vacancies) {
    await deleteVacancyCascade(v.id);
  }

  await db.delete(requestsTable).where(eq(requestsTable.id, requestId));
  return true;
}

export function canDeleteHrRecords(role?: string): boolean {
  return role === "hr" || role === "hr_direktor" || role === "hr_auditor" || role === "hr_menejer" || role === "director";
}
