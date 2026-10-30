import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AnySchemaObject } from 'ajv';
import { JsonRecordProjectStore } from '../infrastructure/record-project-store.js';
import { JsonRunStore, readSafeRunFile } from '../infrastructure/run-store.js';
import { createRecordSchemaRegistry, createRecordStructureValidator } from '../infrastructure/record-validator.js';
import { RecoveryService } from '../application/recovery-service.js';
import { HubError } from '../domain/board.js';
import {
  createVerificationJsonReport,
  renderVerificationMarkdown,
  validateBasicStructuralHealth,
  validateRecoveryBudget,
  verifyRetrievedRunAuthorization,
  type ProjectRecoveryView,
  type RetrievedRunAuthorizationVerification
} from '../domain/recovery.js';
import type { HarnessRun } from '../domain/harness.js';

const help = `AgentHub Cold-Start Recovery CLI Consumer
Usage:
  # Mode 1: Generate Recovery Packet
  node recovery-cli-consumer.js --projectDir <path> --runDir <path> [--projectId <id>] [--targetRequirementId <id>] [--budgetBytes <number>] [--format <json|markdown>]

  # Mode 2: Verify Recovery Packet (Read-only consumer loop)
  node recovery-cli-consumer.js --verifyRecovery <recoveryFilePath> --projectDir <path> --runDir <path> [--budgetBytes <number>] [--format <json|markdown>]

Options:
  --projectDir           Directory storing record projects JSON files
  --runDir               Directory storing harness runs JSON files
  --projectId            Target project ID (generation mode; optional if directory has exactly 1 project)
  --targetRequirementId  Optional requirement ID to focus on (generation mode)
  --verifyRecovery       Path to recovery view JSON file to verify (enables verification mode)
  --recoveryFile         Alias for --verifyRecovery
  --budgetBytes          Optional recovery context / verification report budget in bytes (default: 32768, min: 4096, max: 1048576)
  --format               Output format: json (default) or markdown
  --help                 Show this help message
`;

