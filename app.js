let rawRows = normalizeRows(window.DASHBOARD_DATA.records || []);
let targetByExecutive = buildTargetMap(rawRows);
let currentSource = window.DASHBOARD_DATA.meta?.source || "Excel workbook";

const DEFAULT_WORKBOOK_PATH = "workbook";
const WORKBOOK_MANIFEST_PATH = "workbook.json";
const SAVED_WORKBOOK_DB = "dashboardWorkbook";
const SAVED_WORKBOOK_STORE = "files";
const SAVED_WORKBOOK_KEY = "lastWorkbook";
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

function displaySourceName(filename) {
  return String(filename || "Excel workbook").replace(/\.[^.]+$/, "");
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
      map.set(row.Executive, (map.get(row.Executive) || 0) + val(row, "Target"));
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
      <td class="row-title" data-label="${escapeHtml(firstLabel)}">${escapeHtml(item.name)}</td>
      <td data-label="Billing">${fmt(item.billing)}</td>
      <td data-label="Revenue">${fmt(item.revenue)}</td>
      ${includeTarget ? `<td data-label="Target">${item.target ? fmt(item.target) : "-"}</td><td data-label="Target %">${item.target ? pct(item.revenue, item.target) : "-"}</td>` : `<td data-label="Margin">${pct(item.revenue, item.billing)}</td>`}
    </tr>
  `).join("") : `<tr><td colspan="${emptyCols}">No records match the current filters.</td></tr>`;
}

function renderSummary(totals) {
  document.querySelector("#summaryTable").innerHTML = `
    <tr>
      <td data-label="Billing">${fmt(totals.billing)}</td>
      <td data-label="Cost">${fmt(totals.cost)}</td>
      <td data-label="Revenue">${fmt(totals.revenue)}</td>
      <td data-label="Gross Margin">${pct(totals.revenue, totals.billing)}</td>
      <td data-label="Target">${totals.target ? fmt(totals.target) : "-"}</td>
      <td data-label="Target %">${totals.target ? pct(totals.revenue, totals.target) : "-"}</td>
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
  setText("#sourceName", displaySourceName(currentSource));
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
  
  const rawData = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: null });
  
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(20, rawData.length); i++) {
    const rowStrings = (rawData[i] || []).map(cell => String(cell || "").trim());
    const matchCount = requiredColumns.filter(col => rowStrings.includes(col)).length;
    if (matchCount >= 3) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    return []; // Let useWorkbookRows throw the missing columns error
  }

  const headers = rawData[headerRowIndex].map(h => String(h || "").trim());
  const rows = [];
  for (let i = headerRowIndex + 1; i < rawData.length; i++) {
    const rowObj = {};
    let hasData = false;
    for (let j = 0; j < headers.length; j++) {
      if (headers[j]) {
        rowObj[headers[j]] = rawData[i][j];
        if (rawData[i][j] !== null && rawData[i][j] !== "") hasData = true;
      }
    }
    if (hasData) rows.push(rowObj);
  }

  return rows;
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

function openWorkbookDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("Browser storage is not available."));
      return;
    }

    const request = indexedDB.open(SAVED_WORKBOOK_DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(SAVED_WORKBOOK_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readSavedWorkbook() {
  const db = await openWorkbookDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SAVED_WORKBOOK_STORE, "readonly");
    const request = transaction.objectStore(SAVED_WORKBOOK_STORE).get(SAVED_WORKBOOK_KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function saveWorkbook(name, buffer) {
  const db = await openWorkbookDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SAVED_WORKBOOK_STORE, "readwrite");
    transaction.objectStore(SAVED_WORKBOOK_STORE).put({ name, buffer }, SAVED_WORKBOOK_KEY);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

async function fetchWorkbookFromManifest() {
  const manifestResponse = await fetch(WORKBOOK_MANIFEST_PATH, { cache: "no-store" });
  if (!manifestResponse.ok) {
    throw new Error("Could not find an Excel workbook in the dashboard folder.");
  }

  const manifest = await manifestResponse.json();
  const workbookName = String(manifest.file || "").trim();
  if (!workbookName) {
    throw new Error("Workbook manifest does not name an Excel file.");
  }

  const workbookResponse = await fetch(workbookName, { cache: "no-store" });
  if (!workbookResponse.ok) {
    throw new Error(`Could not find ${workbookName} in the dashboard folder.`);
  }

  return {
    buffer: await workbookResponse.arrayBuffer(),
    name: workbookName
  };
}

async function loadDefaultWorkbook() {
  const status = document.querySelector("#uploadStatus");
  if (status) status.textContent = "Reading last used Excel workbook...";

  try {
    let workbookData;
    let workbookSource = "dashboard folder";
    let savedWorkbook = null;

    try {
      savedWorkbook = await readSavedWorkbook();
    } catch {
      savedWorkbook = null;
    }

    if (savedWorkbook?.buffer && savedWorkbook?.name) {
      workbookData = savedWorkbook;
      workbookSource = "last used file";
    } else {
      try {
        const response = await fetch(DEFAULT_WORKBOOK_PATH, { cache: "no-store" });
        if (!response.ok) throw new Error("Dynamic workbook route is not available.");
        workbookData = {
          buffer: await response.arrayBuffer(),
          name: decodeURIComponent(response.headers.get("X-Workbook-Name") || "Excel workbook")
        };
      } catch {
        workbookData = await fetchWorkbookFromManifest();
      }
    }

    const rows = parseWorkbook(workbookData.buffer);
    useWorkbookRows(rows, workbookData.name);
    if (status) status.textContent = `Loaded ${workbookData.name} from ${workbookSource}.`;
  } catch (error) {
    render();
    if (status) status.textContent = `Using embedded data. ${error.message}`;
  }
}

function init() {
  refreshFilters(true);
  Object.values(fields).forEach(select => select.addEventListener("change", render));
  document.querySelector("#resetFilters").addEventListener("click", () => {
    refreshFilters(true);
    render();
  });
  const fileUpload = document.querySelector("#fileUpload");
  if (fileUpload) {
    fileUpload.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const status = document.querySelector("#uploadStatus");
      if (status) status.textContent = `Reading ${file.name}...`;
      try {
        const buffer = await file.arrayBuffer();
        const rows = parseWorkbook(buffer);
        useWorkbookRows(rows, file.name);
        try {
          await saveWorkbook(file.name, buffer);
        } catch {
          // The workbook is still usable for this session even if browser storage is full or disabled.
        }
        if (status) status.textContent = `Loaded ${file.name} from manual selection.`;
      } catch (error) {
        if (status) status.textContent = `Error: ${error.message}`;
      }
    });
  }
  render();
  loadDefaultWorkbook();
}

init();
