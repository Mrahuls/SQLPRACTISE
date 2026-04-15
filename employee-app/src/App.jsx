import { useEffect, useMemo, useRef, useState } from "react";

// =========================
// DATA
// =========================
const employees = [
  { emp_id: 1, name: "Rahul", dept_id: 10, salary: 50000 },
  { emp_id: 2, name: "Anita", dept_id: 20, salary: 60000 },
  { emp_id: 3, name: "Suresh", dept_id: 10, salary: 40000 },
  { emp_id: 4, name: "Meena", dept_id: 30, salary: 70000 },
  { emp_id: 5, name: "Kiran", dept_id: 20, salary: 55000 },
  { emp_id: 6, name: "Divya", dept_id: 30, salary: 65000 },
  { emp_id: 7, name: "Asha", dept_id: 10, salary: 45000 },
  { emp_id: 8, name: "Vikram", dept_id: 20, salary: 52000 },
  { emp_id: 9, name: "Neha", dept_id: 30, salary: 48000 },
  { emp_id: 10, name: "Arun", dept_id: 10, salary: 72000 },
];

const departments = [
  { dept_id: 10, dept_name: "IT" },
  { dept_id: 20, dept_name: "HR" },
  { dept_id: 30, dept_name: "FINANCE" },
];

const joinedEmployees = employees.map((e) => ({
  ...e,
  dept_name: departments.find((d) => d.dept_id === e.dept_id)?.dept_name || null,
}));

// =========================
// UTILITIES
// =========================
function deepClone(x) {
  return JSON.parse(JSON.stringify(x));
}

