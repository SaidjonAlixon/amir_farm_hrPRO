/** DMS / decimal GPS matnini tahlil qiladi. Namuna: 41°18'23.3"N 69°18'28.0"E */

function toNum(v: string): number {
  return Number(String(v).replace(",", "."));
}

function dmsToDecimal(deg: number, min: number, sec: number, hemi?: string): number {
  let v = Math.abs(deg) + min / 60 + sec / 3600;
  const h = (hemi || "").toUpperCase();
  if (h === "S" || h === "W" || h === "Ю" || h === "З") v = -v;
  if (deg < 0) v = -Math.abs(v);
  return v;
}

export function parseGpsText(raw: string): { lat: number; lng: number } | null {
  const s = String(raw || "")
    .trim()
    .replace(/\u00a0/g, " ")
    .replace(/[′’ʻ`]/g, "'")
    .replace(/[″“”«»]/g, '"')
    .replace(/[˚º]/g, "°");
  if (!s) return null;

  const dms =
    /(\d{1,3})\s*°\s*(\d{1,2})\s*'?\s*(\d{1,2}(?:[.,]\d+)?)?\s*"?\s*([NSnsСсЮю])?[,;\s]+(\d{1,3})\s*°\s*(\d{1,2})\s*'?\s*(\d{1,2}(?:[.,]\d+)?)?\s*"?\s*([EWewВвЗз])?/;
  const m = s.match(dms);
  if (m) {
    const lat = dmsToDecimal(toNum(m[1]!), toNum(m[2]!), toNum(m[3] || "0"), m[4]);
    const lng = dmsToDecimal(toNum(m[5]!), toNum(m[6]!), toNum(m[7] || "0"), m[8]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng };
    }
  }

  const dec = /(-?\d{1,3}(?:[.,]\d+))\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+))/;
  const d = s.match(dec);
  if (d) {
    const lat = toNum(d[1]!);
    const lng = toNum(d[2]!);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng };
    }
  }
  return null;
}

const GPS_SUFFIX = /\s*\|gps:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\s*$/i;

export function stripGpsSuffix(location: string | null | undefined): string {
  return String(location || "").replace(GPS_SUFFIX, "").trim();
}

const BRANCH_NAME_FIX: Record<string, string> = {
  азия: "ТАШСЕЛМАШ",
  азія: "ТАШСЕЛМАШ",
  azia: "ТАШСЕЛМАШ",
  asia: "ТАШСЕЛМАШ",
};

export function displayBranchName(location: string | null | undefined): string {
  const raw = stripGpsSuffix(location);
  return BRANCH_NAME_FIX[raw.toLowerCase()] || raw;
}

export function gpsFromLocationField(
  location: string | null | undefined,
): { lat: number; lng: number } | null {
  const m = String(location || "").match(GPS_SUFFIX);
  if (m) {
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return parseGpsText(stripGpsSuffix(location));
}

export function withGpsSuffix(
  name: string | null | undefined,
  lat: number,
  lng: number,
): string {
  const base = displayBranchName(name);
  const label = !base || base === "Filial" ? "Filial" : base;
  return `${label} |gps:${lat.toFixed(6)},${lng.toFixed(6)}`;
}

function pickName(addr: Record<string, string> | undefined, displayName?: string): string {
  if (addr) {
    const parts = [
      addr.industrial,
      addr.suburb,
      addr.neighbourhood,
      addr.quarter,
      addr.city_district,
      addr.village,
      addr.town,
      addr.hamlet,
      addr.road,
    ].filter(Boolean);
    const city = addr.city || addr.town || addr.county || addr.state;
    if (parts[0]) {
      const name = parts[0];
      if (city && !name.toLowerCase().includes(city.toLowerCase())) return `${name}, ${city}`;
      return name;
    }
    if (city) return city;
  }
  if (displayName) {
    return displayName.split(",").slice(0, 2).join(",").trim();
  }
  return "Filial";
}

export async function reverseGeocodeName(lat: number, lng: number): Promise<string> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}&format=json&zoom=16&addressdetails=1&accept-language=uz,ru,en`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "VaksinaHR/1.0 (branch-location)",
      },
    });
    if (!res.ok) return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    const body = (await res.json()) as {
      display_name?: string;
      address?: Record<string, string>;
    };
    return pickName(body.address, body.display_name);
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } finally {
    clearTimeout(t);
  }
}
