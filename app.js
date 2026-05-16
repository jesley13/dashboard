let rawRows = normalizeRows(window.DASHBOARD_DATA.records || []);
let targetByExecutive = buildTargetMap(rawRows);
let currentSource = window.DASHBOARD_DATA.meta?.source || "2627.xlsx";

const DEFAULT_WORKBOOK_PATH = "2627.xlsx";
const monthOrder = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
const requiredColumns = ["Month", "Branch", "Stream", "Executive", "Billing", "Cost", "Revenue", "Target"];

const fields = {
  month: document.querySelector("#monthFilter"),
  branch: document.querySelector("#branchFilter"),
  executive: document.querySelector("#executiveFilter"),
  stream: document.querySelector("#streamFilter")
};

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});

function val(row, key) {
  return Number(row[key]) || 0;
}

function fmt(value) {
  return money.format(Math.round(value || 0));
}

function pct(num, den) {
  if (!den) return "-";
  return `${Math.round((num / den) * 100)}%`;
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function fiscalYearFromFilename(filename) {
  const base = String(filename || "").replace(/\.[^.]+$/, "");
  const match = base.match(/(\d{2})(\d{2})/);
  if (!match) return "FY";
  return `FY 20${match[1]}-${match[2]}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeRows(rows) {
  return rows.map(row => ({
    Month: String(row.Month ?? "").trim(),
    Branch: String(row.Branch ?? "").trim(),
    Stream: String(row.Stream ?? "").trim(),
    Executive: String(row.Executive ?? "").trim(),
    Client: String(row.Client ?? "").trim(),
    Estimate: String(row.Estimate ?? "").trim(),
    Invoice: String(row.Invoice ?? "").trim(),
    "Gr. Billing": normalizeNumber(row["Gr. Billing"]),
    "Ag. Fees": normalizeNumber(row["Ag. Fees"]),
    Billing: normalizeNumber(row.Billing),
    Cost: normalizeNumber(row.Cost),
    Revenue: normalizeNumber(row.Revenue),
    Target: normalizeNumber(row.Target)
  })).filter(row => row.Month || row.Branch || row.Stream || row.Executive || val(row, "Billing") || val(row, "Revenue"));
}

function buildTargetMap(rows) {
  return rows.reduce((map, row) => {
    if (row.Executive && val(row, "Target")) {
      map.set(row.Executive, Math.max(map.get(row.Executive) || 0, val(row, "Target")));
    }
    return map;
  }, new Map());
}

function targetForRows(rows) {
  const executives = new Set(rows.map(row => row.Executive).filter(Boolean));
  return [...executives].reduce((sum, executive) => sum + (targetByExecutive.get(executive) || 0), 0);
}

function unique(key) {
  return [...new Set(rawRows.map(row => row[key]).filter(Boolean))].sort((a, b) => {
    if (key === "Month") return monthOrder.indexOf(a) - monthOrder.indexOf(b);
    return a.localeCompare(b);
  });
}

function fillSelect(select, values, label) {
  const selected = select.value || "All";
  select.innerHTML = `<option value="All">All ${label}</option>` + values.map(value => (
    `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`
  )).join("");
  select.value = values.includes(selected) ? selected : "All";
}

function refreshFilters(reset = false) {
  if (reset) Object.values(fields).forEach(select => { select.value = "All"; });
  fillSelect(fields.month, unique("Month"), "Months");
  fillSelect(fields.branch, unique("Branch"), "Branches");
  fillSelect(fields.executive, unique("Executive"), "Executives");
  fillSelect(fields.stream, unique("Stream"), "Streams");
}

function filteredRows() {
  return rawRows.filter(row => (
    (fields.month.value === "All" || row.Month === fields.month.value) &&
    (fields.branch.value === "All" || row.Branch === fields.branch.value) &&
    (fields.executive.value === "All" || row.Executive === fields.executive.value) &&
    (fields.stream.value === "All" || row.Stream === fields.stream.value)
  ));
}

function sumRows(rows) {
  return rows.reduce((acc, row) => {
    acc.billing += val(row, "Billing");
    acc.revenue += val(row, "Revenue");
    acc.cost += val(row, "Cost");
    return acc;
  }, { billing: 0, revenue: 0, cost: 0, target: targetForRows(rows) });
}

function groupRows(rows, key) {
  const map = new Map();
  rows.forEach(row => {
    const name = row[key] || "Unassigned";
    const item = map.get(name) || { name, billing: 0, revenue: 0, cost: 0, target: 0, rows: 0 };
    item.billing += val(row, "Billing");
    item.revenue += val(row, "Revenue");
    item.cost += val(row, "Cost");
    item.target = key === "Executive" ? (targetByExecutive.get(name) || 0) : item.target + val(row, "Target");
    item.rows += 1;
    map.set(name, item);
  });
  return [...map.values()];
}

function sortGroups(groups, key) {
  if (key === "Month") {
    return groups.sort((a, b) => monthOrder.indexOf(a.name) - monthOrder.indexOf(b.name));
  }
  return groups.sort((a, b) => b.revenue - a.revenue || b.billing - a.billing || a.name.localeCompare(b.name));
}

function renderRows(target, rows, firstLabel, includeTarget = false) {
  const emptyCols = includeTarget ? 5 : 4;
  target.innerHTML = rows.length ? rows.map(item => `
    <tr>
      <td>${escapeHtml(item.name)}</td>
      <td>${fmt(item.billing)}</td>
      <td>${fmt(item.revenue)}</td>
      ${includeTarget ? `<td>${item.target ? fmt(item.target) : "-"}</td><td>${item.target ? pct(item.revenue, item.target) : "-"}</td>` : `<td>${pct(item.revenue, item.billing)}</td>`}
    </tr>
  `).join("") : `<tr><td colspan="${emptyCols}">No records match the current filters.</td></tr>`;
}

function renderSummary(totals) {
  document.querySelector("#summaryTable").innerHTML = `
    <tr>
      <td>${fmt(totals.billing)}</td>
      <td>${fmt(totals.cost)}</td>
      <td>${fmt(totals.revenue)}</td>
      <td>${pct(totals.revenue, totals.billing)}</td>
      <td>${totals.target ? fmt(totals.target) : "-"}</td>
      <td>${totals.target ? pct(totals.revenue, totals.target) : "-"}</td>
    </tr>
  `;
}

function renderClients(rows) {
  const clients = sortGroups(groupRows(rows, "Client"), "Client").slice(0, 15);
  renderRows(document.querySelector("#clientTable"), clients, "Client");
}

function render() {
  const rows = filteredRows();
  const totals = sumRows(rows);
  setText("#sourceName", currentSource);
  setText("#fiscalYearLabel", fiscalYearFromFilename(currentSource));
  renderSummary(totals);
  renderRows(document.querySelector("#monthTable"), sortGroups(groupRows(rows, "Month"), "Month"), "Month");
  renderRows(document.querySelector("#branchTable"), sortGroups(groupRows(rows, "Branch"), "Branch"), "Branch");
  renderRows(document.querySelector("#streamTable"), sortGroups(groupRows(rows, "Stream"), "Stream"), "Stream");
  renderRows(document.querySelector("#executiveTable"), sortGroups(groupRows(rows, "Executive"), "Executive"), "Executive", true);
  renderClients(rows);
}

function parseWorkbook(buffer) {
  if (!window.XLSX) {
    throw new Error("Excel library is not available. Connect to the internet once, then reload this page.");
  }

  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(firstSheet, { defval: null });
}

function useWorkbookRows(rows, sourceName) {
  const missing = requiredColumns.filter(column => !Object.prototype.hasOwnProperty.call(rows[0] || {}, column));
  if (missing.length) {
    throw new Error(`Missing required columns: ${missing.join(", ")}`);
  }

  rawRows = normalizeRows(rows);
  targetByExecutive = buildTargetMap(rawRows);
  currentSource = sourceName;
  refreshFilters(true);
  render();
}

async function loadDefaultWorkbook() {
  const status = document.querySelector("#uploadStatus");
  status.textContent = `Reading ${DEFAULT_WORKBOOK_PATH}...`;

  try {
    const response = await fetch(DEFAULT_WORKBOOK_PATH, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Could not find ${DEFAULT_WORKBOOK_PATH} in the dashboard folder.`);
    }

    const rows = parseWorkbook(await response.arrayBuffer());
    useWorkbookRows(rows, DEFAULT_WORKBOOK_PATH);
    status.textContent = `Loaded ${DEFAULT_WORKBOOK_PATH} from this dashboard folder.`;
  } catch (error) {
    render();
    status.textContent = `Using embedded data. ${error.message}`;
  }
}

function init() {
  refreshFilters(true);
  Object.values(fields).forEach(select => select.addEventListener("change", render));
  document.querySelector("#resetFilters").addEventListener("click", () => {
    refreshFilters(true);
    render();
  });
  render();
  loadDefaultWorkbook();
}

init();
