import { HubError } from '../../domain/board.js';
import { OpenAiCompatibleProvider } from './model-provider.js';
import type { ProviderOptions } from './model-provider.js';

export class DeepSeekProvider extends OpenAiCompatibleProvider {
  constructor(options: ProviderOptions) {
    super(options, 'DeepSeek-V4.1-Flash-1017', 'https://api.deepseek.com', 'deepseek');
  }

  protected override resolveApiModel(modelName: string): string {
    const normalized = modelName.trim().toLowerCase();
    if (normalized.includes('v4.1-flash') || normalized.includes('deepseek-v4.1') || normalized === 'deepseek-flash') {
      return 'deepseek-flash';
    }
    if (normalized.includes('v4-pro') || normalized === 'deepseek-v4-pro') {
      return 'deepseek-v4-pro';
    }
    return modelName.trim();
  }

  protected override mapHttpError(status: number, errorText: string): HubError {
    if (status === 401) {
      return new HubError(401, 'DEEPSEEK_AUTH_ERROR', 'DeepSeek API Key 无效或未授权。');
    }
    if (status === 429) {
      return new HubError(429, 'DEEPSEEK_RATE_LIMIT', 'DeepSeek API 请求频率过高或余额不足。');
    }
    return new HubError(502, 'DEEPSEEK_API_ERROR', `DeepSeek API 返回错误 (${status}): ${errorText.slice(0, 300)}`);
  }
}
