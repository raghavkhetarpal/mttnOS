const xlsx = require('xlsx');

const workbook = xlsx.readFile('D:/mttnOS/osPhonesMTTN.xlsx');
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(sheet);

console.log("Total rows:", data.length);
if (data.length > 0) {
  console.log("Headers:", Object.keys(data[0] as any));
  console.log("First 3 rows:", data.slice(0, 3));
}
