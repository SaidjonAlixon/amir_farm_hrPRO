import { eq } from "drizzle-orm";
import { db, kpiSettingsTable } from "@workspace/db";
import { parseGpsText } from "./geo-location";

/** 41°21'05.5"N 69°23'06.7"E */
export const DEFAULT_OFFICE_LAT = 41 + 21 / 60 + 5.5 / 3600;
export const DEFAULT_OFFICE_LNG = 69 + 23 / 60 + 6.7 / 3600;
export const DEFAULT_OFFICE_DMS = `41°21'05.5"N 69°23'06.7"E`;
export const DEFAULT_OFFICE_NAME = "Asosiy ofis";

export type OfficeLocation = {
  name: string;
  dms: string;
  label: string;
  latitude: number;
  longitude: number;
};

export function defaultOfficeLocation(): OfficeLocation {
  return {
    name: DEFAULT_OFFICE_NAME,
    dms: DEFAULT_OFFICE_DMS,
    label: `${DEFAULT_OFFICE_NAME} · ${DEFAULT_OFFICE_DMS}`,
    latitude: DEFAULT_OFFICE_LAT,
    longitude: DEFAULT_OFFICE_LNG,
  };
}

export async function getOfficeLocation(): Promise<OfficeLocation> {
  const fallback = defaultOfficeLocation();
  try {
    const [row] = await db
      .select({
        officeLatitude: kpiSettingsTable.officeLatitude,
        officeLongitude: kpiSettingsTable.officeLongitude,
        officeLabel: kpiSettingsTable.officeLabel,
      })
      .from(kpiSettingsTable)
      .where(eq(kpiSettingsTable.id, 1))
      .limit(1);
    if (
      row &&
      row.officeLatitude != null &&
      row.officeLongitude != null &&
      Number.isFinite(row.officeLatitude) &&
      Number.isFinite(row.officeLongitude)
    ) {
      const stored = String(row.officeLabel || "").trim();
      const name = stored.split("·")[0]?.trim() || DEFAULT_OFFICE_NAME;
      const dms = stored.includes("·")
        ? stored.slice(stored.indexOf("·") + 1).trim()
        : stored && stored !== name
          ? stored
          : DEFAULT_OFFICE_DMS;
      return {
        name,
        dms: dms || DEFAULT_OFFICE_DMS,
        label: stored || `${name} · ${dms || DEFAULT_OFFICE_DMS}`,
        latitude: row.officeLatitude,
        longitude: row.officeLongitude,
      };
    }
  } catch (err) {
    console.warn("getOfficeLocation fallback:", err);
  }
  return fallback;
}

export async function saveOfficeLocation(opts: {
  coordinates: string;
  name?: string | null;
  userId?: number | null;
}): Promise<{ ok: true; office: OfficeLocation } | { ok: false; status: number; error: string }> {
  const gps = parseGpsText(opts.coordinates);
  if (!gps) {
    return {
      ok: false,
      status: 400,
      error: `Koordinata noto‘g‘ri. Namuna: ${DEFAULT_OFFICE_DMS}`,
    };
  }
  const name = String(opts.name || DEFAULT_OFFICE_NAME).trim() || DEFAULT_OFFICE_NAME;
  const dms = opts.coordinates.trim() || DEFAULT_OFFICE_DMS;
  const label = `${name} · ${dms}`;

  try {
    const [existing] = await db
      .select({ id: kpiSettingsTable.id })
      .from(kpiSettingsTable)
      .where(eq(kpiSettingsTable.id, 1))
      .limit(1);

    if (existing) {
      await db
        .update(kpiSettingsTable)
        .set({
          officeLatitude: gps.lat,
          officeLongitude: gps.lng,
          officeLabel: label,
          updatedById: opts.userId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(kpiSettingsTable.id, 1));
    } else {
      await db.insert(kpiSettingsTable).values({
        id: 1,
        officeLatitude: gps.lat,
        officeLongitude: gps.lng,
        officeLabel: label,
        updatedById: opts.userId ?? null,
      });
    }
  } catch (err) {
    console.error("saveOfficeLocation:", err);
    return { ok: false, status: 503, error: "Asosiy ofis saqlanmadi" };
  }

  return {
    ok: true,
    office: {
      name,
      dms,
      label,
      latitude: gps.lat,
      longitude: gps.lng,
    },
  };
}
