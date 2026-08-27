import { pgTable, text, serial, timestamp, integer, bigint, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";

/** Face ID / Windows Hello / Touch ID (WebAuthn passkey) */
export const webauthnCredentialsTable = pgTable(
  "webauthn_credentials",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    /** base64url credential id */
    credentialId: text("credential_id").notNull(),
    /** base64url COSE public key */
    publicKey: text("public_key").notNull(),
    counter: bigint("counter", { mode: "number" }).notNull().default(0),
    deviceType: text("device_type"),
    backedUp: boolean("backed_up").notNull().default(false),
    transports: text("transports"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("webauthn_credentials_cred_uidx").on(t.credentialId),
    index("webauthn_credentials_user_idx").on(t.userId),
  ],
);

export const webauthnChallengesTable = pgTable(
  "webauthn_challenges",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id"),
    challenge: text("challenge").notNull(),
    kind: text("kind").notNull(), // register | login
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("webauthn_challenges_challenge_idx").on(t.challenge)],
);
