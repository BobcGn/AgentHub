import { fail } from '../domain/board.js';
import type { Principal } from '../domain/board.js';
import type { RecordProjectRepository } from '../domain/record-project.js';
import type { HarnessRun, RunRepository } from '../domain/harness.js';
import type { RecordStructureValidator } from '../domain/record-contract.js';
import {
  buildRecoveryProjection,
  renderRecoveryMarkdown,
  verifyRetrievedRunAuthorization,
  type ProjectRecoveryView,
  type RecoveryBuildOptions,
  type RetrievedRunAuthorizationVerification
} from '../domain/recovery.js';

export interface RecoveryServiceDependencies {
  projects: RecordProjectRepository;
  runs: RunRepository;
  validator?: RecordStructureValidator;
}

export class RecoveryService {
  private readonly dependencies: RecoveryServiceDependencies;

  constructor(dependencies: RecoveryServiceDependencies) {
    this.dependencies = dependencies;
  }

  /**
   * 纯只读投影获取：面向内部/离线消费者（如 CLI 独立进程），无需伪造 human 会话
   */
  getProjectRecovery(
    projectId: string,
    options?: RecoveryBuildOptions
  ): ProjectRecoveryView {
    const cleanId = projectId.trim();
    if (!cleanId) {
      fail(400, 'INVALID_PROJECT_ID', '项目 ID 不能为空。');
    }
    const project = this.dependencies.projects.get(cleanId);
    if (!project) {
      fail(404, 'PROJECT_NOT_FOUND', `未找到项目: ${cleanId}`);
    }

    let structureIssues: Array<{ code: string; path: string; message: string }> | undefined;
    if (this.dependencies.validator) {
      const structCheck = this.dependencies.validator.check(project.records);
      if (!structCheck.valid) {
        structureIssues = structCheck.issues;
      }
    }

    const mergedIssues = structureIssues ?? options?.structureIssues;
    const runs = this.dependencies.runs.list(cleanId);
    return buildRecoveryProjection(project, runs, {
      ...options,
      ...(mergedIssues ? { structureIssues: mergedIssues } : {})
    });
  }

  /**
   * 纯只读 Markdown 格式化：面向离线展示
   */
  formatProjectRecoveryMarkdown(
    projectId: string,
    options?: RecoveryBuildOptions
  ): string {
    const view = this.getProjectRecovery(projectId, {
      ...options,
      deliveryFormat: options?.deliveryFormat ?? 'markdown'
    });
    return this.renderMarkdownView(view);
  }

  /**
   * HTTP 路由访问入口：保持人端主体身份门禁
   */
  getRecoveryView(
    actor: Principal,
    projectId: string,
    options?: RecoveryBuildOptions
  ): ProjectRecoveryView {
    if (actor.kind !== 'human') {
      fail(403, 'FORBIDDEN', '恢复视图仅限人端会话访问。');
    }
    return this.getProjectRecovery(projectId, options);
  }

  /**
   * HTTP 路由 Markdown 入口：保持人端主体身份门禁
   */
  formatRecoveryMarkdown(
    actor: Principal,
    projectId: string,
    options?: RecoveryBuildOptions
  ): string {
    if (actor.kind !== 'human') {
      fail(403, 'FORBIDDEN', '恢复视图仅限人端会话访问。');
    }
    return this.formatProjectRecoveryMarkdown(projectId, options);
  }

  renderMarkdownView(view: ProjectRecoveryView): string {
    return renderRecoveryMarkdown(view);
  }

  /**
   * 消费端只读核对：根据恢复视图、当前存储的项目与运行账本进行全闭环重检
   */
  verifyRecoveryAuthorization(
    recoveryView: ProjectRecoveryView,
    options?: { now?: number }
  ): RetrievedRunAuthorizationVerification {
    const cleanProjectId = recoveryView.projectId?.trim();
    if (!cleanProjectId) {
      fail(400, 'INVALID_RECOVERY_VIEW', '恢复视图缺少 projectId。');
    }
    const currentProject = this.dependencies.projects.get(cleanProjectId) ?? null;

    let targetRun: HarnessRun | null = null;
    if (recoveryView.authorizations?.targetRunId) {
      targetRun = this.dependencies.runs.get(recoveryView.authorizations.targetRunId) ?? null;
    }

    return verifyRetrievedRunAuthorization({
      run: targetRun,
      recoveryView,
      currentProject,
      validator: this.dependencies.validator,
      now: options?.now
    });
  }
}
