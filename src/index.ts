import { HarnessService } from './application/harness-service.js';
import { RecoveryService } from './application/recovery-service.js';
import { JsonRunStore } from './infrastructure/run-store.js';
import { createCandidateValidator } from './infrastructure/harness-validator.js';
import { scriptedModel } from './infrastructure/scripted-model.js';
import { DeepSeekModel } from './infrastructure/deepseek-model.js';
import type { ModelPort } from './domain/harness.js';
import { dirname, join, resolve } from 'node:path';
import { RecordProjectService } from './application/record-project-service.js';
import { JsonRecordProjectStore } from './infrastructure/record-project-store.js';
import { createRecordStructureValidator } from './infrastructure/record-validator.js';
import { BoardService } from './application/board-service.js';
import { SqliteStore } from './infrastructure/sqlite-store.js';
import { toolCredentials } from './infrastructure/auth.js';
import { createHubServer } from './infrastructure/http-server.js';

const port = Number(process.env['AGENTHUB_PORT'] ?? 4317);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('AGENTHUB_PORT 应为 1024–65535 的端口。');
const dbPath = resolve(process.env['AGENTHUB_DB'] ?? '.agenthub/board.sqlite');
const store = new SqliteStore(dbPath);
if (!store.getMetadata('admin')) {
  store.close();
  console.error('请先运行 npm run setup，在交互终端建立人端密码。');
  process.exitCode = 1;
} else {
  const recordStore = new JsonRecordProjectStore(resolve(process.env['AGENTHUB_RECORDS_DIR'] ?? join(dirname(dbPath), 'record-projects')));
  const service = new BoardService(store, toolCredentials, id => recordStore.get(id) !== undefined);
  const validator = createRecordStructureValidator();
  const recordService = new RecordProjectService(recordStore, service, validator);

  const deepseekApiKey = process.env['DEEPSEEK_API_KEY'];
  let model: ModelPort = scriptedModel;
  if (deepseekApiKey && deepseekApiKey.trim()) {
    const deepseekModel = process.env['DEEPSEEK_MODEL'] ?? 'DeepSeek-V4.1-Flash-1017';
    const deepseekBaseUrl = process.env['DEEPSEEK_BASE_URL'] ?? 'https://api.deepseek.com';
    model = new DeepSeekModel({
      apiKey: deepseekApiKey,
      model: deepseekModel,
      baseUrl: deepseekBaseUrl
    });
    console.info(`Harness 模型已连接: ${model.name} (${deepseekBaseUrl})`);
  } else {
    console.info('未检测到 DEEPSEEK_API_KEY，Harness 使用本地测试替身 (scripted-v1)。');
  }

  const timeoutMs = Number(process.env['HARNESS_TIMEOUT_MS'] ?? 45000);
  const runStore = new JsonRunStore(join(dirname(dbPath), 'runs'));
  const recoveryService = new RecoveryService({ projects: recordStore, runs: runStore, validator });
  const harness = new HarnessService({
    runs: runStore,
    projects: recordStore,
    records: recordService,
    validator,
    candidates: createCandidateValidator(),
    model,
    protectedPaths: [dbPath, dirname(dbPath), recordStore.storagePath, runStore.storagePath],
    limits: { timeoutMs }
  });
  const server = createHubServer({ store, service, recordService, recoveryService, harness, webRoot: resolve('dist/web'),
    ...(process.env['AGENTHUB_DEV_ORIGIN'] ? { devOrigin: process.env['AGENTHUB_DEV_ORIGIN'] } : {}) });
  server.listen(port, '127.0.0.1', () => {
    console.info('AgentHub · Requirement 看板 → http://127.0.0.1:' + port);
    console.info('本地看板试用版；应用接口鉴权不代表同一操作系统用户下的隔离。');
  });
  server.on('error', error => { console.error(error.message); store.close(); process.exitCode = 1; });
  const stop = (): void => { server.closeUpdates(); server.close(() => { store.close(); }); server.closeIdleConnections(); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