export function verifyProjectRecoveryFromStorage(params: {
  recoveryView: ProjectRecoveryView;
  projectDir: string;
  runDir: string;
  now?: number;
}): RetrievedRunAuthorizationVerification {
  const { recoveryView, projectDir, runDir, now } = params;
  const projectStore = new JsonRecordProjectStore(resolve(projectDir));
  const currentProject = projectStore.get(recoveryView.projectId) ?? null;
  const validator = createRecordStructureValidator();

  const locator = recoveryView.authorizations?.retrievalLocator;
  if (!locator || !recoveryView.authorizations?.targetRunId) {
    return verifyRetrievedRunAuthorization({
      run: null,
      recoveryView,
      currentProject,
      validator,
      now
    });
  }

  // 1. 安全解析定位符并安全读取（防符号链接、防目录穿越、防超大文件）
  let runData: unknown;
  try {
    const res = readSafeRunFile(resolve(runDir), locator);
    runData = res.data;
  } catch (err: unknown) {
    if (err instanceof HubError && (err.code === 'INVALID_LOCATOR' || err.code === 'UNSAFE_RUN_FILE')) {
      throw err;
    }
    const code = err instanceof HubError ? err.code : 'READ_FAILED';
    const message = err instanceof Error ? err.message : String(err);
    const isNotFound = code === 'RUN_NOT_FOUND';
    return {
      valid: false,
      runAuthorizationApplicable: false,
      workspaceAccessGranted: false,
      executableNow: false,
      state: isNotFound ? 'none' : 'unverified_due_to_corruption',
      reason: `无法安全读取目标运行账本 (${locator}): [${code}] ${message}`,
      run: null,
      targetProjectId: recoveryView.projectId,
      targetRequirementId: recoveryView.goal?.activeRequirement?.id ?? null,
      targetRunId: recoveryView.authorizations.targetRunId,
      currentProjectRevision: currentProject?.revision ?? recoveryView.projectRevision,
      runRevision: null,
      baseRevision: null,
      observedAt: new Date(now ?? Date.now()).toISOString(),
      checks: {
        identityMatch: false,
        projectBindingMatch: false,
        requirementBindingMatch: false,
        requirementExistsInCurrentProject: false,
        projectStructureHealthy: Boolean(currentProject && validateBasicStructuralHealth((currentProject as any).records ?? currentProject).valid),
        projectRelationsValid: false,
        projectRevisionCurrent: false,
        runRevisionCurrent: false,
        runNotExpired: false,
        runActive: false,
        runStateApplicable: false
      },
      activeGrant: null,
      runtimeBinding: null
    };
  }

  // 2. 校验运行账本 Schema 与 ID 匹配性
  const ajv = createRecordSchemaRegistry();
  ajv.addSchema(JSON.parse(readFileSync(new URL('../../schemas/harness/candidate.schema.json', import.meta.url), 'utf8')) as AnySchemaObject);
  const validateRun = ajv.compile<HarnessRun>(JSON.parse(readFileSync(new URL('../../schemas/harness/run.schema.json', import.meta.url), 'utf8')) as AnySchemaObject);

  if (!validateRun(runData) || (runData as HarnessRun).id !== recoveryView.authorizations.targetRunId) {
    return {
      valid: false,
      runAuthorizationApplicable: false,
      workspaceAccessGranted: false,
      executableNow: false,
      state: 'unverified_due_to_corruption',
      reason: `运行账本未通过 Schema 校验或运行 ID 不匹配，未经验证的数据禁止执行`,
      run: null,
      targetProjectId: recoveryView.projectId,
      targetRequirementId: recoveryView.goal?.activeRequirement?.id ?? null,
      targetRunId: recoveryView.authorizations.targetRunId,
      currentProjectRevision: currentProject?.revision ?? recoveryView.projectRevision,
      runRevision: null,
      baseRevision: null,
      observedAt: new Date(now ?? Date.now()).toISOString(),
      checks: {
        identityMatch: false,
        projectBindingMatch: false,
        requirementBindingMatch: false,
        requirementExistsInCurrentProject: false,
        projectStructureHealthy: Boolean(currentProject && validateBasicStructuralHealth((currentProject as any).records ?? currentProject).valid),
        projectRelationsValid: false,
        projectRevisionCurrent: false,
        runRevisionCurrent: false,
        runNotExpired: false,
        runActive: false,
        runStateApplicable: false
      },
      activeGrant: null,
      runtimeBinding: null
    };
  }

  // 3. 运行领域完整核对（含完整关系校验）
  return verifyRetrievedRunAuthorization({
    run: runData as HarnessRun,
    recoveryView,
    currentProject,
    validator,
    now
  });
}

