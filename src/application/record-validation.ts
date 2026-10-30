import type { ContractReport, RecordStructureValidator } from '../domain/record-contract.js';
import { inspectRecordRelations } from '../domain/record-relations.js';

export function validateRecordSet(input: unknown, validator: RecordStructureValidator): ContractReport {
  const structure = validator.check(input);
  if (!structure.valid) {
    const issues = structure.issues.length ? structure.issues : [{
      code: 'STRUCTURE_VALIDATION_FAILED', path: '', message: '结构校验失败，但验证器未提供详细诊断。'
    }];
    return { valid: false, scope: 'structure-and-relations', issues };
  }
  const issues = inspectRecordRelations(structure.data);
  return { valid: issues.length === 0, scope: 'structure-and-relations', issues };
}
