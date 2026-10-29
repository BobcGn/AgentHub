import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';

const help = `AgentHub 工具 CLI（仅查询 / 提案 / 范围内追加记录；没有审批或数据库写入口）
  npm run --silent cli -- overview
  npm run --silent cli -- change --project <id> --file <change.json> --request-id <8-100字符>
  npm run --silent cli -- scope
  npm run --silent cli -- propose --project <id> --file <proposal.json> --request-id <8-100字符>
  npm run --silent cli -- record --project <id> --file <record.json> --request-id <8-100字符>
环境：AGENTHUB_TOKEN（人端发放的工具令牌）
可选：--server http://127.0.0.1:4317
提案字段及示例见 docs/board-quickstart.md。
失败写入 stderr，退出码非 0；成功向 stdout 输出 JSON。
网络结果不明时，用相同内容和 --request-id 重试，避免重复创建。`;
async function main(): Promise<void> {
  const { values, positionals } = parseArgs({ options: {
    server: { type: 'string', default: 'http://127.0.0.1:4317' },
    project: { type: 'string' }, file: { type: 'string' },
    'request-id': { type: 'string' }, help: { type: 'boolean', short: 'h' }
  }, allowPositionals: true, strict: true });
  if (values.help || !positionals.length) { process.stdout.write(help + '\n'); return; }
  const command = positionals[0];
  if (positionals.length !== 1 || (command !== 'overview' && command !== 'scope' && command !== 'propose' && command !== 'record' && command !== 'change')) throw new Error('未知命令。使用 --help 查看用法。');
  const base = new URL(values.server);
  if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1' || base.username || base.password ||
      base.pathname !== '/' || base.search || base.hash) throw new Error('本轮 CLI 仅允许 http://127.0.0.1:<port>，避免将令牌发送到其他主机。');
  const token = process.env['AGENTHUB_TOKEN'];
  if (!token) throw new Error('请先由人端发放限定范围的工具令牌，并设置 AGENTHUB_TOKEN。');
  const headers: Record<string, string> = { Authorization: 'Bearer ' + token };
  let path = command === 'scope' ? '/api/access' : '/api/boards';
  let body: string | undefined;
  if (command === 'propose' || command === 'record' || command === 'change') {
    if (!values.project || !values.file || !values['request-id']) {
      throw new Error(command + ' 需要 --project、--file 和 --request-id。');
    }
    if (!/^[a-zA-Z0-9-]+$/.test(values.project)) {
      throw new Error('--project 只能填写项目 ID 本身，请勿附加 Intent ID、说明文字或空格。');
    }
    const contents = await readFile(values.file, 'utf8');
    body = JSON.stringify(JSON.parse(contents) as unknown);
    path = '/api/projects/' + values.project + (command === 'record' ? '/records' : command === 'change' ? '/changes' : '/proposals');
    headers['Content-Type'] = 'application/json';
    headers['Idempotency-Key'] = values['request-id'];
  }
  const response = await fetch(new URL(path, base), { method: body ? 'POST' : 'GET',
    headers, ...(body ? { body } : {}), redirect: 'error', signal: AbortSignal.timeout(10_000) });
  const data: unknown = await response.json();
  if (!response.ok) {
    process.stderr.write(JSON.stringify(data, null, 2) + '\n');
    process.exitCode = 1;
    return;
  }
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}
main().catch((error: unknown) => {
  process.stderr.write(JSON.stringify({ error: { code: 'CLI_ERROR', message: error instanceof Error ? error.message : '未知失败' } }) + '\n');
  process.exitCode = 1;
});
