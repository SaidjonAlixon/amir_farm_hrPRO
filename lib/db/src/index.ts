import { drizzle } from "drizzle-orm/node-postgres";
import dns from "node:dns";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

/** Neon `channel_binding=require` node-pg / Vercel’da FUNCTION_INVOCATION_FAILED beradi */
function sanitizeDatabaseUrl(raw: string): string {
  try {
    const u = new URL(raw.replace(/^postgresql:/i, "http:"));
    u.searchParams.delete("channel_binding");
    if (!u.searchParams.get("sslmode")) u.searchParams.set("sslmode", "require");
    const auth = u.username
      ? `${encodeURIComponent(u.username)}:${encodeURIComponent(u.password)}@`
      : "";
    return `postgresql://${auth}${u.host}${u.pathname}${u.search}`;
  } catch {
    return raw.replace(/([?&])channel_binding=require&?/gi, "$1").replace(/\?&/, "?").replace(/\?$/, "");
  }
}

const connectionString = sanitizeDatabaseUrl(process.env.DATABASE_URL);
const isLocal =
  /localhost|127\.0\.0\.1/i.test(connectionString) ||
  connectionString.includes("sslmode=disable");
const isRailway = /rlwy\.net|railway/i.test(connectionString);
const isPooler = /pooler/i.test(connectionString);

/** Router DNS sometimes cannot resolve Railway proxy hosts; Google/Cloudflare can. */
const publicResolver = new dns.Resolver();
publicResolver.setServers(["8.8.8.8", "1.1.1.1"]);

function lookupWithDnsFallback(
  hostname: string,
  options: dns.LookupOneOptions | number | ((err: NodeJS.ErrnoException | null, address: string, family: number) => void),
  callback?: (err: NodeJS.ErrnoException | null, address: string, family: number) => void,
) {
  const cb =
    typeof options === "function" ? options : callback;
  const opts = typeof options === "object" ? options : { family: 4 };
  if (!cb) return;
  dns.lookup(hostname, opts, (err, address, family) => {
    if (!err && address) {
      cb(null, address, family);
      return;
    }
    publicResolver.resolve4(hostname, (resolveErr, addresses) => {
      if (resolveErr || !addresses?.[0]) {
        cb(err ?? resolveErr ?? new Error("DNS lookup failed"), "", 4);
        return;
      }
      cb(null, addresses[0], 4);
    });
  });
}

/** `pg` typings ba’zi versiyalarda `lookup` ni `PoolConfig`da ko‘rsatmaydi */
type PoolConfigWithLookup = pg.PoolConfig & {
  lookup?: typeof lookupWithDnsFallback;
};

const poolConfig: PoolConfigWithLookup = {
  connectionString,
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
  max: process.env.VERCEL ? 2 : 8,
  connectionTimeoutMillis: process.env.VERCEL ? 8_000 : 12_000,
  idleTimeoutMillis: process.env.VERCEL ? 4_000 : 20_000,
  allowExitOnIdle: true,
};

// Railway proxy DNS fallback — Neon’da Vercel lookup hooki yiqilishi mumkin
if (isRailway) {
  poolConfig.lookup = lookupWithDnsFallback;
}

// PgBouncer (Neon pooler) startup `options` ni yoqtirmaydi
if (!isPooler && !process.env.VERCEL) {
  poolConfig.options = "-c statement_timeout=30000";
}

export const pool = new Pool(poolConfig);

export const db = drizzle(pool, { schema });

export * from "./schema";
