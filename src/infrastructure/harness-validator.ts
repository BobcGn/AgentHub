import { readFileSync } from 'node:fs';
import { createRecordSchemaRegistry } from './record-validator.js';
import type { CandidateValidator, ContextCandidate } from '../domain/harness.js';
import type { AnySchemaObject, ValidateFunction } from 'ajv/dist/2020.js';

export function createCandidateValidator(): CandidateValidator {
  const ajv = createRecordSchemaRegistry();
  const schema = JSON.parse(readFileSync(new URL('../../schemas/harness/candidate.schema.json', import.meta.url), 'utf8')) as AnySchemaObject;
  const validate: ValidateFunction<ContextCandidate> = ajv.compile<ContextCandidate>(schema);
  return { check(input) {
    return validate(input) ? { valid: true, data: input } : { valid: false, issues: (validate.errors ?? []).map(item => ({
      code: 'CANDIDATE_' + item.keyword.toUpperCase(), path: item.instancePath, message: item.message ?? '非法候选'
    })) };
  } };
}
