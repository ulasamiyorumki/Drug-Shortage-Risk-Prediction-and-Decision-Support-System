import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import Database from 'better-sqlite3';
import mysql from 'mysql2/promise';

let sqlitePath = process.argv[2] || path.resolve('Datasets/drug_data.sqlite3');
if (!fs.existsSync(sqlitePath) && fs.existsSync(`${sqlitePath}.gz`)) sqlitePath = `${sqlitePath}.gz`;
if (!fs.existsSync(sqlitePath)) throw new Error(`SQLite catalog not found: ${sqlitePath}`);
let expandedTemporaryFile = null;
if (sqlitePath.endsWith('.gz')) {
  expandedTemporaryFile = path.resolve('tmp', 'drug_data_import.sqlite3');
  fs.mkdirSync(path.dirname(expandedTemporaryFile), { recursive: true });
  console.log('Expanding compressed SQLite catalog…');
  await pipeline(fs.createReadStream(sqlitePath), createGunzip(), fs.createWriteStream(expandedTemporaryFile));
  sqlitePath = expandedTemporaryFile;
}
const mysqlConfig = { host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, charset: 'utf8mb4' };
if (!mysqlConfig.host || !mysqlConfig.user || !mysqlConfig.database) throw new Error('Set DB_HOST, DB_NAME, DB_USER and DB_PASSWORD in .env first.');
const sourceDb = new Database(sqlitePath, { readonly: true });
const targetDb = await mysql.createConnection(mysqlConfig);
const schema = fs.readFileSync(path.resolve('database/schema.sql'), 'utf8');
for (const statement of schema.split(/;\s*\n/).map(s => s.trim()).filter(Boolean)) await targetDb.query(statement);
await targetDb.query('TRUNCATE TABLE drug_records');
await targetDb.query('TRUNCATE TABLE source_fields');
const insert = 'INSERT INTO drug_records (source, report_year, generic_name, brand_name, manufacturer, vendor, ndc, product_ndc, package_ndc, application_no, shortage_status, shortage_reason, search_text, raw_json) VALUES ?';
const read = sourceDb.prepare('SELECT source, year, generic_name, brand_name, manufacturer, vendor, ndc, product_ndc, package_ndc, application, status, reason, search_text, raw_json FROM records');
let batch = []; let total = 0;
for (const row of read.iterate()) {
  batch.push([row.source, row.year, row.generic_name, row.brand_name, row.manufacturer, row.vendor, row.ndc, row.product_ndc, row.package_ndc, row.application, row.status, row.reason, row.search_text, row.raw_json]);
  if (batch.length === 500) { await targetDb.query(insert, [batch]); total += batch.length; batch = []; process.stdout.write(`\rImported ${total.toLocaleString()} records`); }
}
if (batch.length) { await targetDb.query(insert, [batch]); total += batch.length; }
const fields = sourceDb.prepare('SELECT source, field FROM field_catalog').all();
if (fields.length) await targetDb.query('INSERT IGNORE INTO source_fields (source, field_name) VALUES ?', [fields.map(r => [r.source, r.field])]);
console.log(`\nFinished: ${total.toLocaleString()} records.`);
await targetDb.end(); sourceDb.close();
if (expandedTemporaryFile) fs.rmSync(expandedTemporaryFile, { force: true });