function normalizeRows(rows, ordered) {
  const mapped = rows.map((row) => {
    const obj = {};
    Object.keys(row)
      .sort()
      .forEach((k) => {
        obj[k.toLowerCase()] = row[k];
      });
    return obj;
  });
  if (ordered) return mapped;
  return mapped.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function rowsEqual(actual, expected, ordered = false) {
  const a = normalizeRows(actual, ordered);
  const b = normalizeRows(expected, ordered);
  return JSON.stringify(a) === JSON.stringify(b);
}

function safeLower(v) {
  return String(v || "").toLowerCase();
}

function projectRows(rows, selectClause) {
  const cleaned = selectClause.trim();
  if (!cleaned || cleaned === "*") return rows;

  if (cleaned === "distinct dept_id") {
    const seen = new Set();
    return rows
      .filter((r) => {
        const key = r.dept_id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((r) => ({ dept_id: r.dept_id }));
  }

  if (cleaned === "distinct dept_name") {
    const seen = new Set();
    return rows
      .filter((r) => {
        const key = r.dept_name;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((r) => ({ dept_name: r.dept_name }));
  }

  const cols = cleaned
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  return rows.map((r) => {
    const out = {};
    cols.forEach((c) => {
      const token = c
        .replace(/\be\./g, "")
        .replace(/\bd\./g, "")
        .replace(/\bas\s+\w+/g, "")
        .trim();
      const aliasMatch = c.match(/as\s+(\w+)/i);
      const outKey = aliasMatch ? aliasMatch[1] : token;
      if (token in r) out[outKey] = r[token];
    });
    return out;
  });
}

function sortRows(rows, column, direction = "asc") {
  const sorted = [...rows].sort((a, b) => {
    const av = a[column];
    const bv = b[column];
    if (typeof av === "number" && typeof bv === "number") return av - bv;
    return String(av).localeCompare(String(bv));
  });
  return direction === "desc" ? sorted.reverse() : sorted;
}

// =========================
// LIGHTWEIGHT SQL ENGINE
// =========================
function executeSQL(sql) {
  const raw = String(sql || "").trim();
  if (!raw) return [];
  const q = raw.replace(/;$/, "").toLowerCase();
  if (!q.startsWith("select")) {
    throw new Error("Only SELECT statements are supported.");
  }

  const selectMatch = q.match(/^select\s+(.+?)\s+from\s+/i);
  if (!selectMatch) throw new Error("Unable to parse SELECT clause.");
  const selectClause = selectMatch[1].trim();

  let rows;
  if (q.includes("from employees") && q.includes("join departments")) {
    rows = deepClone(joinedEmployees);
  } else if (q.includes("from departments")) {
    rows = deepClone(departments);
  } else if (q.includes("from employees")) {
    rows = deepClone(employees);
  } else {
    throw new Error("Only EMPLOYEES and DEPARTMENTS tables are available.");
  }

  const wherePart = (q.match(/where\s+(.+?)(group by|order by|fetch first|$)/i) || [])[1];
  if (wherePart) {
    const conditions = wherePart.split(/\s+and\s+/i).map((s) => s.trim());
    conditions.forEach((cond) => {
      let m;
      if ((m = cond.match(/salary\s*>\s*(\d+)/i))) rows = rows.filter((r) => r.salary > Number(m[1]));
      else if ((m = cond.match(/salary\s*>=\s*(\d+)/i))) rows = rows.filter((r) => r.salary >= Number(m[1]));
      else if ((m = cond.match(/salary\s*<\s*(\d+)/i))) rows = rows.filter((r) => r.salary < Number(m[1]));
      else if ((m = cond.match(/salary\s*<=\s*(\d+)/i))) rows = rows.filter((r) => r.salary <= Number(m[1]));
      else if ((m = cond.match(/dept_id\s*=\s*(\d+)/i))) rows = rows.filter((r) => r.dept_id === Number(m[1]));
      else if ((m = cond.match(/dept_name\s*=\s*'([^']+)'/i))) rows = rows.filter((r) => safeLower(r.dept_name) === safeLower(m[1]));
      else if ((m = cond.match(/name\s*=\s*'([^']+)'/i))) rows = rows.filter((r) => safeLower(r.name) === safeLower(m[1]));
      else throw new Error(`Unsupported WHERE condition: ${cond}`);
    });
  }

  if (q.includes("count(*)") && !q.includes("group by")) return [{ count: rows.length }];
  if (q.includes("avg(salary)") && !q.includes("group by")) {
    return [{ avg_salary: Math.round(rows.reduce((a, b) => a + b.salary, 0) / rows.length) }];
  }
  if (q.includes("sum(salary)") && !q.includes("group by")) return [{ sum_salary: rows.reduce((a, b) => a + b.salary, 0) }];
  if (q.includes("max(salary)") && !q.includes("group by")) return [{ max_salary: Math.max(...rows.map((r) => r.salary)) }];
  if (q.includes("min(salary)") && !q.includes("group by")) return [{ min_salary: Math.min(...rows.map((r) => r.salary)) }];

  const groupByMatch = q.match(/group by\s+(dept_id|dept_name)/i);
  if (groupByMatch) {
    const key = groupByMatch[1].toLowerCase();
    const bucket = {};
    rows.forEach((r) => {
      const groupVal = r[key];
      if (!bucket[groupVal]) bucket[groupVal] = [];
      bucket[groupVal].push(r);
    });
    rows = Object.entries(bucket).map(([groupVal, items]) => {
      const out = {};
      out[key] = key === "dept_id" ? Number(groupVal) : groupVal;
      if (q.includes("count(*)")) out.employee_count = items.length;
      if (q.includes("avg(salary)")) out.avg_salary = Math.round(items.reduce((a, b) => a + b.salary, 0) / items.length);
      if (q.includes("sum(salary)")) out.sum_salary = items.reduce((a, b) => a + b.salary, 0);
      if (q.includes("max(salary)")) out.max_salary = Math.max(...items.map((x) => x.salary));
      if (q.includes("min(salary)")) out.min_salary = Math.min(...items.map((x) => x.salary));
      return out;
    });
    const orderGroup = q.match(/order by\s+(dept_id|dept_name|employee_count|avg_salary|max_salary|min_salary|sum_salary)\s*(desc|asc)?/i);
    if (orderGroup) rows = sortRows(rows, orderGroup[1], (orderGroup[2] || "asc").toLowerCase());
    return rows;
  }

  rows = projectRows(rows, selectClause);

  const orderMatch = q.match(/order by\s+(emp_id|name|dept_id|dept_name|salary)\s*(desc|asc)?/i);
  if (orderMatch) rows = sortRows(rows, orderMatch[1], (orderMatch[2] || "asc").toLowerCase());

  const fetchMatch = q.match(/fetch first\s+(\d+)\s+rows only/i);
  if (fetchMatch) rows = rows.slice(0, Number(fetchMatch[1]));

  return rows;
}

// =========================
// QUESTION BANK (100)
// =========================
function createQuestions() {
  const qs = [];
  let id = 1;
  const pushQ = (phase, difficulty, title, description, canonicalSql, compareMode = "set", hint = "") => {
    const expected = executeSQL(canonicalSql);
    qs.push({
      id: id++,
      phase,
      difficulty,
      title,
      description,
      hint,
      canonicalSql,
      compareMode,
      schema: ["employees(emp_id, name, dept_id, salary)", "departments(dept_id, dept_name)"],
      tests: [
        {
          name: "Canonical expected output",
          expected,
          description: "This is the expected result for the sample SQL solution.",
        },
      ],
    });
  };

  pushQ("Basics", "Very Easy", "List all employees", "Return every row and column from EMPLOYEES.", "SELECT * FROM employees", "set", "Use SELECT *.");
  pushQ("Basics", "Very Easy", "List all departments", "Return every row and column from DEPARTMENTS.", "SELECT * FROM departments", "set");
  pushQ("Basics", "Very Easy", "Employee names only", "Show only employee names.", "SELECT name FROM employees", "set");
  pushQ("Basics", "Very Easy", "Department names only", "Show only department names.", "SELECT dept_name FROM departments", "set");
  pushQ("Basics", "Very Easy", "Employee id and salary", "Display employee id with salary.", "SELECT emp_id, salary FROM employees", "set");
  pushQ("Basics", "Very Easy", "Distinct department ids", "List unique department ids from employees.", "SELECT DISTINCT dept_id FROM employees ORDER BY dept_id", "ordered");
  pushQ("Basics", "Very Easy", "Distinct department names", "List unique department names.", "SELECT DISTINCT dept_name FROM employees JOIN departments ON employees.dept_id = departments.dept_id ORDER BY dept_name", "ordered");
  pushQ("Basics", "Easy", "Order employees by emp_id", "Show all employees sorted by emp_id ascending.", "SELECT * FROM employees ORDER BY emp_id", "ordered");
  pushQ("Basics", "Easy", "Order employees by name", "Show employee names sorted alphabetically.", "SELECT name FROM employees ORDER BY name", "ordered");
  pushQ("Basics", "Easy", "Highest paid employee row", "Show the top salaried employee.", "SELECT * FROM employees ORDER BY salary DESC FETCH FIRST 1 ROWS ONLY", "ordered");
  pushQ("Basics", "Easy", "Lowest salary row", "Show the lowest salaried employee.", "SELECT * FROM employees ORDER BY salary ASC FETCH FIRST 1 ROWS ONLY", "ordered");
  pushQ("Basics", "Easy", "Top 3 salaries", "Show top 3 employees by salary.", "SELECT * FROM employees ORDER BY salary DESC FETCH FIRST 3 ROWS ONLY", "ordered");
  pushQ("Basics", "Easy", "Bottom 2 salaries", "Show bottom 2 employees by salary.", "SELECT * FROM employees ORDER BY salary ASC FETCH FIRST 2 ROWS ONLY", "ordered");
  pushQ("Basics", "Easy", "Sort names descending", "Show employee names in descending order.", "SELECT name FROM employees ORDER BY name DESC", "ordered");
  pushQ("Basics", "Easy", "Sort departments descending", "Show department names in descending order.", "SELECT dept_name FROM departments ORDER BY dept_name DESC", "ordered");

  [40000, 45000, 50000, 55000, 60000].forEach((n) => pushQ("Filtering", n >= 55000 ? "Medium" : "Easy", `Salary greater than ${n}`, `List employees whose salary is greater than ${n}.`, `SELECT * FROM employees WHERE salary > ${n} ORDER BY emp_id`, "ordered"));
  [45000, 50000, 60000].forEach((n) => pushQ("Filtering", "Easy", `Salary greater than or equal to ${n}`, `Return employees with salary >= ${n}.`, `SELECT * FROM employees WHERE salary >= ${n} ORDER BY emp_id`, "ordered"));
  [45000, 50000, 55000].forEach((n) => pushQ("Filtering", "Easy", `Salary less than ${n}`, `Return employees with salary < ${n}.`, `SELECT * FROM employees WHERE salary < ${n} ORDER BY emp_id`, "ordered"));
  [10, 20, 30].forEach((d) => pushQ("Filtering", "Easy", `Employees in dept ${d}`, `List employees whose dept_id = ${d}.`, `SELECT * FROM employees WHERE dept_id = ${d} ORDER BY emp_id`, "ordered"));
  ["Rahul", "Anita", "Meena", "Arun"].forEach((name) => pushQ("Filtering", "Easy", `${name} record`, `Find the employee named '${name}'.`, `SELECT * FROM employees WHERE name = '${name}'`, "set"));
  pushQ("Filtering", "Medium", "Dept 10 and salary > 45000", "List employees from dept 10 earning more than 45000.", "SELECT * FROM employees WHERE dept_id = 10 AND salary > 45000 ORDER BY emp_id", "ordered");
  pushQ("Filtering", "Medium", "Dept 20 and salary > 50000", "List employees from dept 20 earning more than 50000.", "SELECT * FROM employees WHERE dept_id = 20 AND salary > 50000 ORDER BY emp_id", "ordered");
  pushQ("Filtering", "Medium", "Dept 30 and salary >= 65000", "List employees from dept 30 earning at least 65000.", "SELECT * FROM employees WHERE dept_id = 30 AND salary >= 65000 ORDER BY emp_id", "ordered");
  pushQ("Filtering", "Medium", "IT employees using JOIN", "List employees who belong to the IT department using a join.", "SELECT * FROM employees JOIN departments ON employees.dept_id = departments.dept_id WHERE dept_name = 'IT' ORDER BY emp_id", "ordered");
  pushQ("Filtering", "Medium", "HR employees using JOIN", "List employees who belong to the HR department using a join.", "SELECT * FROM employees JOIN departments ON employees.dept_id = departments.dept_id WHERE dept_name = 'HR' ORDER BY emp_id", "ordered");
  pushQ("Filtering", "Medium", "FINANCE employees using JOIN", "List employees who belong to the FINANCE department using a join.", "SELECT * FROM employees JOIN departments ON employees.dept_id = departments.dept_id WHERE dept_name = 'FINANCE' ORDER BY emp_id", "ordered");

  pushQ("Sorting", "Easy", "All employees by salary asc", "Sort all employees by salary ascending.", "SELECT * FROM employees ORDER BY salary ASC", "ordered");
  pushQ("Sorting", "Easy", "All employees by salary desc", "Sort all employees by salary descending.", "SELECT * FROM employees ORDER BY salary DESC", "ordered");
  pushQ("Sorting", "Easy", "Names by salary desc", "Show name and salary sorted by salary descending.", "SELECT name, salary FROM employees ORDER BY salary DESC", "ordered");
  pushQ("Sorting", "Easy", "Dept ids descending", "Show dept_id sorted descending from employees.", "SELECT dept_id FROM employees ORDER BY dept_id DESC", "ordered");
  pushQ("Sorting", "Easy", "Department names asc", "Sort departments alphabetically.", "SELECT dept_name FROM departments ORDER BY dept_name ASC", "ordered");
  pushQ("Sorting", "Medium", "Top 5 by salary", "Return top five employees ordered by highest salary.", "SELECT * FROM employees ORDER BY salary DESC FETCH FIRST 5 ROWS ONLY", "ordered");
  pushQ("Sorting", "Medium", "Top 4 names by salary", "Return top four employee names ordered by salary descending.", "SELECT name FROM employees ORDER BY salary DESC FETCH FIRST 4 ROWS ONLY", "ordered");
  pushQ("Sorting", "Medium", "Bottom 3 by salary", "Return bottom three employees ordered by salary ascending.", "SELECT * FROM employees ORDER BY salary ASC FETCH FIRST 3 ROWS ONLY", "ordered");
  pushQ("Sorting", "Medium", "Top 2 names alphabetically", "Return first two names alphabetically.", "SELECT name FROM employees ORDER BY name ASC FETCH FIRST 2 ROWS ONLY", "ordered");
  pushQ("Sorting", "Medium", "Highest salary names only", "Return the name of the highest paid employee.", "SELECT name FROM employees ORDER BY salary DESC FETCH FIRST 1 ROWS ONLY", "ordered");
  pushQ("Sorting", "Medium", "Lowest salary names only", "Return the name of the lowest paid employee.", "SELECT name FROM employees ORDER BY salary ASC FETCH FIRST 1 ROWS ONLY", "ordered");
  pushQ("Sorting", "Medium", "Top 3 dept ids by salary", "Return dept_id for top 3 highest salary rows.", "SELECT dept_id FROM employees ORDER BY salary DESC FETCH FIRST 3 ROWS ONLY", "ordered");
  pushQ("Sorting", "Medium", "Order joined rows by dept_name", "Show employee names with department names sorted by department name.", "SELECT name, dept_name FROM employees JOIN departments ON employees.dept_id = departments.dept_id ORDER BY dept_name ASC", "ordered");
  pushQ("Sorting", "Medium", "Order joined rows by name desc", "Show employee names with department names sorted by employee name descending.", "SELECT name, dept_name FROM employees JOIN departments ON employees.dept_id = departments.dept_id ORDER BY name DESC", "ordered");
  pushQ("Sorting", "Medium", "Top 2 joined rows by salary", "Show top two employee name + department name rows by salary descending.", "SELECT name, dept_name, salary FROM employees JOIN departments ON employees.dept_id = departments.dept_id ORDER BY salary DESC FETCH FIRST 2 ROWS ONLY", "ordered");

  pushQ("Aggregates", "Easy", "Count employees", "Return total number of employees.", "SELECT COUNT(*) FROM employees", "set");
  pushQ("Aggregates", "Easy", "Average salary", "Return average employee salary.", "SELECT AVG(salary) FROM employees", "set");
  pushQ("Aggregates", "Easy", "Maximum salary", "Return highest salary.", "SELECT MAX(salary) FROM employees", "set");
  pushQ("Aggregates", "Easy", "Minimum salary", "Return lowest salary.", "SELECT MIN(salary) FROM employees", "set");
  pushQ("Aggregates", "Easy", "Total salary", "Return total of all salaries.", "SELECT SUM(salary) FROM employees", "set");
  [10, 20, 30].forEach((d) => pushQ("Aggregates", "Medium", `Count employees in dept ${d}`, `Count employees only in department ${d}.`, `SELECT COUNT(*) FROM employees WHERE dept_id = ${d}`, "set"));
  [10, 20, 30].forEach((d) => pushQ("Aggregates", "Medium", `Avg salary in dept ${d}`, `Average salary only in department ${d}.`, `SELECT AVG(salary) FROM employees WHERE dept_id = ${d}`, "set"));
  [10, 20, 30].forEach((d) => pushQ("Aggregates", "Medium", `Max salary in dept ${d}`, `Maximum salary only in department ${d}.`, `SELECT MAX(salary) FROM employees WHERE dept_id = ${d}`, "set"));
  [10, 20, 30].forEach((d) => pushQ("Aggregates", "Medium", `Min salary in dept ${d}`, `Minimum salary only in department ${d}.`, `SELECT MIN(salary) FROM employees WHERE dept_id = ${d}`, "set"));

  pushQ("Group By", "Medium", "Employee count by dept_id", "Count employees grouped by dept_id.", "SELECT dept_id, COUNT(*) FROM employees GROUP BY dept_id ORDER BY dept_id", "ordered");
  pushQ("Group By", "Medium", "Average salary by dept_id", "Average salary grouped by dept_id.", "SELECT dept_id, AVG(salary) FROM employees GROUP BY dept_id ORDER BY dept_id", "ordered");
  pushQ("Group By", "Medium", "Maximum salary by dept_id", "Maximum salary grouped by dept_id.", "SELECT dept_id, MAX(salary) FROM employees GROUP BY dept_id ORDER BY dept_id", "ordered");
  pushQ("Group By", "Medium", "Minimum salary by dept_id", "Minimum salary grouped by dept_id.", "SELECT dept_id, MIN(salary) FROM employees GROUP BY dept_id ORDER BY dept_id", "ordered");
  pushQ("Group By", "Medium", "Total salary by dept_id", "Total salary grouped by dept_id.", "SELECT dept_id, SUM(salary) FROM employees GROUP BY dept_id ORDER BY dept_id", "ordered");
  pushQ("Group By", "Medium", "Employee count by dept_name", "Count employees grouped by department name using join.", "SELECT dept_name, COUNT(*) FROM employees JOIN departments ON employees.dept_id = departments.dept_id GROUP BY dept_name ORDER BY dept_name", "ordered");
  pushQ("Group By", "Medium", "Average salary by dept_name", "Average salary grouped by department name using join.", "SELECT dept_name, AVG(salary) FROM employees JOIN departments ON employees.dept_id = departments.dept_id GROUP BY dept_name ORDER BY dept_name", "ordered");
  pushQ("Group By", "Medium", "Max salary by dept_name", "Maximum salary grouped by department name using join.", "SELECT dept_name, MAX(salary) FROM employees JOIN departments ON employees.dept_id = departments.dept_id GROUP BY dept_name ORDER BY dept_name", "ordered");
  pushQ("Group By", "Medium", "Min salary by dept_name", "Minimum salary grouped by department name using join.", "SELECT dept_name, MIN(salary) FROM employees JOIN departments ON employees.dept_id = departments.dept_id GROUP BY dept_name ORDER BY dept_name", "ordered");
  pushQ("Group By", "Medium", "Total salary by dept_name", "Total salary grouped by department name using join.", "SELECT dept_name, SUM(salary) FROM employees JOIN departments ON employees.dept_id = departments.dept_id GROUP BY dept_name ORDER BY dept_name", "ordered");
  [50000, 55000, 60000].forEach((n) => pushQ("Group By", "Hard", `Avg salary by dept_id where salary > ${n}`, `Filter rows first, then compute dept-wise average salary.`, `SELECT dept_id, AVG(salary) FROM employees WHERE salary > ${n} GROUP BY dept_id ORDER BY dept_id`, "ordered"));
  [45000, 50000].forEach((n) => pushQ("Group By", "Hard", `Count by dept_id where salary > ${n}`, `Filter by salary and count rows by dept_id.`, `SELECT dept_id, COUNT(*) FROM employees WHERE salary > ${n} GROUP BY dept_id ORDER BY dept_id`, "ordered"));
  [20, 30].forEach((d) => pushQ("Group By", "Hard", `Count by dept_name for dept ${d}`, `Join and count rows after filtering a single dept_id.`, `SELECT dept_name, COUNT(*) FROM employees JOIN departments ON employees.dept_id = departments.dept_id WHERE dept_id = ${d} GROUP BY dept_name ORDER BY dept_name`, "ordered"));

  pushQ("Joins", "Medium", "Employee with department name", "Show name with department name.", "SELECT name, dept_name FROM employees JOIN departments ON employees.dept_id = departments.dept_id ORDER BY emp_id", "ordered");
  pushQ("Joins", "Medium", "Employee, dept and salary", "Show employee name, department name and salary.", "SELECT name, dept_name, salary FROM employees JOIN departments ON employees.dept_id = departments.dept_id ORDER BY emp_id", "ordered");
  pushQ("Joins", "Medium", "IT employee names", "Show only employee names from IT using join.", "SELECT name FROM employees JOIN departments ON employees.dept_id = departments.dept_id WHERE dept_name = 'IT' ORDER BY name", "ordered");
  pushQ("Joins", "Medium", "HR employee names", "Show only employee names from HR using join.", "SELECT name FROM employees JOIN departments ON employees.dept_id = departments.dept_id WHERE dept_name = 'HR' ORDER BY name", "ordered");
  pushQ("Joins", "Medium", "FINANCE employee names", "Show only employee names from FINANCE using join.", "SELECT name FROM employees JOIN departments ON employees.dept_id = departments.dept_id WHERE dept_name = 'FINANCE' ORDER BY name", "ordered");
  pushQ("Joins", "Medium", "Joined rows salary > 55000", "Show name, dept_name, salary for salaries > 55000.", "SELECT name, dept_name, salary FROM employees JOIN departments ON employees.dept_id = departments.dept_id WHERE salary > 55000 ORDER BY salary DESC", "ordered");
  pushQ("Joins", "Hard", "Count by dept_name for salary > 50000", "Join, filter by salary, then count by department name.", "SELECT dept_name, COUNT(*) FROM employees JOIN departments ON employees.dept_id = departments.dept_id WHERE salary > 50000 GROUP BY dept_name ORDER BY dept_name", "ordered");
  pushQ("Joins", "Hard", "Avg salary by dept_name for salary >= 50000", "Join, filter, then compute average salary by department name.", "SELECT dept_name, AVG(salary) FROM employees JOIN departments ON employees.dept_id = departments.dept_id WHERE salary >= 50000 GROUP BY dept_name ORDER BY dept_name", "ordered");
  pushQ("Joins", "Hard", "Joined rows sorted by dept_name then name", "Use join and order by department name. (Engine checks dept_name ordering only.)", "SELECT name, dept_name FROM employees JOIN departments ON employees.dept_id = departments.dept_id ORDER BY dept_name ASC", "ordered");
  pushQ("Joins", "Hard", "Top 3 joined salary rows", "Top three name + dept + salary rows after join.", "SELECT name, dept_name, salary FROM employees JOIN departments ON employees.dept_id = departments.dept_id ORDER BY salary DESC FETCH FIRST 3 ROWS ONLY", "ordered");

  pushQ("Mixed", "Medium", "Top IT salary row", "Return highest salary row among IT employees.", "SELECT * FROM employees JOIN departments ON employees.dept_id = departments.dept_id WHERE dept_name = 'IT' ORDER BY salary DESC FETCH FIRST 1 ROWS ONLY", "ordered");
  pushQ("Mixed", "Medium", "Top HR salary row", "Return highest salary row among HR employees.", "SELECT * FROM employees JOIN departments ON employees.dept_id = departments.dept_id WHERE dept_name = 'HR' ORDER BY salary DESC FETCH FIRST 1 ROWS ONLY", "ordered");
  pushQ("Mixed", "Medium", "Top FINANCE salary row", "Return highest salary row among FINANCE employees.", "SELECT * FROM employees JOIN departments ON employees.dept_id = departments.dept_id WHERE dept_name = 'FINANCE' ORDER BY salary DESC FETCH FIRST 1 ROWS ONLY", "ordered");
  pushQ("Mixed", "Hard", "Names from dept 10 sorted by salary desc", "Filter dept 10 and sort by salary descending.", "SELECT name, salary FROM employees WHERE dept_id = 10 ORDER BY salary DESC", "ordered");
  pushQ("Mixed", "Hard", "Names from dept 20 sorted by salary desc", "Filter dept 20 and sort by salary descending.", "SELECT name, salary FROM employees WHERE dept_id = 20 ORDER BY salary DESC", "ordered");
  pushQ("Mixed", "Hard", "Names from dept 30 sorted by salary desc", "Filter dept 30 and sort by salary descending.", "SELECT name, salary FROM employees WHERE dept_id = 30 ORDER BY salary DESC", "ordered");
  pushQ("Mixed", "Hard", "Top 2 salaries in dept 10", "Return top two rows from dept 10 by salary.", "SELECT * FROM employees WHERE dept_id = 10 ORDER BY salary DESC FETCH FIRST 2 ROWS ONLY", "ordered");
  pushQ("Mixed", "Hard", "Top 2 salaries in dept 20", "Return top two rows from dept 20 by salary.", "SELECT * FROM employees WHERE dept_id = 20 ORDER BY salary DESC FETCH FIRST 2 ROWS ONLY", "ordered");
  pushQ("Mixed", "Hard", "Top 2 salaries in dept 30", "Return top two rows from dept 30 by salary.", "SELECT * FROM employees WHERE dept_id = 30 ORDER BY salary DESC FETCH FIRST 2 ROWS ONLY", "ordered");
  pushQ("Mixed", "Hard", "Department names with employee counts", "Join and count employees per department name.", "SELECT dept_name, COUNT(*) FROM employees JOIN departments ON employees.dept_id = departments.dept_id GROUP BY dept_name ORDER BY dept_name", "ordered");

  return qs.slice(0, 100);
}

const questionBank = createQuestions().filter((q) => q.difficulty !== "Very Easy");

function getProgressMap() {
  try {
    return JSON.parse(localStorage.getItem("sql_status_map") || "{}");
  } catch {
    return {};
  }
}

function getAnswerMap() {
  try {
    return JSON.parse(localStorage.getItem("sql_answers_map") || "{}");
  } catch {
    return {};
  }
}

export default function OracleSQLPracticeCanvas() {
  const [screenWidth, setScreenWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1400);
  const [qIndex, setQIndex] = useState(() => {
    const stored = Number(localStorage.getItem("sql_qIndex") || 0);
    return Math.min(Math.max(stored, 0), questionBank.length - 1);
  });
  const [answersMap, setAnswersMap] = useState(() => getAnswerMap());
  const [statusMap, setStatusMap] = useState(() => getProgressMap());
  const [sql, setSql] = useState(() => {
    const map = getAnswerMap();
    const qid = questionBank[Number(localStorage.getItem("sql_qIndex") || 0)]?.id;
    return map[qid] || "";
  });
  const [output, setOutput] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const [error, setError] = useState(null);
  const [tableView, setTableView] = useState("employees");
  const [selectedPhase, setSelectedPhase] = useState("All");
  const [showHint, setShowHint] = useState(false);
  const [leftWidth, setLeftWidth] = useState(420);
  const [isDragging, setIsDragging] = useState(false);
  const mainRef = useRef(null);

  const currentQuestion = questionBank[qIndex];
  const promptText = currentQuestion.description
    .trim()
    .replace(/\.$/, "")
    .replace(/^./, (char) => char.toLowerCase());
  const isDesktop = screenWidth >= 900;

  const startResize = (event) => {
    event.preventDefault();
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return undefined;
    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
    const onMouseMove = (event) => {
      const rect = mainRef.current?.getBoundingClientRect();
      if (!rect) return;
      const nextWidth = clamp(event.clientX - rect.left, 320, 540);
      setLeftWidth(nextWidth);
    };
    const onMouseUp = () => setIsDragging(false);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isDragging]);

  useEffect(() => {
    const onResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    document.documentElement.style.minHeight = "100vh";
    document.documentElement.style.background = styles.page.background;
    document.body.style.margin = "0";
    document.body.style.minHeight = "100vh";
    document.body.style.background = styles.page.background;
    document.body.style.color = styles.page.color;
    return () => {
      document.documentElement.style.minHeight = "";
      document.documentElement.style.background = "";
      document.body.style.margin = "";
      document.body.style.minHeight = "";
      document.body.style.background = "";
      document.body.style.color = "";
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("sql_qIndex", qIndex);
  }, [qIndex]);

  useEffect(() => {
    const nextAnswer = answersMap[currentQuestion.id] || "";
    setSql(nextAnswer);
    setOutput([]);
    setFeedback(statusMap[currentQuestion.id]?.message || null);
    setError(null);
    setShowHint(false);
  }, [qIndex]);

  useEffect(() => {
    localStorage.setItem("sql_answers_map", JSON.stringify(answersMap));
  }, [answersMap]);

  useEffect(() => {
    localStorage.setItem("sql_status_map", JSON.stringify(statusMap));
  }, [statusMap]);

  const completedCount = useMemo(() => Object.values(statusMap).filter((x) => x?.passed).length, [statusMap]);

  const phaseCounts = useMemo(() => {
    const obj = { All: questionBank.length };
    questionBank.forEach((q) => {
      obj[q.phase] = (obj[q.phase] || 0) + 1;
    });
    return obj;
  }, []);

  const filteredQuestions = useMemo(() => {
    return selectedPhase === "All" ? questionBank : questionBank.filter((q) => q.phase === selectedPhase);
  }, [selectedPhase]);

  useEffect(() => {
    if (!filteredQuestions.some((q) => q.id === currentQuestion.id)) {
      const firstQuestion = filteredQuestions[0];
      if (firstQuestion) {
        setQIndex(questionBank.findIndex((q) => q.id === firstQuestion.id));
      }
    }
  }, [filteredQuestions, currentQuestion.id]);

  const currentExpected = useMemo(() => executeSQL(currentQuestion.canonicalSql), [currentQuestion]);
  const previewData = tableView === "employees" ? employees : departments;

  const handleSqlChange = (value) => {
    setSql(value);
    setAnswersMap((prev) => ({ ...prev, [currentQuestion.id]: value }));
  };

  const runQuery = () => {
    try {
      const actual = executeSQL(sql);
      const passed = rowsEqual(actual, currentExpected, currentQuestion.compareMode === "ordered");
      const message = passed ? "✅ Correct result" : "❌ Query executed but result does not match expected output";
      setOutput(actual);
      setError(null);
      setFeedback(message);
      setStatusMap((prev) => ({
        ...prev,
        [currentQuestion.id]: { passed, message, lastTriedAt: new Date().toISOString() },
      }));
    } catch (e) {
      setError(e.message);
      setOutput([]);
      setFeedback(null);
      setStatusMap((prev) => ({
        ...prev,
        [currentQuestion.id]: { passed: false, message: `❌ ${e.message}`, lastTriedAt: new Date().toISOString() },
      }));
    }
  };

  const jumpToQuestion = (filteredIdx) => {
    const selectedQ = filteredQuestions[Number(filteredIdx)];
    const idx = questionBank.findIndex((q) => q.id === selectedQ.id);
    if (idx >= 0) setQIndex(idx);
  };

  const leftPane = (
    <div style={styles.leftPaneScroll}>
      <>
          <div style={styles.panelCard}>
            <div style={styles.panelTopRow}>
              <div>
                <div style={styles.eyebrow}>Question {filteredQuestions.findIndex((q) => q.id === currentQuestion.id) + 1} / {filteredQuestions.length}</div>
                <div style={styles.questionTitle}>{currentQuestion.title}</div>
              </div>
              <div style={styles.badgeRow}>
                <span style={{ ...styles.badge, ...badgeByDifficulty(currentQuestion.difficulty) }}>{currentQuestion.difficulty}</span>
                <span style={{ ...styles.badge, background: "#f8fafc", color: "#0f172a", border: "1px solid rgba(15, 23, 42, 0.08)" }}>{currentQuestion.phase}</span>
              </div>
            </div>
            <div style={styles.descHeading}>Question prompt</div>
            <div style={styles.desc}>Write a SQL query to {promptText}.</div>
            <div style={styles.schemaContainer}>
              <div style={styles.schemaHeader}>Schema</div>
              <div style={styles.schemaGrid}>
                {currentQuestion.schema.map((s) => {
                  const match = s.match(/^(\w+)\s*\(([^)]+)\)$/i);
                  const tableName = match ? match[1] : s;
                  const columns = match ? match[2].split(",").map((c) => c.trim()) : [];

                  return (
                    <div key={s} style={styles.schemaCard}>
                      <div style={styles.schemaCardHeading}>{tableName.toUpperCase()}</div>
                      <div style={styles.schemaColumnList}>
                        {columns.map((col) => (
                          <div key={col} style={styles.schemaColumnItem}>{col}</div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {currentQuestion.tests && currentQuestion.tests.length > 0 && (
              <div style={styles.panelCard}>
                <div style={styles.sectionTitle}>Test cases</div>
                <div style={styles.testNote}>{currentQuestion.tests[0].description}</div>
                <DataTable data={currentQuestion.tests[0].expected} compact />
              </div>
            )}
            <div style={styles.hintBox}>
              <button style={styles.ghostBtn} onClick={() => setShowHint((s) => !s)}>{showHint ? "Hide Hint" : "Show Hint"}</button>
              {showHint && (
                <div style={styles.hintText}>{currentQuestion.hint || "Try to think about the FROM clause first, then apply filtering/grouping step by step."}</div>
              )}
            </div>
          </div>
          <div style={styles.panelCard}>
            <div style={styles.sectionTitle}>Tables</div>
            <div style={styles.tabRow}>
              <button style={tableView === "employees" ? styles.activeTab : styles.tab} onClick={() => setTableView("employees")}>EMPLOYEES</button>
              <button style={tableView === "departments" ? styles.activeTab : styles.tab} onClick={() => setTableView("departments")}>DEPARTMENTS</button>
            </div>
            <DataTable data={previewData} compact />
          </div>
        </>
    </div>
  );

  const rightPane = (
    <div style={styles.rightPaneScroll}>
      <>
          <div style={styles.editorCard}>
            <div style={styles.editorHeader}>
              <div>
                <div style={styles.editorTitle}>SQL Editor</div>
                <div style={styles.editorSub}>Write Oracle-style SQL for the current prompt.</div>
              </div>
              <div style={styles.statusPill}>Completed: {completedCount}/{questionBank.length}</div>
            </div>
            <textarea
              style={styles.textarea}
              placeholder="Write your SQL here"
              value={sql}
              onChange={(e) => handleSqlChange(e.target.value)}
            />
            <div style={styles.actionRow}>
              <button style={styles.runBtn} onClick={runQuery}>Run Query</button>
              <button style={styles.secondaryBtn} onClick={() => handleSqlChange(currentQuestion.canonicalSql)}>Load Sample Query</button>
              <button style={styles.secondaryBtn} onClick={() => handleSqlChange("")}>Clear</button>
            </div>
            {feedback && <div style={styles.feedback}>{feedback}</div>}
            {error && <div style={styles.error}>{error}</div>}
          </div>

          <div style={styles.resultCard}>
            <div style={styles.resultHeader}>
              <div style={styles.sectionTitle}>Result</div>
              <div style={styles.smallMuted}>{currentQuestion.compareMode === "ordered" ? "Order-sensitive check" : "Set-based check"}</div>
            </div>
            {output.length > 0 ? <DataTable data={output} /> : <div style={styles.emptyState}>Run a query to see results here.</div>}
          </div>

          <div style={styles.bottomNav}>
            <button disabled={qIndex === 0} style={styles.navBtn} onClick={() => setQIndex((i) => i - 1)}>Previous</button>
            <button disabled={qIndex === questionBank.length - 1} style={styles.navBtnPrimary} onClick={() => setQIndex((i) => i + 1)}>Next</button>
          </div>
        </>
    </div>
  );

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <div style={styles.topbar}>
          <div style={styles.topbarMain}>
            <div style={styles.appTitle}>Oracle SQL Practice Lab</div>
            <div style={styles.topbarNav}>
              <div style={styles.filterRow}>
                <select style={styles.select} value={selectedPhase} onChange={(e) => setSelectedPhase(e.target.value)}>
                  {Object.keys(phaseCounts).map((phase) => (
                    <option key={phase} value={phase}>{phase} ({phaseCounts[phase]})</option>
                  ))}
                </select>
                <select style={styles.select} value={filteredQuestions.findIndex((q) => q.id === currentQuestion.id)} onChange={(e) => jumpToQuestion(e.target.value)}>
                  {filteredQuestions.map((q, idx) => (
                    <option key={q.id} value={idx}>Q{idx + 1} • {q.title}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div style={styles.topbarRight}>
            <div style={styles.progressText}>{Math.round((completedCount / questionBank.length) * 100)}% complete</div>
            <div style={styles.progressTrack}>
              <div style={{ ...styles.progressFill, width: `${(completedCount / questionBank.length) * 100}%` }} />
            </div>
          </div>
        </div>

        <div style={styles.mainLayout} ref={mainRef}>
          <div style={{ ...styles.leftPaneContainer, width: leftWidth }}>
            {leftPane}
          </div>
          {isDesktop && <div style={styles.resizer} onMouseDown={startResize} />}
          <div style={styles.rightPaneContainer}>{rightPane}</div>
        </div>
      </div>
    </div>
  );
}

function DataTable({ data, compact = false }) {
  if (!data || !data.length) return <div style={styles.emptyState}>No rows to show.</div>;
  return (
    <div style={{ ...styles.tableWrap, maxHeight: compact ? 240 : 360 }}>
      <table style={styles.table}>
        <thead>
          <tr>
            {Object.keys(data[0]).map((key) => (
              <th key={key} style={styles.th}>{key}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr key={idx}>
              {Object.values(row).map((val, j) => (
                <td key={j} style={styles.td}>{String(val)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function badgeByDifficulty(difficulty) {
  if (difficulty === "Easy") return { background: "#052e16", color: "#86efac", border: "1px solid #166534" };
  if (difficulty === "Medium") return { background: "#3b1d01", color: "#fdba74", border: "1px solid #9a3412" };
  return { background: "#450a0a", color: "#fca5a5", border: "1px solid #991b1b" };
}

const styles = {
  page: {
    minHeight: "100vh",
    height: "100vh",
    width: "100%",
    overflow: "hidden",
    background: "linear-gradient(180deg, #f3f6fb 0%, #e8eff7 60%, #dfe8f2 100%)",
    color: "#1f2937",
    padding: 0,
    boxSizing: "border-box",
    fontFamily: "Inter, 'Segoe UI', Arial, sans-serif",
  },
  shell: {
    maxWidth: 1560,
    margin: "0 auto",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    padding: 20,
    boxSizing: "border-box",
  },
  topbar: {
    background: "#ffffff",
    border: "1px solid rgba(15, 23, 42, 0.08)",
    borderRadius: 20,
    padding: "14px 18px",
    marginBottom: 14,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    flexWrap: "wrap",
    flexShrink: 0,
  },
  appTitle: { fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em", color: "#111827", marginBottom: 0 },
  topbarRight: { minWidth: 260 },
  topbarMain: {
    display: "flex",
    flexDirection: "row",
    gap: 18,
    minWidth: 0,
    flexWrap: "wrap",
    alignItems: "flex-end",
    flex: 1,
  },
  topbarNav: {
    display: "grid",
    gap: 8,
    minWidth: 280,
    width: "100%",
  },
  navigatorLabel: {
    color: "#475569",
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
  },
  filterRow: {
    display: "grid",
    gap: 8,
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  },
  testNote: {
    color: "#475569",
    fontSize: 12,
    lineHeight: 1.5,
    marginBottom: 12,
  },
  progressText: { textAlign: "right", fontSize: 13, color: "#475569", marginBottom: 8 },
  progressTrack: { height: 10, background: "rgba(15, 23, 42, 0.08)", borderRadius: 999, overflow: "hidden" },
  progressFill: { height: "100%", transformOrigin: "left center", background: "linear-gradient(90deg,#fbbf24,#fb923c)" },
  mainLayout: {
    display: "flex",
    gap: 18,
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
    height: "100%",
  },
  leftPaneContainer: {
    display: "flex",
    flexDirection: "column",
    minWidth: 320,
    maxWidth: 540,
    minHeight: 0,
    height: "100%",
  },
  rightPaneContainer: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    height: "100%",
  },
  leftPaneScroll: {
    minHeight: 0,
    height: "100%",
    overflowY: "auto",
    overflowX: "hidden",
    display: "grid",
    gap: 18,
    paddingRight: 6,
  },
  rightPaneScroll: {
    minHeight: 0,
    height: "100%",
    overflowY: "auto",
    overflowX: "hidden",
    display: "grid",
    gap: 18,
    paddingRight: 6,
  },
  paneControl: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 44,
    paddingBottom: 4,
  },
  panelLabel: {
    width: "100%",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  panelLabelText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: 700,
  },
  resizer: {
    width: 12,
    cursor: "col-resize",
    background: "rgba(15, 23, 42, 0.08)",
    borderRadius: 999,
    zIndex: 10,
    transition: "background 0.2s ease",
    minHeight: "100%",
    alignSelf: "stretch",
  },
  panelHandle: {
    width: 36,
    height: 36,
    borderRadius: 999,
    border: "1px solid rgba(15, 23, 42, 0.14)",
    background: "#f8fafc",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "col-resize",
    transition: "transform 0.2s ease, background 0.2s ease",
    color: "#0f172a",
    fontSize: 16,
    fontWeight: 800,
    lineHeight: 1,
  },
  collapsedPane: {
    minHeight: "calc(100vh - 240px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#ffffff",
    border: "1px dashed rgba(15,23,42,0.12)",
    borderRadius: 22,
    padding: 18,
    color: "#475569",
    textAlign: "center",
    boxShadow: "inset 0 0 0 1px rgba(15, 23, 42, 0.04)",
  },
  collapsedHint: {
    maxWidth: 180,
    fontSize: 13,
    lineHeight: 1.6,
    color: "#475569",
  },
  panelCard: {
    background: "#ffffff",
    border: "1px solid rgba(15, 23, 42, 0.08)",
    borderRadius: 18,
    padding: 16,
    boxShadow: "0 18px 40px rgba(15, 23, 42, 0.06)",
  },
  editorCard: {
    background: "#ffffff",
    border: "1px solid rgba(15, 23, 42, 0.08)",
    borderRadius: 18,
    padding: 16,
    boxShadow: "0 18px 40px rgba(15, 23, 42, 0.06)",
  },
  resultCard: {
    background: "#ffffff",
    border: "1px solid rgba(15, 23, 42, 0.08)",
    borderRadius: 18,
    padding: 16,
    boxShadow: "0 18px 40px rgba(15, 23, 42, 0.06)",
  },
  panelTopRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
    alignItems: "flex-start",
  },
  eyebrow: { color: "#475569", fontSize: 12, marginBottom: 8, letterSpacing: "0.1em" },
  questionTitle: { fontSize: 24, fontWeight: 800, lineHeight: 1.2, letterSpacing: "-0.04em", color: "#0f172a" },
  badgeRow: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
  badge: { padding: "8px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700, textTransform: "uppercase" },
  descHeading: { marginTop: 18, fontSize: 13, fontWeight: 700, color: "#0f172a", letterSpacing: "0.08em" },
  desc: { color: "#334155", marginTop: 10, lineHeight: 1.75, fontSize: 15, maxWidth: "min(100%, 700px)" },
  metaList: { marginTop: 16, display: "grid", gap: 10 },
  schemaLine: { color: "#94a3b8", fontFamily: "Consolas, monospace", fontSize: 13 },
  schemaContainer: { marginTop: 18 },
  schemaHeader: { fontSize: 14, fontWeight: 700, marginBottom: 14, color: "#0f172a", letterSpacing: "0.08em" },
  schemaGrid: { display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" },
  schemaCard: {
    background: "#f8fafc",
    border: "1px solid rgba(248, 185, 52, 0.18)",
    borderRadius: 18,
    padding: "18px 20px",
  },
  schemaCardHeading: {
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.18em",
    color: "#fbbf24",
    marginBottom: 12,
  },
  schemaColumnList: {
    display: "grid",
    gap: 10,
  },
  schemaColumnItem: {
    background: "#ffffff",
    border: "1px solid rgba(15, 23, 42, 0.08)",
    borderRadius: 14,
    padding: "12px 14px",
    color: "#0f172a",
    fontFamily: "Consolas, monospace",
    fontSize: 13,
  },
  schemaTable: {
    width: "100%",
    minWidth: 240,
    borderCollapse: "collapse",
    background: "#0f172a",
    border: "1px solid #334155",
    borderRadius: 14,
    overflow: "hidden",
  },
  schemaTableHeading: {
    background: "#111827",
    color: "#c7d2fe",
    padding: "12px 14px",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    borderBottom: "1px solid #334155",
    textAlign: "left",
  },
  schemaTableColHeader: {
    background: "#111827",
    color: "#94a3b8",
    padding: "10px 12px",
    fontSize: 12,
    textTransform: "none",
    fontWeight: 600,
    borderBottom: "1px solid #334155",
    textAlign: "left",
  },
  schemaTableCell: {
    padding: "10px 12px",
    color: "#cbd5e1",
    borderBottom: "1px solid #334155",
    fontFamily: "Consolas, monospace",
    background: "#0a1120",
  },
  hintBox: { marginTop: 20 },
  ghostBtn: {
    background: "transparent",
    color: "#fbbf24",
    border: "1px solid rgba(248, 185, 52, 0.35)",
    borderRadius: 14,
    padding: "10px 14px",
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  hintText: {
    marginTop: 12,
    background: "#f8fafc",
    border: "1px solid rgba(15, 23, 42, 0.08)",
    padding: 14,
    borderRadius: 16,
    color: "#0f172a",
    lineHeight: 1.7,
  },
  sectionTitle: { fontSize: 15, fontWeight: 700, marginBottom: 14, color: "#0f172a" },
  tabRow: { display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" },
  tab: {
    background: "#0b1220",
    color: "#cbd5e1",
    border: "1px solid rgba(251, 191, 36, 0.18)",
    padding: "8px 14px",
    borderRadius: 14,
    cursor: "pointer",
    fontWeight: 600,
    transition: "all 0.2s ease",
    fontSize: 13,
  },
  activeTab: {
    background: "#f59e0b",
    color: "#0f172a",
    border: "1px solid #f59e0b",
    padding: "8px 14px",
    borderRadius: 14,
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 13,
  },
  navigatorHelp: {
    color: "#94a3b8",
    fontSize: 13,
    marginBottom: 12,
    lineHeight: 1.6,
  },
  filterColumn: {
    display: "grid",
    gap: 12,
  },
  select: {
    width: "100%",
    minHeight: 40,
    background: "#f8fafc",
    color: "#0f172a",
    border: "1px solid rgba(15, 23, 42, 0.08)",
    padding: "10px 12px",
    borderRadius: 14,
    fontSize: 13,
  },
  editorHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "center",
    marginBottom: 18,
    flexWrap: "wrap",
  },
  editorTitle: { fontSize: 18, fontWeight: 700 },
  editorSub: { color: "#475569", fontSize: 12, marginTop: 4 },
  statusPill: {
    background: "#f8fafc",
    border: "1px solid rgba(15, 23, 42, 0.08)",
    color: "#0f172a",
    padding: "8px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
  },
  textarea: {
    width: "100%",
    minHeight: 280,
    resize: "vertical",
    background: "#ffffff",
    color: "#0f172a",
    border: "1px solid rgba(15, 23, 42, 0.08)",
    borderRadius: 14,
    padding: 16,
    fontSize: 13,
    lineHeight: 1.7,
    fontFamily: "Consolas, Monaco, monospace",
    boxSizing: "border-box",
  },
  actionRow: { display: "flex", gap: 12, marginTop: 18, flexWrap: "wrap" },
  runBtn: {
    background: "#22c55e",
    color: "#020617",
    border: "none",
    borderRadius: 14,
    padding: "12px 20px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 12px 24px rgba(34, 197, 94, 0.22)",
  },
  secondaryBtn: {
    background: "#f8fafc",
    color: "#0f172a",
    border: "1px solid rgba(15, 23, 42, 0.08)",
    borderRadius: 14,
    padding: "12px 16px",
    fontSize: 13,
    cursor: "pointer",
  },
  feedback: { marginTop: 16, color: "#86efac", fontWeight: 700 },
  error: { marginTop: 14, color: "#fca5a5", fontWeight: 700 },
  resultHeader: { display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 16, flexWrap: "wrap" },
  smallMuted: { color: "#64748b", fontSize: 13 },
  tableWrap: {
    overflow: "auto",
    border: "1px solid rgba(15, 23, 42, 0.08)",
    borderRadius: 18,
    background: "#ffffff",
  },
  table: { width: "100%", borderCollapse: "collapse", minWidth: 360 },
  th: {
    position: "sticky",
    top: 0,
    background: "#f8fafc",
    color: "#0f172a",
    padding: 14,
    fontSize: 13,
    textAlign: "left",
    borderBottom: "1px solid rgba(15, 23, 42, 0.08)",
  },
  td: {
    padding: 14,
    color: "#0f172a",
    borderBottom: "1px solid rgba(15, 23, 42, 0.08)",
    fontSize: 14,
    whiteSpace: "nowrap",
  },
  emptyState: {
    padding: 24,
    textAlign: "center",
    color: "#475569",
    background: "#f8fafc",
    border: "1px dashed rgba(15, 23, 42, 0.08)",
    borderRadius: 16,
  },
  bottomNav: { display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginTop: 12 },
  navBtn: {
    background: "#f8fafc",
    color: "#0f172a",
    border: "1px solid rgba(15, 23, 42, 0.08)",
    borderRadius: 14,
    padding: "10px 16px",
    fontWeight: 700,
    cursor: "pointer",
    fontSize: 13,
  },
  navBtnPrimary: {
    background: "#f59e0b",
    color: "#0f172a",
    border: "none",
    borderRadius: 14,
    padding: "10px 16px",
    fontWeight: 700,
    cursor: "pointer",
    fontSize: 13,
  },
};
