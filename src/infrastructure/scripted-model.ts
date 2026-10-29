import type { ModelPort } from '../domain/harness.js';

// A deterministic test double. No model network call, summarization, or semantic verification.
export const scriptedModel: ModelPort = {
  name: 'scripted-v1',
  providerKind: 'scripted',
  endpoint: 'local://scripted',
  async propose(input, signal) {
    if (signal.aborted) throw new Error('已取消');
    return { type: 'append_context', requirementId: input.requirementId,
      category: 'open_question', epistemicStatus: 'unknown',
      content: '待核对：关于“' + input.instruction + '”，本需求的实际验证证据是否已经补齐？（脚本化替身生成，未经真实模型分析）',
      sourceRefs: input.requirement.sourceRefs.slice(0, 1) };
  }
};
