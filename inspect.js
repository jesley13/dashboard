const XLSX = require('xlsx');
const workbook = XLSX.readFile('d:/dashboard/2526.xlsx');
console.log('Sheets:', workbook.SheetNames);
for (const name of workbook.SheetNames) {
  console.log('--- Sheet:', name, '---');
  const sheet = workbook.Sheets[name];
  const json = XLSX.utils.sheet_to_json(sheet, { defval: null });
  console.log('First 2 rows:', JSON.stringify(json.slice(0, 2), null, 2));
}