export async function runRecoveryCli(args: string[]): Promise<void> {
  let projectDir = '';
  let runDir = '';
  let projectId = '';
  let targetRequirementId: string | undefined;
  let budgetBytes: number | undefined;
  let format: 'json' | 'markdown' = 'json';
  let verifyRecoveryPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(help + '\n');
      return;
    }
    if (arg === '--projectDir' && i + 1 < args.length) {
      projectDir = args[++i]!;
    } else if (arg === '--runDir' && i + 1 < args.length) {
      runDir = args[++i]!;
    } else if (arg === '--projectId' && i + 1 < args.length) {
      projectId = args[++i]!;
    } else if (arg === '--targetRequirementId' && i + 1 < args.length) {
      targetRequirementId = args[++i]!;
    } else if ((arg === '--verifyRecovery' || arg === '--recoveryFile') && i + 1 < args.length) {
      verifyRecoveryPath = args[++i]!;
    } else if (arg === '--budgetBytes' && i + 1 < args.length) {
      const val = args[++i]!;
      const parsed = Number(val);
      budgetBytes = validateRecoveryBudget(parsed);
    } else if (arg === '--format' && i + 1 < args.length) {
      const val = args[++i]!;
      if (val === 'markdown' || val === 'json') {
        format = val;
      } else {
        throw new HubError(400, 'INVALID_FORMAT', `不支持的输出格式: "${val}"，仅支持 json 或 markdown。`);
      }
    }
  }

  if (!projectDir || !runDir) {
    throw new HubError(400, 'MISSING_ARGUMENTS', '必须提供 --projectDir 以及 --runDir 参数。');
  }

  const effectiveBudget = validateRecoveryBudget(budgetBytes);

  // 模式 2: 消费端只读验证闭环
  if (verifyRecoveryPath) {
    const recoveryFilePath = resolve(verifyRecoveryPath);
    if (!existsSync(recoveryFilePath)) {
      throw new HubError(404, 'RECOVERY_FILE_NOT_FOUND', `未找到恢复包文件: "${verifyRecoveryPath}"`);
    }
    let recoveryView: ProjectRecoveryView;
    try {
      recoveryView = JSON.parse(readFileSync(recoveryFilePath, 'utf8'));
    } catch (err: unknown) {
      throw new HubError(400, 'INVALID_RECOVERY_FILE', `恢复包文件不是合法 JSON 对象: ${String(err)}`);
    }

    const verification = verifyProjectRecoveryFromStorage({
      recoveryView,
      projectDir,
      runDir
    });

    if (format === 'markdown') {
      const md = renderVerificationMarkdown(verification, { maxBudgetBytes: effectiveBudget });
      const output = md + '\n';
      if (Buffer.byteLength(output, 'utf8') > effectiveBudget) {
        throw new HubError(413, 'BUDGET_EXCEEDED', `CLI 验证 Markdown 实际输出 (${Buffer.byteLength(output, 'utf8')} 字节) 超出设定预算上限 (${effectiveBudget} 字节)`);
      }
      process.stdout.write(output);
    } else {
      const report = createVerificationJsonReport(verification, { maxBudgetBytes: effectiveBudget });
      const output = JSON.stringify(report, null, 2) + '\n';
      if (Buffer.byteLength(output, 'utf8') > effectiveBudget) {
        throw new HubError(413, 'BUDGET_EXCEEDED', `CLI 验证 JSON 实际输出 (${Buffer.byteLength(output, 'utf8')} 字节) 超出设定预算上限 (${effectiveBudget} 字节)`);
      }
      process.stdout.write(output);
    }
    return;
  }

  // 模式 1: 恢复包生成模式
  const projects = new JsonRecordProjectStore(resolve(projectDir));
  const runs = new JsonRunStore(resolve(runDir));
  const validator = createRecordStructureValidator();
  const service = new RecoveryService({ projects, runs, validator });

  if (!projectId) {
    const allProjects = projects.list();
    if (allProjects.length === 0) {
      throw new HubError(400, 'MISSING_ARGUMENTS', '未提供 --projectId 且指定目录中未找到任何项目。');
    }
    if (allProjects.length > 1) {
      throw new HubError(400, 'MULTIPLE_PROJECTS_FOUND', `指定目录中存在 ${allProjects.length} 个项目，请使用 --projectId 指定推进的项目标识。`);
    }
    projectId = allProjects[0]!.id;
  }

  const options = {
    ...(targetRequirementId ? { targetRequirementId } : {}),
    maxBudgetBytes: effectiveBudget,
    deliveryFormat: format === 'markdown' ? ('cli_markdown' as const) : ('cli_json' as const)
  };

  if (format === 'markdown') {
    const md = service.formatProjectRecoveryMarkdown(projectId, options);
    const output = md + '\n';
    if (Buffer.byteLength(output, 'utf8') > effectiveBudget) {
      throw new HubError(413, 'BUDGET_EXCEEDED', `CLI Markdown 实际输出 (${Buffer.byteLength(output, 'utf8')} 字节) 超出设定预算上限 (${effectiveBudget} 字节)`);
    }
    process.stdout.write(output);
  } else {
    const view = service.getProjectRecovery(projectId, options);
    const output = JSON.stringify(view, null, 2) + '\n';
    if (Buffer.byteLength(output, 'utf8') > effectiveBudget) {
      throw new HubError(413, 'BUDGET_EXCEEDED', `CLI JSON 实际输出 (${Buffer.byteLength(output, 'utf8')} 字节) 超出设定预算上限 (${effectiveBudget} 字节)`);
    }
    process.stdout.write(output);
  }
}

// When executed directly as CLI script
if (import.meta.url === `file://${process.argv[1]}`) {
  runRecoveryCli(process.argv.slice(2)).catch((err: unknown) => {
    const code = err instanceof HubError ? err.code : 'CLI_ERROR';
    let message = err instanceof Error ? err.message : String(err);
    if (message.length > 500) {
      message = message.slice(0, 497) + '...';
    }
    process.stderr.write(JSON.stringify({ error: { code, message } }) + '\n');
    process.exitCode = 1;
  });
}
