import { eq } from "drizzle-orm";
import { db, departmentsTable, usersTable } from "@workspace/db";

const departments = [
  { name: "HR" },
  { name: "Farmatsiya" },
  { name: "Farmasevt" },
];

const users = [
  { fullName: "System Admin", role: "admin", login: "admin", password: "admin123", phone: "+998901000001" },
  { fullName: "Bahodir Direktor", role: "director", login: "director1", password: "pass123", phone: "+998901000005" },
  { fullName: "Nilufar Koordinator", role: "koordinator", login: "koordinator1", password: "pass123", phone: "+998901000008", dept: "Farmatsiya" },
  { fullName: "HR Direktor", role: "hr_direktor", login: "hrdirektor1", password: "pass123", phone: "+998901000013", dept: "HR" },
  { fullName: "HR Menejer", role: "hr_menejer", login: "hrmenejer1", password: "pass123", phone: "+998901000014", dept: "HR" },
  { fullName: "Sardor Mudir", role: "mudir", login: "mudir1", password: "pass123", phone: "+998901000007", dept: "Farmasevt" },
  { fullName: "Dilshod Farmasevt", role: "farmasevt", login: "farmasevt1", password: "pass123", phone: "+998901000011", dept: "Farmasevt" },
  { fullName: "Malika Stajyor", role: "stajyor", login: "stajyor1", password: "pass123", phone: "+998901000012", dept: "Farmasevt" },
];

async function main() {
  console.log("Seeding departments...");
  const deptMap = new Map<string, number>();

  for (const d of departments) {
    const [existing] = await db
      .select()
      .from(departmentsTable)
      .where(eq(departmentsTable.name, d.name));
    if (existing) {
      deptMap.set(d.name, existing.id);
      continue;
    }
    const [row] = await db.insert(departmentsTable).values(d).returning();
    deptMap.set(d.name, row.id);
  }

  console.log("Seeding users...");
  for (const u of users) {
    const [existing] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.login, u.login));
    if (existing) {
      console.log(`  skip ${u.login}`);
      continue;
    }
    await db.insert(usersTable).values({
      fullName: u.fullName,
      role: u.role,
      login: u.login,
      password: u.password,
      phone: u.phone,
      status: "active",
      departmentId: u.dept ? deptMap.get(u.dept) ?? null : null,
    });
    console.log(`  + ${u.login}`);
  }

  console.log("Seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
