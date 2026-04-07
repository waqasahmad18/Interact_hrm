/**
 * Debug script to test leave cycle logic
 * Run: node scripts/debug-leave-cycle.js <employee_id>
 */

const mysql = require('mysql2/promise');

function toYmdLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseYmd(input) {
  if (!input) return null;

  if (typeof input === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(input.trim());
    if (m) {
      return {
        year: Number(m[1]),
        month: Number(m[2]),
        day: Number(m[3]),
      };
    }
    const parsed = new Date(input);
    if (Number.isNaN(parsed.getTime())) return null;
    return {
      year: parsed.getFullYear(),
      month: parsed.getMonth() + 1,
      day: parsed.getDate(),
    };
  }

  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return null;
    return {
      year: input.getFullYear(),
      month: input.getMonth() + 1,
      day: input.getDate(),
    };
  }

  return null;
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function normalizeAnniversaryDay(year, month, day) {
  if (month === 2 && day === 29 && !isLeapYear(year)) {
    return 28;
  }
  return day;
}

function buildYmd(year, month, day) {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function getLeaveCycleStartYmd(joinedDate, now = new Date()) {
  const joined = parseYmd(joinedDate);
  if (!joined) return null;

  const todayYmd = toYmdLocal(now);
  const thisYear = now.getFullYear();

  const thisYearDay = normalizeAnniversaryDay(thisYear, joined.month, joined.day);
  const annivThisYear = buildYmd(thisYear, joined.month, thisYearDay);

  const cycleYear = todayYmd >= annivThisYear ? thisYear : thisYear - 1;
  const cycleDay = normalizeAnniversaryDay(cycleYear, joined.month, joined.day);
  const cycleStart = buildYmd(cycleYear, joined.month, cycleDay);

  const joinedYmd = buildYmd(joined.year, joined.month, joined.day);
  return cycleStart < joinedYmd ? joinedYmd : cycleStart;
}

async function main() {
  const employeeId = process.argv[2];
  if (!employeeId) {
    console.log("Usage: node debug-leave-cycle.js <employee_id>");
    process.exit(1);
  }

  const dbConfig = {
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "hrm2",
  };

  if (process.platform === "linux") {
    dbConfig.socketPath = "/var/run/mysqld/mysqld.sock";
    delete dbConfig.host;
  }

  console.log("Database Config:", { ...dbConfig, password: "***" });
  console.log("");

  const conn = await mysql.createConnection(dbConfig);

  try {
    // Get employee and joined_date
    const [empRows] = await conn.execute(
      "SELECT id, employee_code FROM hrm_employees WHERE id = ?",
      [employeeId]
    );

    if (empRows.length === 0) {
      console.log(`Employee ${employeeId} not found`);
      process.exit(1);
    }

    const emp = empRows[0];
    console.log(`Employee: ${emp.employee_code} (ID: ${emp.id})`);

    const [jobRows] = await conn.execute(
      "SELECT joined_date, employment_status FROM employee_jobs WHERE employee_id = ?",
      [employeeId]
    );

    if (jobRows.length === 0) {
      console.log(`No job record for employee ${employeeId}`);
      process.exit(1);
    }

    const job = jobRows[0];
    console.log(`Joined Date (raw): ${job.joined_date}`);
    console.log(`Employment Status: ${job.employment_status}`);

    // Test cycle calculation
    const now = new Date();
    console.log("");
    console.log(`Today (LOCAL): ${toYmdLocal(now)}`);
    console.log(`Today (UTC): ${now.toISOString()}`);

    const cycleStart = getLeaveCycleStartYmd(job.joined_date, now);
    console.log(`Cycle Start: ${cycleStart}`);

    // Get leaves in current cycle
    const [leaves] = await conn.execute(
      "SELECT id, leave_category, total_days, start_date, status FROM employee_leaves WHERE employee_id = ? ORDER BY start_date DESC",
      [employeeId]
    );

    console.log("");
    console.log("All Leaves:");
    leaves.forEach((leave) => {
      const startDateStr = typeof leave.start_date === 'string' ? leave.start_date : leave.start_date.toISOString().substring(0, 10);
      const inCycle = cycleStart && startDateStr >= cycleStart ? "✓" : "✗";
      console.log(`  [${inCycle}] ${leave.leave_category} - ${leave.total_days} days on ${startDateStr} (${leave.status})`);
    });

    // Get approved leaves in cycle
    const [approvedLeaves] = await conn.execute(
      "SELECT leave_category, total_days FROM employee_leaves WHERE employee_id = ? AND status = 'approved' AND start_date >= ? ORDER BY start_date",
      [employeeId, cycleStart]
    );

    let annualUsed = 0;
    let bereavementUsed = 0;

    approvedLeaves.forEach((leave) => {
      if (leave.leave_category === "bereavement") {
        bereavementUsed += parseInt(leave.total_days);
      } else if (leave.leave_category === "annual" || leave.leave_category === "casual" || leave.leave_category === "sick") {
        annualUsed += parseInt(leave.total_days);
      }
    });

    console.log("");
    console.log("Leave Balance (Current Cycle Only):");
    console.log(`  Annual Used: ${annualUsed} days (Balance: ${20 - annualUsed}/20)`);
    console.log(`  Bereavement Used: ${bereavementUsed} days (Balance: ${3 - bereavementUsed}/3)`);

  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();
