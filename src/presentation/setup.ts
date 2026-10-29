import { resolve } from 'node:path';
import { Writable } from 'node:stream';
import { createInterface } from 'node:readline/promises';
import { SqliteStore } from '../infrastructure/sqlite-store.js';
import { initializeAdmin } from '../infrastructure/auth.js';

async function setup(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('请在本人交互终端运行 npm run setup，密码不能通过参数或管道传入。');
  const store = new SqliteStore(resolve(process.env['AGENTHUB_DB'] ?? '.agenthub/board.sqlite'));
  try {
    if (store.getMetadata('admin')) throw new Error('人端账户已存在，未修改任何密码。');
    console.info('建立本地试用账户。密码只保存为 scrypt 哈希；同一 OS 用户下的隔离尚未验证。');
    let muted = false;
    const output = new Writable({ write(chunk: Buffer, _encoding, callback) {
      if (!muted) process.stdout.write(chunk);
      callback();
    } });
    const prompt = createInterface({ input: process.stdin, output, terminal: true });
    prompt.on('SIGINT', () => { prompt.close(); });
    try {
      process.stdout.write('人端密码（12–256 字符，输入不回显）：');
      muted = true;
      const password = await prompt.question('');
      process.stdout.write('\n再次输入：');
      const confirmation = await prompt.question('');
      muted = false;
      process.stdout.write('\n');
      if (password !== confirmation) throw new Error('两次密码不一致，未建立账户。');
      initializeAdmin(store, password);
      console.info('账户已建立。运行 npm run build && npm start，然后在浏览器登录。');
    } finally { muted = false; prompt.close(); }
  } finally { store.close(); }
}
setup().catch((error: unknown) => { console.error(error instanceof Error ? error.message : '初始化失败'); process.exitCode = 1; });
