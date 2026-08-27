import pg from "../../lib/db/node_modules/pg/lib/index.js";

/**
 * Apteka tarmog‘ida 25 ta filial mudiri bo‘lishini ta’minlaydi.
 * Mavjud mudirlarni saqlaydi, yetishmayotganlarini qo‘shadi.
 */
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const TARGET = 25;

const EXTRA_BRANCHES = [
  { location: "YUNUSOBOD-1", manager: "Karimova Dilbar" },
  { location: "YUNUSOBOD-2", manager: "Toshmatova Sevara" },
  { location: "CHILONZOR-1", manager: "Rahimova Malika" },
  { location: "CHILONZOR-2", manager: "Islomova Nodira" },
  { location: "SERGELI-1", manager: "Xasanova Gulnora" },
  { location: "SERGELI-2", manager: "Ergasheva Shahnoza" },
  { location: "MIRZO ULUGBEK", manager: "Abdullayeva Feruza" },
  { location: "YAKKASAROY", manager: "Sodiqova Madina" },
  { location: "OLMAZOR", manager: "Jo‘rayeva Dilfuza" },
  { location: "UCHTEPA", manager: "Normatova Zuhra" },
  { location: "BEKTEMIR", manager: "Alimova Nigora" },
  { location: "YASHNOBOD", manager: "Qodirova Laziza" },
  { location: "MIROBOD", manager: "Saidova Manzura" },
  { location: "SHAYXONTOHUR", manager: "Rustamova Dildora" },
  { location: "BOTANIKA", manager: "Mahmudova Sabohat" },
  { location: "QOYLIQ", manager: "Isoqova Mohira" },
  { location: "SAG‘BON", manager: "To‘xtayeva Gulchehra" },
  { location: "FARHOD", manager: "Nematova Barno" },
  { location: "QORAQAMISH-2", manager: "Xolmurodova Lola" },
  { location: "BERUNIY", manager: "Olimova Munisa" },
  { location: "DRUJBA", manager: "Shukurova Dilnoza" },
  { location: "NOVZA", manager: "Yuldasheva Zilola" },
  { location: "QUSHBEGI", manager: "Ibragimova Fotima" },
  { location: "SANOAT", manager: "G‘aniyeva Mohigul" },
  { location: "PARKENT YO‘LI", manager: "Boqieva Shahzoda" },
];

const STAFF_FIRST = ["Aziza", "Dilshod", "Nilufar", "Jasur", "Sevara", "Bekzod"];
const STAFF_LAST = ["Aliyev", "Karimov", "Rahimov", "Usmonova", "Sobirov", "Xolmatov"];

try {
  const { rows: depts } = await pool.query(`SELECT id FROM departments ORDER BY id LIMIT 1`);
  let departmentId = depts[0]?.id;
  if (!departmentId) {
    const inserted = await pool.query(
      `INSERT INTO departments (name) VALUES ('Aptekalar tarmog‘i') RETURNING id`,
    );
    departmentId = inserted.rows[0].id;
  }

  let { rows: coords } = await pool.query(
    `SELECT id FROM employees WHERE org_role = 'coordinator' ORDER BY id LIMIT 1`,
  );
  let coordinatorId = coords[0]?.id;
  if (!coordinatorId) {
    const hiredAt = new Date().toISOString().slice(0, 10);
    const coord = await pool.query(
      `INSERT INTO employees (full_name, position, department_id, hired_at, org_role, location, shift_type, employment_status)
       VALUES ($1, $2, $3, $4, 'coordinator', 'Markaziy ofis', 'one', 'working')
       RETURNING id`,
      ["Aziza", "Koordinator", departmentId, hiredAt],
    );
    coordinatorId = coord.rows[0].id;
    console.log("+ coordinator Aziza");
  }

  const { rows: managers } = await pool.query(
    `SELECT id, full_name, location FROM employees WHERE org_role = 'manager' ORDER BY id`,
  );
  console.log(`Existing managers: ${managers.length}`);

  const usedLocations = new Set(
    managers.map((m) => (m.location || "").trim().toLowerCase()).filter(Boolean),
  );
  const usedNames = new Set(managers.map((m) => m.full_name.trim().toLowerCase()));

  const hiredAt = new Date().toISOString().slice(0, 10);
  let added = 0;
  let i = 0;

  while (managers.length + added < TARGET && i < EXTRA_BRANCHES.length * 2) {
    const base = EXTRA_BRANCHES[i % EXTRA_BRANCHES.length];
    const suffix = i >= EXTRA_BRANCHES.length ? `-${Math.floor(i / EXTRA_BRANCHES.length) + 1}` : "";
    const location = `${base.location}${suffix}`;
    const managerName = suffix ? `${base.manager} ${suffix.replace("-", "")}` : base.manager;
    i += 1;

    if (usedLocations.has(location.toLowerCase()) || usedNames.has(managerName.toLowerCase())) {
      continue;
    }

    const mgr = await pool.query(
      `INSERT INTO employees
         (full_name, position, department_id, hired_at, org_role, reports_to_id, location, shift_type, employment_status)
       VALUES ($1, $2, $3, $4, 'manager', $5, $6, 'one', 'working')
       RETURNING id`,
      [managerName, "Mudir (zav.aptek)", departmentId, hiredAt, coordinatorId, location],
    );
    const managerId = mgr.rows[0].id;
    usedLocations.add(location.toLowerCase());
    usedNames.add(managerName.toLowerCase());
    added += 1;

    // Har filialga 2 ta farmatsevt
    for (let s = 0; s < 2; s++) {
      const name = `${STAFF_LAST[(added + s) % STAFF_LAST.length]} ${STAFF_FIRST[(added * 2 + s) % STAFF_FIRST.length]}`;
      const shift = s === 0 ? "one" : "two";
      await pool.query(
        `INSERT INTO employees
           (full_name, position, department_id, hired_at, org_role, reports_to_id, location, shift_type, employment_status)
         VALUES ($1, $2, $3, $4, 'pharmacist', $5, $6, $7, 'working')`,
        [name, "Farmatsevt", departmentId, hiredAt, managerId, location, shift],
      );
    }
    console.log(`+ ${location} — ${managerName}`);
  }

  const { rows: finalCount } = await pool.query(
    `SELECT count(*)::int AS c FROM employees WHERE org_role = 'manager'`,
  );
  console.log(`Done. Managers now: ${finalCount[0].c} (added ${added})`);
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await pool.end();
}
