import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const migrateSql = `
ALTER TABLE employees ADD COLUMN IF NOT EXISTS org_role TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS reports_to_id INTEGER;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS shift_type TEXT DEFAULT 'one';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS shift_label TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS photo_url TEXT;
`;

const branches = [
  {
    location: "1-GOR BANISA",
    manager: "Fayziyeva Zabarjad",
    staff: [
      { name: "Qo'ldosheva Nigora", shift: "one" },
      { name: "Abdulayeva Baxtiyor", shift: "two" },
    ],
  },
  {
    location: "GOR-2 BANISA",
    manager: "Nabiyeva Gulchexra",
    staff: [
      { name: "Rustamov Mirmahmud", shift: "one" },
      { name: "Zayniddinov Sadriddin", shift: "two" },
    ],
  },
  {
    location: "FARM LYUKS",
    manager: "Isayeva Dilfuza",
    staff: [
      { name: "Tursunov Zafar", shift: "one" },
      { name: "Muzaffarov Muhammadjon", shift: "custom", label: "Navbatchi" },
    ],
  },
  {
    location: "TASHMI-1",
    manager: "Saidvaliyeva Marxabo",
    staff: [
      { name: "Karimova Dilnoza", shift: "one" },
      { name: "Usmonov Bekzod", shift: "two" },
    ],
  },
  {
    location: "TASHMI-2",
    manager: "Usmonova Nozima",
    staff: [
      { name: "Aliyeva Madina", shift: "one" },
      { name: "Rahimov Jasur", shift: "custom", label: "O'qish kuni" },
    ],
  },
  {
    location: "QORA QAMISH",
    manager: "Nuriddinova Nargiza",
    staff: [
      { name: "Sobirova Sevara", shift: "two" },
      { name: "Xolmatov Anvar", shift: "one" },
    ],
  },
];

try {
  await pool.query(migrateSql);
  console.log("OK: employee org columns added");

  const { rows: depts } = await pool.query(`SELECT id FROM departments ORDER BY id LIMIT 1`);
  let departmentId = depts[0]?.id;
  if (!departmentId) {
    const inserted = await pool.query(
      `INSERT INTO departments (name) VALUES ($1) RETURNING id`,
      ["Aptekalar tarmogi"],
    );
    departmentId = inserted.rows[0].id;
  }

  const { rows: existing } = await pool.query(
    `SELECT id FROM employees WHERE org_role = 'coordinator' LIMIT 1`,
  );
  if (existing.length > 0) {
    console.log("OK: org chart already seeded, skip");
  } else {
    const hiredAt = new Date().toISOString().slice(0, 10);
    const coord = await pool.query(
      `INSERT INTO employees (full_name, position, department_id, hired_at, org_role, location, shift_type)
       VALUES ($1, $2, $3, $4, 'coordinator', 'Markaziy ofis', 'one')
       RETURNING id`,
      ["Aziza", "Koordinator", departmentId, hiredAt],
    );
    const coordinatorId = coord.rows[0].id;

    for (const branch of branches) {
      const mgr = await pool.query(
        `INSERT INTO employees (full_name, position, department_id, hired_at, org_role, reports_to_id, location, shift_type)
         VALUES ($1, $2, $3, $4, 'manager', $5, $6, 'one')
         RETURNING id`,
        [branch.manager, "Mudir (zav.aptek)", departmentId, hiredAt, coordinatorId, branch.location],
      );
      const managerId = mgr.rows[0].id;

      for (const person of branch.staff) {
        await pool.query(
          `INSERT INTO employees (full_name, position, department_id, hired_at, org_role, reports_to_id, location, shift_type, shift_label)
           VALUES ($1, $2, $3, $4, 'pharmacist', $5, $6, $7, $8)`,
          [
            person.name,
            "Farmatsevt",
            departmentId,
            hiredAt,
            managerId,
            branch.location,
            person.shift,
            person.label ?? null,
          ],
        );
      }
    }
    console.log("OK: pharmacy org chart seeded");
  }
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await pool.end();
}
