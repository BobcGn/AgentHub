import { readFile } from 'node:fs/promises';
import { validateRecordSet } from '../application/record-validation.js';
import { createRecordStructureValidator } from '../infrastructure/record-validator.js';

const help = '用法：npm run --silent records:validate -- <record-set.json>\n只读校验记录快照，不写入正式数据、不鉴定审批真实性。';
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') { process.stdout.write(help + '\n'); return; }
  const path = args[0];
  if (args.length !== 1 || !path || path.startsWith('-')) throw new Error(help);
  const input = await readFile(path);
  if (input.byteLength > 8 * 1024 * 1024) throw new Error('记录快照不得超过 8 MiB。');
  const value: unknown = JSON.parse(input.toString('utf8'));
  const report = validateRecordSet(value, createRecordStructureValidator());
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  if (!report.valid) process.exitCode = 1;
}
main().catch((error: unknown) => {
  process.stderr.write(JSON.stringify({ error: { code: 'RECORD_VALIDATION_ERROR',
    message: error instanceof Error ? error.message : '未知校验错误。' } }) + '\n');
  process.exitCode = 1;
});
