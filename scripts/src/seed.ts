import { eq } from "drizzle-orm";
import { db, departmentsTable, usersTable } from "@workspace/db";

const departments = [
  { name: "Rekruting" },
  { name: "HR" },
  { name: "Trening" },
  { name: "Farmatsiya" },
  { name: "Farmasevt" },
  { name: "Laboratoriya" },
];

const users = [
  { fullName: "System Admin", role: "admin", login: "admin", password: "admin123", phone: "+998901000001" },
  { fullName: "Aziza Recruiter", role: "recruiter", login: "recruiter1", password: "pass123", phone: "+998901000002", dept: "Rekruting" },
  { fullName: "Dilnoza HR", role: "hr", login: "hr1", password: "pass123", phone: "+998901000003", dept: "HR" },
  { fullName: "Jasur Trener", role: "trainer", login: "trainer1", password: "pass123", phone: "+998901000004", dept: "Trening" },
  { fullName: "Bahodir Direktor", role: "director", login: "director1", password: "pass123", phone: "+998901000005" },
  { fullName: "Madina Bo'lim boshlig'i", role: "department_head", login: "dept_head1", password: "pass123", phone: "+998901000006", dept: "Farmatsiya" },
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
