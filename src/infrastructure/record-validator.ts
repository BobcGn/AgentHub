import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { AnySchemaObject } from 'ajv/dist/2020.js';
import type { RecordSet, RecordStructureValidator } from '../domain/record-contract.js';

const files = ['common', 'intent', 'requirement', 'unit', 'story', 'bolt-plan',
  'source', 'context-item', 'evidence', 'verification', 'record-set'] as const;

export function createRecordSchemaRegistry(): Ajv2020 {
  const ajv = new Ajv2020({
    strict: true, allErrors: true, ownProperties: true,
    coerceTypes: false, useDefaults: false, removeAdditional: false
  });
  for (const file of files) {
    const schema: unknown = JSON.parse(readFileSync(new URL('../../schemas/records/' + file + '.schema.json', import.meta.url), 'utf8'));
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) throw new Error('Schema 必须是对象：' + file);
    ajv.addSchema(schema as AnySchemaObject);
  }
  return ajv;
}
export function createRecordStructureValidator(): RecordStructureValidator {
  const ajv = createRecordSchemaRegistry();
  const validate = ajv.compile<RecordSet>({ $ref: 'https://agenthub.local/schemas/records/v1/record-set' });
  return { check(value) {
    if (validate(value)) return { valid: true, data: value };
    return { valid: false, issues: (validate.errors ?? []).map(error => ({
      code: 'SCHEMA_' + error.keyword.toUpperCase(), path: error.instancePath,
      message: error.message ?? '记录不符合 Schema。'
    })) };
  } };
}
