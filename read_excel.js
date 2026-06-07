const xlsx = require('xlsx');
const path = require('path');

const filePath = path.join('d:', 'mttnOS', 'logos', 'data.xlsx');
const workbook = xlsx.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

console.log('Columns:', data[0]);
console.log('First Row:', data[1]);
