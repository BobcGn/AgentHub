import { createHash, randomUUID } from 'node:crypto';
import { fail, HubError, object, requireHuman, textField, versionField } from '../domain/board.js';
import type { Principal } from '../domain/board.js';
import type { ContractReport, RecordSet, RecordStructureValidator, VerificationRecord, WorkRecord } from '../domain/record-contract.js';
import { editableCollections, legacyMigration } from '../domain/record-project.js';
import type { EditableCollection, RecordAudit, RecordEditPreview, RecordProject, RecordProjectRepository } from '../domain/record-project.js';
import type { BoardService } from './board-service.js';
import { validateRecordSet } from './record-validation.js';
import { defaultProjectPrefix, isProjectPrefix } from '../domain/project-identifiers.js';
import {
  applyWorkItemSemanticInvalidation,
  canonicalizeSemanticValue,
  cascadeDependentDemotionsAndParentInvalidation,
  isVerificationSemanticallyChanged,
  simulateCandidateMutation
} from '../domain/record-candidate-mutations.js';
import { checkRequirementAcceptanceEligibility } from '../domain/recovery.js';

export class RecordProjectValidationError extends HubError {
  readonly report: ContractReport;
  constructor(report: ContractReport) { super(400, 'INVALID_RECORD_SET', '记录未通过合同校验，正式数据未修改。'); this.report = report; }
}
function fingerprint(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function key(value: string): void { if (!/^[A-Za-z0-9_-]{8,100}$/.test(value)) fail(400, 'INVALID_REQUEST_ID', '请求编号需为 8–100 位字母、数字、下划线或短横线。'); }
function textList(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) return fail(400, 'INVALID_INPUT', '范围和约束必须为文本列表。');
  return value as string[];
}
function row(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(400, 'INVALID_INPUT', '记录必须为 JSON 对象。');
  return value as Record<string, unknown>;
}
const workRows = (data: RecordSet): WorkRecord[] => [...data.requirements, ...data.units, ...data.stories, ...data.boltPlans];
interface Edit { baseRevision: number; collection: EditableCollection; id: string | null; record: unknown; reason: string }
export class RecordProjectService {
  private readonly repository: RecordProjectRepository;
  private readonly legacy: BoardService;
  private readonly validator: RecordStructureValidator;
  constructor(repository: RecordProjectRepository, legacy: BoardService, validator: RecordStructureValidator) {
    this.repository = repository; this.legacy = legacy; this.validator = validator;
  }
  list(principal: Principal): RecordProject[] { requireHuman(principal); return this.repository.list().map(item => this.checked(item)); }
  get(principal: Principal, id: string): RecordProject { requireHuman(principal); return this.read(id); }
  has(id: string): boolean { return this.repository.get(id) !== undefined; }
  private checked(project: RecordProject): RecordProject {
    if (!project || !Number.isSafeInteger(project.revision) || project.revision < 1 || !Array.isArray(project.audit)) fail(500, 'INVALID_PROJECT_FILE', 'JSON 项目元数据不完整。');
    if ((project.identifierPrefix !== undefined && !isProjectPrefix(project.identifierPrefix)) ||
        (project.nextRequirementNumber !== undefined && (!Number.isSafeInteger(project.nextRequirementNumber) || project.nextRequirementNumber < 1))) {
      fail(500, 'INVALID_PROJECT_FILE', '项目标记或需求序号不完整。');
    }
    const report = validateRecordSet(project.records, this.validator);
    if (!report.valid) fail(500, 'INVALID_PROJECT_FILE', 'JSON 项目文件未通过合同校验，未覆盖原文件。');
    return project;
  }
  private read(id: string): RecordProject { return this.checked(this.repository.get(id) ?? fail(404, 'NOT_FOUND', 'JSON 项目不存在。')); }
  private check(data: unknown): RecordSet {
    const report = validateRecordSet(data, this.validator);
    if (!report.valid) throw new RecordProjectValidationError(report);
    const structure = this.validator.check(data);
    if (!structure.valid) throw new RecordProjectValidationError({ valid: false, scope: 'structure-and-relations', issues: structure.issues });
    return structure.data;
  }
  private replay(project: RecordProject, requestId: string, hash: string): RecordProject | undefined {
    const previous = project.audit.find(item => item.requestId === requestId);
    if (!previous) return undefined;
    if (previous.requestHash !== hash) fail(409, 'REQUEST_REUSED', '同一请求编号不能用于不同内容。');
    return project;
  }
  create(principal: Principal, input: unknown, requestId: string): RecordProject {
    requireHuman(principal); key(requestId);
    const r = object(input, ['name', 'identifierPrefix', 'title', 'problem', 'expectedOutcome', 'includes', 'excludes', 'constraints', 'confirmed']);
    const name = textField(r, 'name', 120);
    const supplied = r['identifierPrefix'];
    if (supplied !== undefined && typeof supplied !== 'string') fail(400, 'INVALID_PROJECT_PREFIX', '项目标记须为文本。');
    const identifierPrefix = typeof supplied === 'string' && supplied.trim() ? supplied.trim().toUpperCase() : defaultProjectPrefix(name);
    if (!isProjectPrefix(identifierPrefix)) fail(400, 'INVALID_PROJECT_PREFIX', '项目标记须为 1–20 位英文字母或数字，以字母开头。');
    // Preserve the explicit, complete human-confirmed API; the UI creates an empty draft.
    if (r['confirmed'] !== undefined && r['confirmed'] !== true) fail(400, 'EXPLICIT_CONFIRMATION_REQUIRED', '确认初始意图须明确选择确认。');
    const confirmed = r['confirmed'] === true;
    if (!confirmed && ['title','problem','expectedOutcome','includes','excludes','constraints'].some(field => r[field] !== undefined)) {
      fail(400, 'INVALID_INPUT', '请先创建项目，再通过意图草稿入口补充内容。');
    }
    const hash = fingerprint({ action: 'create', input: r });
    for (const project of this.repository.list()) { const replay = this.replay(project, requestId, hash); if (replay) return this.checked(replay); }
    const id = randomUUID(), source = randomUUID(), intent = randomUUID();
    const records: RecordSet = {
      schemaVersion: '1.0.0', intent: { id: intent, title: confirmed ? textField(r, 'title') : '', problem: confirmed ? textField(r, 'problem') : '',
        expectedOutcome: confirmed ? textField(r, 'expectedOutcome') : '',
        scope: { includes: confirmed ? textList(r['includes']) : [], excludes: confirmed ? textList(r['excludes']) : [] },
        constraints: confirmed ? textList(r['constraints']) : [],
        confirmation: { state: confirmed ? 'human_confirmed' : 'proposed', sourceRefs: confirmed ? [source] : [] }, sourceRefs: [source] },
      requirements: [], units: [], stories: [], boltPlans: [], contextItems: [], evidence: [], verifications: [],
      sources: [{ id: source, kind: 'message', locator: 'human:project-creation/' + id,
        excerpt: confirmed ? '已登录人端在建立项目时明确确认本意图。' : '已登录人端创建项目；尚未填写或确认意图。' }]
    };
    this.check(records);
    const audit: RecordAudit = { id: randomUUID(), action: 'create', actor: 'human', at: new Date().toISOString(),
      reason: confirmed ? '本人确认初始意图并建立项目。' : '本人创建项目，意图待逐步明确。',
      requestId, requestHash: hash, target: 'project/' + id, before: null, after: { name, identifierPrefix, intent: records.intent }, warnings: [], effects: [] };
    const project: RecordProject = { id, name, identifierPrefix, nextRequirementNumber: 1,
      createdAt: audit.at, revision: 1, records, audit: [audit], migration: null };
    this.repository.create(project); return project;
  }
  private nextIdentifier(project: RecordProject): { prefix: string; number: number; identifier: string } {
    const prefix = project.identifierPrefix ?? defaultProjectPrefix(project.name);
    let number = project.nextRequirementNumber ?? 1;
    for (const req of project.records.requirements) {
      if (req.identifier?.startsWith(prefix + '-')) number = Math.max(number, Number(req.identifier.slice(prefix.length + 1)) + 1);
    }
    if (!Number.isSafeInteger(number) || number >= Number.MAX_SAFE_INTEGER) fail(409, 'IDENTIFIER_EXHAUSTED', '项目需求编号已达到上限。');
    return { prefix, number, identifier: prefix + '-' + number };
  }
  private legacyBoard(principal: Principal, id: string) {
    requireHuman(principal);
    return this.legacy.overview(principal).find(item => item.project.id === id) ?? fail(404, 'NOT_FOUND', '旧项目不存在。');
  }
  migrationPreview(principal: Principal, id: string) {
    const board = this.legacyBoard(principal, id);
    if (this.has(id)) fail(409, 'ALREADY_MIGRATED', '此项目已迁移。');
    const migration = legacyMigration(board);
    this.check(migration.records);
    const version = fingerprint({ intent: board.intent, planVersion: board.planVersion, issues: board.issues,
      proposals: board.proposals, decisions: board.decisions, records: board.records, changes: board.changes });
    return { sourceProjectId: id, fingerprint: version, records: migration.records, warnings: migration.warnings };
  }
  migrate(principal: Principal, id: string, input: unknown, requestId: string): RecordProject {
    requireHuman(principal); key(requestId);
    const r = object(input, ['fingerprint', 'confirmed']);
    if (r['confirmed'] !== true) fail(400, 'EXPLICIT_CONFIRMATION_REQUIRED', '须本人确认迁移预览。');
    const hash = fingerprint({ action: 'migrate', id, input: r });
    const existing = this.repository.get(id);
    if (existing) return this.replay(this.checked(existing), requestId, hash) ?? fail(409, 'ALREADY_MIGRATED', '此项目已迁移。');
    const preview = this.migrationPreview(principal, id);
    if (preview.fingerprint !== r['fingerprint']) fail(409, 'STALE_MIGRATION', '旧记录已变化，请重新读取迁移预览。');
    const board = this.legacyBoard(principal, id);
    const mapped = legacyMigration(board);
    const at = new Date().toISOString();
    const project: RecordProject = { id, name: board.project.name, createdAt: at, revision: 1, records: mapped.records,
      migration: { legacyProjectId: id, fingerprint: preview.fingerprint, mappings: mapped.mappings },
      audit: [{ id: randomUUID(), action: 'migrate', actor: 'human', at, reason: '本人核对迁移预览后另存 JSON，旧数据保持不变。',
        requestId, requestHash: hash, target: 'project/' + id, before: null, after: { requirementCount: mapped.records.requirements.length },
        warnings: mapped.warnings, effects: [] }] };
    this.repository.create(project); return project;
  }
  private parseEdit(input: unknown): Edit {
    const r = object(input, ['baseRevision', 'collection', 'id', 'record', 'reason', 'confirmed']);
    const collection = r['collection'];
    if (typeof collection !== 'string' || !editableCollections.includes(collection as EditableCollection)) fail(400, 'INVALID_COLLECTION', '不支持的编辑对象。');
    return { baseRevision: versionField(r, 'baseRevision'), collection: collection as EditableCollection,
      id: r['id'] === null ? null : textField(r, 'id', 120), record: r['record'], reason: textField(r, 'reason') };
  }
  private prepare(project: RecordProject, edit: Edit) {
    if (project.revision !== edit.baseRevision) fail(409, 'STALE_RECORD_PROJECT', '项目已更新，编辑草稿仍保留；请重新核对最新差异。');
    const data = structuredClone(project.records);
    const list: unknown[] = data[edit.collection];
    const index = edit.id === null ? -1 : list.findIndex(value => row(value)['id'] === edit.id);
    if (edit.id !== null && index < 0) fail(404, 'NOT_FOUND', '被编辑记录不存在。');
    if (index >= 0 && (edit.collection === 'sources' || edit.collection === 'evidence')) fail(403, 'APPEND_ONLY_RECORD', '来源与观察证据保留原文，纠正时请追加新记录。');
    const before = index < 0 ? null : structuredClone(list[index]);
    const record = structuredClone(row(edit.record));
    if (edit.id !== null && record['id'] !== edit.id) fail(400, 'IDENTITY_CHANGED', '不能通过编辑改变记录 ID。');
    if (before && 'requirementId' in row(before) && record['requirementId'] !== row(before)['requirementId']) fail(400, 'OWNERSHIP_CHANGED', '不能静默转移拆解产物或记录的需求归属。');
    if (before && JSON.stringify(before) === JSON.stringify(record)) fail(400, 'NO_CHANGE', '内容未变化。');
    const warnings: string[] = [];
    const sourceId = 'human-edit-' + fingerprint({ projectId: project.id, edit }).slice(0, 48);
    data.sources.push({ id: sourceId, kind: 'message', locator: 'human:record-edit/' + sourceId, excerpt: edit.reason.slice(0, 600) });
    if ('sourceRefs' in record || edit.collection !== 'sources') {
      const supplied = record['sourceRefs'];
      const previous = before ? row(before)['sourceRefs'] : [];
      if (supplied !== undefined && !Array.isArray(supplied)) fail(400, 'INVALID_INPUT', 'sourceRefs 必须是列表。');
      record['sourceRefs'] = [...new Set([...(Array.isArray(previous) ? previous : []), ...(Array.isArray(supplied) ? supplied : []), sourceId])];
    }
    if (edit.collection === 'requirements') {
      if (before) {
        if (record['identifier'] !== row(before)['identifier']) fail(400, 'IDENTITY_CHANGED', '不能修改已保存的需求标识。');
      } else {
        const allocated = this.nextIdentifier(project).identifier;
        if (record['identifier'] !== undefined && record['identifier'] !== allocated) fail(400, 'INVALID_IDENTIFIER', '新需求标识须使用项目当前分配的编号。');
        record['identifier'] = allocated;
      }
      if (
        record['acceptance'] !== null &&
        JSON.stringify(canonicalizeSemanticValue(record['acceptance'])) !==
          JSON.stringify(canonicalizeSemanticValue(before ? row(before)['acceptance'] : null))
      ) {
        fail(403, 'USE_ACCEPTANCE_GATE', '整体接受必须通过独立人端验收入口记录。');
      }
      if (record['status'] === 'done' && (!before || row(before)['status'] !== 'done')) fail(403, 'USE_ACCEPTANCE_GATE', '标记需求完成前须独立确认整体接受。');
    }
    if (index < 0) list.push(record); else list[index] = record;
    const targetId = record['id'];
    const targetWork = workRows(data).find(item => item.id === targetId);
    const invalidateTargetById = (id: string): void => {
      const value = workRows(data).find(item => item.id === id);
      if (!value) return;
      if (value.status === 'done') value.status = 'review';
      const requirementId = value.kind === 'requirement' ? value.id : value.requirementId;
      cascadeDependentDemotionsAndParentInvalidation(
        data,
        requirementId,
        `因核查记录变更影响 ${value.id}`,
        true,
        warnings
      );
    };
    if (targetWork) {
      if (before) {
        applyWorkItemSemanticInvalidation({
          data,
          before: before as WorkRecord,
          after: targetWork,
          sourceIds: [sourceId],
          warnings
        });
      } else if (targetWork.kind !== 'requirement') {
        cascadeDependentDemotionsAndParentInvalidation(
          data,
          targetWork.requirementId,
          `因新增拆解产物 ${targetWork.id}`,
          false,
          warnings
        );
      }
    }
    if (edit.collection === 'verifications') {
      const verificationChanged = !before
        ? record['outcome'] !== 'passed'
        : isVerificationSemanticallyChanged(before as VerificationRecord, record as unknown as VerificationRecord);
      if (verificationChanged) {
        if (before) {
          const oldTarget = row(row(before)['target'])['id'];
          if (typeof oldTarget === 'string') invalidateTargetById(oldTarget);
        }
        const newTarget = row(record['target'])['id'];
        if (typeof newTarget === 'string') invalidateTargetById(newTarget);
      }
    }
    const report = validateRecordSet(data, this.validator);
    const effects: RecordAudit['effects'] = [];
    for (const collection of editableCollections) {
      const oldRows: unknown[] = project.records[collection], newRows: unknown[] = data[collection];
      for (const entry of newRows) {
        const object = row(entry);
        const old = oldRows.find(value => row(value)['id'] === object['id']);
        if (object['id'] === targetId && collection === edit.collection) continue;
        if (old && JSON.stringify(old) !== JSON.stringify(entry)) effects.push({ target: collection + '/' + String(object['id']), before: old, after: entry });
      }
    }
    return { records: data, before, after: record, warnings, report, effects };
  }
  previewEdit(principal: Principal, id: string, input: unknown): RecordEditPreview {
    requireHuman(principal);
    const prepared = this.prepare(this.read(id), this.parseEdit(input));
    return { before: prepared.before, after: prepared.after, warnings: prepared.warnings, report: prepared.report, effects: prepared.effects };
  }
  saveRecord(principal: Principal, id: string, input: unknown, requestId: string): RecordProject {
    requireHuman(principal); key(requestId);
    const raw = row(input);
    if (raw['confirmed'] !== true) fail(400, 'EXPLICIT_CONFIRMATION_REQUIRED', '须本人核对差异并确认保存。');
    const edit = this.parseEdit(input);
    const project = this.read(id), hash = fingerprint({ action: 'edit', input });
    const replay = this.replay(project, requestId, hash); if (replay) return replay;
    const prepared = this.prepare(project, edit);
    if (!prepared.report.valid) throw new RecordProjectValidationError(prepared.report);
    const updated: RecordProject = { ...project, revision: project.revision + 1, records: this.check(prepared.records),
      audit: [...project.audit, { id: randomUUID(), action: 'edit', actor: 'human', at: new Date().toISOString(),
        requestId, requestHash: hash, reason: edit.reason, target: edit.collection + '/' + String(prepared.after['id']),
        before: prepared.before, after: prepared.after, warnings: prepared.warnings, effects: prepared.effects }] };
    if (edit.collection === 'requirements' && edit.id === null) {
      const allocated = this.nextIdentifier(project);
      updated.identifierPrefix = allocated.prefix; updated.nextRequirementNumber = allocated.number + 1;
    }
    this.repository.replace(updated, project.revision); return updated;
  }
  private prepareIntentDraft(project: RecordProject, input: unknown) {
    const r = object(input, ['baseRevision','title','problem','expectedOutcome','includes','excludes','constraints','confirmed']);
    if (project.revision !== versionField(r, 'baseRevision')) fail(409, 'STALE_RECORD_PROJECT', '项目已更新，意图草稿仍保留；请重新核对。');
    if (project.records.intent.confirmation.state !== 'proposed' || project.migration) {
      fail(403, 'INTENT_DRAFT_UNAVAILABLE', '草稿入口仅用于新项目尚未确认的意图；已确认或迁移意图须另行商讨修订。');
    }
    const data = structuredClone(project.records), before = structuredClone(data.intent);
    for (const field of ['title','problem','expectedOutcome'] as const) {
      const value = r[field];
      if (value !== undefined) {
        if (typeof value !== 'string' || value.length > 4000) fail(400, 'INVALID_INPUT', '意图字段须为不超过 4000 字的文本。');
        data.intent[field] = value.trim();
      }
    }
    for (const field of ['includes','excludes'] as const) if (r[field] !== undefined) data.intent.scope[field] = textList(r[field]).map(value => value.trim()).filter(Boolean);
    if (r['constraints'] !== undefined) data.intent.constraints = textList(r['constraints']).map(value => value.trim()).filter(Boolean);
    if (JSON.stringify(before) === JSON.stringify(data.intent)) fail(400, 'NO_CHANGE', '意图草稿未变化。');
    const source = 'human-intent-' + fingerprint({ projectId: project.id, input: Object.fromEntries(Object.entries(r).filter(([field]) => field !== 'confirmed')) }).slice(0, 48);
    data.sources.push({ id: source, kind: 'message', locator: 'human:intent-draft/' + source, excerpt: '人端保存意图草稿，尚未确认；具体差异保留在项目历史中。' });
    data.intent.sourceRefs.push(source);
    return { records: data, before, after: data.intent, warnings: ['保存草稿不确认意图，也不授予运行权限。'],
      report: validateRecordSet(data, this.validator), effects: [] };
  }
  previewIntentDraft(principal: Principal, id: string, input: unknown): RecordEditPreview {
    requireHuman(principal);
    const prepared = this.prepareIntentDraft(this.read(id), input);
    return { before: prepared.before, after: prepared.after, warnings: prepared.warnings, report: prepared.report, effects: [] };
  }
  saveIntentDraft(principal: Principal, id: string, input: unknown, requestId: string): RecordProject {
    requireHuman(principal); key(requestId);
    if (row(input)['confirmed'] !== true) fail(400, 'EXPLICIT_CONFIRMATION_REQUIRED', '请核对差异并明确保存草稿；保存不确认意图。');
    const project = this.read(id), hash = fingerprint({ action: 'intent-draft', input });
    const replay = this.replay(project, requestId, hash); if (replay) return replay;
    const prepared = this.prepareIntentDraft(project, input);
    if (!prepared.report.valid) throw new RecordProjectValidationError(prepared.report);
    const updated: RecordProject = { ...project, revision: project.revision + 1, records: this.check(prepared.records),
      audit: [...project.audit, { id: randomUUID(), action: 'intent-draft', actor: 'human', at: new Date().toISOString(),
        requestId, requestHash: hash, reason: '本人补充意图草稿，尚未确认。', target: 'intent/' + project.records.intent.id,
        before: prepared.before, after: prepared.after, warnings: prepared.warnings, effects: [] }] };
    this.repository.replace(updated, project.revision); return updated;
  }
  runApplication(principal: Principal, id: string, runId: string): import('../domain/harness.js').ApplicationReceipt | null {
    requireHuman(principal);
    const audit = this.read(id).audit.find(item =>
      (item.action === 'apply-run-context' || item.action === 'apply-run-candidate') && item.requestId === 'harness-apply-' + runId
    );
    if (!audit) return null;
    const targetParts = audit.target.split('/');
    const contextId = targetParts[targetParts.length - 1] || ('run-context-' + runId);
    if (typeof audit.resultRevision !== 'number') fail(500, 'INVALID_APPLICATION_RECEIPT', '运行回执不完整，须核对实际记录。');
    return { projectRevision: audit.resultRevision, auditId: audit.id, contextId };
  }
  applyRunCandidate(principal: Principal, id: string, input: {
    baseRevision: number; runId: string;
    candidate: import('../domain/harness.js').Candidate;
    sources: import('../domain/record-contract.js').SourceRecord[];
    item?: import('../domain/record-contract.js').ContextItemRecord | undefined;
  }): import('../domain/harness.js').ApplicationReceipt {
    requireHuman(principal);
    if (!/^[a-zA-Z0-9-]{1,100}$/.test(input.runId)) fail(400, 'INVALID_RUN_ID', '运行标识不合法。');
    const requestId = 'harness-apply-' + input.runId, hash = fingerprint(input);
    const project = this.read(id);
    const previous = project.audit.find(item => item.requestId === requestId);
    if (previous) {
      if (previous.requestHash !== hash) fail(409, 'REQUEST_REUSED', '运行候选与已保存回执不一致。');
      return this.runApplication(principal, id, input.runId) ?? fail(500, 'INVALID_APPLICATION_RECEIPT', '缺少应用回执。');
    }
    if (project.revision !== input.baseRevision) fail(409, 'STALE_RECORD_PROJECT', '项目已变化，原候选未保存。');

    const candidate = input.candidate;
    const targetReq = project.records.requirements.find(item => item.id === candidate.requirementId);
    if (!targetReq) fail(403, 'INVALID_RUN_APPEND', '候选必须属于本项目需求。');

    const mutation = simulateCandidateMutation(project.records, candidate, input.sources, input.runId);
    if (candidate.type === 'append_context' && input.item) {
      if (input.item.category !== candidate.category || input.item.epistemicStatus !== candidate.epistemicStatus || input.item.content !== candidate.content) {
        fail(400, 'CANDIDATE_PAYLOAD_MISMATCH', '保存的条目与候选不一致。');
      }
    }

    this.check(mutation.records);

    const audit: RecordAudit = {
      id: randomUUID(),
      action: 'apply-run-candidate',
      actor: 'human',
      at: new Date().toISOString(),
      reason: mutation.reason,
      requestId,
      requestHash: hash,
      target: mutation.target,
      before: mutation.before,
      after: mutation.after,
      warnings: mutation.warnings,
      effects: mutation.effects,
      resultRevision: project.revision + 1
    };
    this.repository.replace({ ...project, revision: project.revision + 1, records: mutation.records, audit: [...project.audit, audit] }, project.revision);
    return { projectRevision: project.revision + 1, auditId: audit.id, contextId: mutation.contextId };
  }
  appendRunContext(principal: Principal, id: string, input: {
    baseRevision: number; runId: string; item: import('../domain/record-contract.js').ContextItemRecord;
    sources: import('../domain/record-contract.js').SourceRecord[];
  }): import('../domain/harness.js').ApplicationReceipt {
    return this.applyRunCandidate(principal, id, {
      baseRevision: input.baseRevision,
      runId: input.runId,
      candidate: {
        type: 'append_context',
        requirementId: input.item.requirementId ?? '',
        category: input.item.category as 'open_question' | 'assumption' | 'decision',
        epistemicStatus: input.item.epistemicStatus as 'unknown' | 'proposed',
        content: input.item.content,
        sourceRefs: input.item.sourceRefs
      },
      item: input.item,
      sources: input.sources
    });
  }
  confirmIntent(principal: Principal, id: string, input: unknown, requestId: string): RecordProject {
    requireHuman(principal); key(requestId);
    const r = object(input, ['baseRevision', 'confirmed', 'discussionSummary', 'sourceRef']);
    if (r['confirmed'] !== true) fail(400, 'EXPLICIT_CONFIRMATION_REQUIRED', '须本人核对意图并确认。');
    const project = this.read(id), hash = fingerprint({ action: 'confirm-intent', input });
    const replay = this.replay(project, requestId, hash); if (replay) return replay;
    if (project.revision !== versionField(r, 'baseRevision')) fail(409, 'STALE_RECORD_PROJECT', '项目已变化，请重新核对。');
    if (project.records.intent.confirmation.state !== 'proposed') fail(400, 'ALREADY_CONFIRMED', '当前意图已确认；修改须另走商讨修订。');
    const summary = textField(r, 'discussionSummary'), locator = textField(r, 'sourceRef');
    const data = structuredClone(project.records), source = randomUUID();
    data.sources.push({ id: source, kind: 'message', locator, excerpt: summary.slice(0, 600) });
    const before = data.intent.confirmation;
    data.intent.confirmation = { state: 'human_confirmed', sourceRefs: [source] };
    const updated: RecordProject = { ...project, revision: project.revision + 1, records: this.check(data),
      audit: [...project.audit, { id: randomUUID(), action: 'confirm-intent', actor: 'human', at: new Date().toISOString(), requestId,
        requestHash: hash, reason: summary, target: 'intent/' + data.intent.id, before, after: data.intent.confirmation, warnings: [], effects: [] }] };
    this.repository.replace(updated, project.revision); return updated;
  }
  acceptRequirement(principal: Principal, id: string, requirementId: string, input: unknown, requestId: string): RecordProject {
    requireHuman(principal); key(requestId);
    const r = object(input, ['baseRevision', 'confirmed', 'reason']);
    if (r['confirmed'] !== true) fail(400, 'EXPLICIT_CONFIRMATION_REQUIRED', '须本人确认已经完成整体验收。');
    const project = this.read(id), hash = fingerprint({ action: 'accept', requirementId, input });
    const replay = this.replay(project, requestId, hash); if (replay) return replay;
    if (project.revision !== versionField(r, 'baseRevision')) fail(409, 'STALE_RECORD_PROJECT', '项目已变化，请重新核对。');
    const data = structuredClone(project.records);
    const req = data.requirements.find(item => item.id === requirementId) ?? fail(404, 'NOT_FOUND', '需求不存在。');
    if (req.status === 'done') fail(400, 'ALREADY_ACCEPTED', '需求已记录接受。');

    const eligibility = checkRequirementAcceptanceEligibility(req, data);
    if (!eligibility.eligible) {
      const issues = eligibility.reasons.map(reason => ({
        code: 'ACCEPTANCE_PREFLIGHT_FAILED',
        path: '/requirements/' + requirementId,
        message: reason
      }));
      throw new RecordProjectValidationError({
        valid: false,
        scope: 'structure-and-relations',
        issues
      });
    }

    const reason = r['reason'] === undefined || r['reason'] === null ? null : textField(r, 'reason');
    const source = randomUUID(), before = structuredClone(req);
    data.sources.push({ id: source, kind: 'human_observation', locator: 'human:requirement-acceptance/' + source,
      excerpt: '已登录人端明确确认本需求的整体实际验收。' });
    req.acceptance = { outcome: 'accepted', sourceRefs: [source], reason }; req.status = 'done';
    const updated: RecordProject = { ...project, revision: project.revision + 1, records: this.check(data),
      audit: [...project.audit, { id: randomUUID(), action: 'accept', actor: 'human', at: new Date().toISOString(), requestId, requestHash: hash,
        reason: reason ?? '本人确认整体接受，未补充说明。', target: 'requirements/' + requirementId, before, after: req, warnings: [], effects: [] }] };
    this.repository.replace(updated, project.revision); return updated;
  }
}
