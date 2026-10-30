import { createHash } from 'node:crypto';
import { fail, HubError } from '../../domain/board.js';
import type { ModelPort, ModelRuntimeBinding, ModelRuntimeConfig, RuntimeProviderKind } from '../../domain/harness.js';
import { scriptedModel } from '../scripted-model.js';
import { DeepSeekProvider } from './deepseek-provider.js';
import { OpenAiCompatibleProvider, type ProviderOptions } from './model-provider.js';

export class GenericOpenAiProvider extends OpenAiCompatibleProvider {
  constructor(options: ProviderOptions) {
    super(options, 'gpt-4o-mini', 'https://api.openai.com/v1', 'openai-compatible');
  }
}

export function computeRuntimeFingerprint(cfg: {
  provider: string;
  endpoint: string;
  model: string;
  apiKeyEnv?: string;
  timeoutMs?: number;
}): string {
  let normEndpoint = cfg.endpoint.trim().replace(/\/+$/, '');
  if (normEndpoint.startsWith('http://') || normEndpoint.startsWith('https://')) {
    try {
      const u = new URL(normEndpoint);
      // host is lowercased by URL parser per RFC 3986; pathname preserves exact case!
      normEndpoint = `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}`;
    } catch {
      // keep normEndpoint
    }
  }
  const payload = [
    cfg.provider.trim().toLowerCase(),
    normEndpoint,
    cfg.model.trim(),
    (cfg.apiKeyEnv ?? '').trim(),
    cfg.timeoutMs ?? 45000
  ].join('|');
  return createHash('sha256').update(payload, 'utf8').digest('hex').slice(0, 16);
}

export const DEFAULT_PRESET_RUNTIMES: readonly ModelRuntimeConfig[] = [
  {
    id: 'scripted-v1',
    version: 1,
    name: '本地脚本替身 (Scripted v1)',
    provider: 'scripted',
    baseUrl: 'local://scripted',
    model: 'scripted-v1',
    apiKeyEnv: '',
    timeoutMs: 15000,
    isPreset: true
  },
  {
    id: 'deepseek-chat',
    version: 1,
    name: 'DeepSeek Chat (V3 / Flash)',
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    model: 'DeepSeek-V4.1-Flash-1017',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    timeoutMs: 45000,
    isPreset: true
  },
  {
    id: 'deepseek-reasoner',
    version: 1,
    name: 'DeepSeek Reasoner (R1 深度推理)',
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-reasoner',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    timeoutMs: 60000,
    isPreset: true
  },
  {
    id: 'openai-compatible',
    version: 1,
    name: 'OpenAI 兼容通用运行时 (预设)',
    provider: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    apiKeyEnv: 'OPENAI_API_KEY',
    timeoutMs: 45000,
    isPreset: true
  }
];

const validProviders = new Set<RuntimeProviderKind>(['scripted', 'deepseek', 'openai-compatible']);
const allowedLocalUrls = new Set(['local://scripted', 'local://in-memory']);

export interface ResolvedRuntime {
  readonly binding: ModelRuntimeBinding;
  readonly config: ModelRuntimeConfig;
  readonly fingerprint: string;
  readonly endpoint: string;
  readonly configVersion: number;
  getPort(): ModelPort;
}

export function classifyRuntimeEndpoint(
  provider: RuntimeProviderKind,
  rawUrl: string
): { endpoint: string; external: boolean } {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    fail(403, 'UNKNOWN_ENDPOINT_DENIED', '模型服务端点为空，默认拒绝访问。');
  }
  if (trimmed.startsWith('local://')) {
    if (provider !== 'scripted' || !allowedLocalUrls.has(trimmed)) {
      fail(400, 'INVALID_RUNTIME_URL', `非本地脚本替身或未知本地端点禁止使用 ${trimmed}。`);
    }
    return { endpoint: trimmed, external: false };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    fail(403, 'UNKNOWN_ENDPOINT_DENIED', `无法解析模型服务端点 (${trimmed})，默认拒绝访问。`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    fail(403, 'UNKNOWN_ENDPOINT_DENIED', `不支持或未知的模型端点协议 (${parsed.protocol})，默认拒绝访问。`);
  }
  if (!parsed.hostname) {
    fail(403, 'UNKNOWN_ENDPOINT_DENIED', '模型服务端点缺少主机名，默认拒绝访问。');
  }
  if (parsed.username || parsed.password) {
    fail(400, 'INVALID_RUNTIME_URL', '服务端点 URL 禁止内嵌用户名或凭据。');
  }
  if (parsed.search || parsed.hash) {
    fail(400, 'UNSUPPORTED_RUNTIME_URL_QUERY', '模型服务端点 URL 不支持包含查询参数或 Hash 锚点，已拒绝。');
  }

  const host = parsed.hostname.toLowerCase();
  const isLoopback = host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]';
  const normPath = parsed.pathname.replace(/\/+$/, '');
  return {
    endpoint: `${parsed.protocol}//${parsed.host}${normPath}`,
    external: !isLoopback
  };
}

export class RuntimeRegistry {
  private readonly configs = new Map<string, ModelRuntimeConfig>();
  private readonly customPorts = new Map<string, ModelPort>();
  private defaultRuntimeId = 'scripted-v1';
  private defaultEntry: { config: ModelRuntimeConfig; port: ModelPort } | null = null;

  constructor(initialConfigs: readonly ModelRuntimeConfig[] = DEFAULT_PRESET_RUNTIMES) {
    for (const cfg of initialConfigs) {
      this.configs.set(cfg.id, { ...cfg, version: cfg.version ?? 1 });
    }
  }

  list(): ModelRuntimeConfig[] {
    return Array.from(this.configs.values()).map(c => ({ ...c }));
  }

  getById(id: string): ModelRuntimeConfig | undefined {
    if (id === 'default' && this.defaultEntry) {
      return { ...this.defaultEntry.config };
    }
    const found = this.configs.get(id);
    return found ? { ...found } : undefined;
  }

  registerDefaultPort(port: ModelPort): void {
    if (!port.providerKind || !port.endpoint) {
      fail(403, 'UNKNOWN_PORT_DENIED', `端口 "${port.name}" 未显式声明 providerKind 与 endpoint，默认拒绝作为运行时注册。`);
    }
    const provider: RuntimeProviderKind = port.providerKind;
    const baseUrl = port.endpoint;

    // If the default port is scripted-v1 (or an in-memory scripted double named scripted-v1 without custom endpoint), bind it to scripted-v1
    if (port.name === 'scripted-v1' && provider === 'scripted' && (!port.endpoint || port.endpoint === 'local://scripted')) {
      this.defaultRuntimeId = 'scripted-v1';
      this.defaultEntry = null;
      this.customPorts.set('scripted-v1', port);
      return;
    }

    this.defaultRuntimeId = 'default';
    this.defaultEntry = {
      config: {
        id: 'default',
        version: 1,
        name: `默认运行时 (${port.name})`,
        provider,
        baseUrl,
        model: port.name,
        apiKeyEnv: '',
        timeoutMs: 45000,
        isPreset: true
      },
      port
    };
  }

  registerPort(
    id: string,
    port: ModelPort,
    options?: { provider?: RuntimeProviderKind; baseUrl?: string; timeoutMs?: number }
  ): ModelRuntimeConfig {
    const cleanId = id.trim();
    if (!cleanId) {
      fail(400, 'INVALID_RUNTIME_ID', '运行时 ID 不能为空。');
    }
    const provider: RuntimeProviderKind | undefined = options?.provider ?? port.providerKind;
    const baseUrl: string | undefined = options?.baseUrl ?? port.endpoint;
    if (!provider || !baseUrl) {
      fail(403, 'UNKNOWN_PORT_DENIED', `端口 "${port.name}" (ID: ${cleanId}) 未显式声明 providerKind 与 endpoint，默认拒绝注册。`);
    }
    classifyRuntimeEndpoint(provider, baseUrl);
    const existing = this.configs.get(cleanId);

    const nextConfig: ModelRuntimeConfig = {
      id: cleanId,
      version: (existing?.version ?? 0) + 1,
      name: existing?.name ?? cleanId,
      provider,
      baseUrl,
      model: port.name,
      apiKeyEnv: existing?.apiKeyEnv ?? '',
      timeoutMs: options?.timeoutMs ?? existing?.timeoutMs ?? 45000,
      isPreset: existing?.isPreset ?? false
    };
    this.configs.set(cleanId, nextConfig);
    // Index strictly by runtime ID, NEVER overwriting by port.name!
    this.customPorts.set(cleanId, port);
    return { ...nextConfig };
  }

  save(input: unknown): ModelRuntimeConfig {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      fail(400, 'INVALID_RUNTIME_CONFIG', '运行时配置格式不合法。');
    }
    const r = input as Record<string, unknown>;
    const id = typeof r['id'] === 'string' && /^[A-Za-z0-9_-]{2,80}$/.test(r['id'].trim())
      ? r['id'].trim()
      : fail(400, 'INVALID_RUNTIME_ID', '运行时 ID 需为 2~80 位字母、数字、下划线或短横线。');
    if (id === 'default') {
      fail(400, 'INVALID_RUNTIME_ID', 'default 为保留默认运行时标识，请使用明确的运行时 ID。');
    }
    const name = typeof r['name'] === 'string' && r['name'].trim().length > 0 && r['name'].trim().length <= 120
      ? r['name'].trim()
      : fail(400, 'INVALID_RUNTIME_NAME', '运行时名称不能为空且不超过 120 字符。');
    const provider = typeof r['provider'] === 'string' && validProviders.has(r['provider'] as RuntimeProviderKind)
      ? (r['provider'] as RuntimeProviderKind)
      : fail(400, 'INVALID_RUNTIME_PROVIDER', '不支持的供应商类型。');
    const model = typeof r['model'] === 'string' && r['model'].trim().length > 0 && r['model'].trim().length <= 120
      ? r['model'].trim()
      : fail(400, 'INVALID_RUNTIME_MODEL', '模型名称不能为空。');
    const baseUrl = typeof r['baseUrl'] === 'string' && r['baseUrl'].trim().length > 0
      ? r['baseUrl'].trim()
      : (provider === 'scripted' ? 'local://scripted' : fail(400, 'INVALID_RUNTIME_URL', '服务端点 URL 不能为空。'));

    // Fail-closed validation of scheme and endpoint on save
    classifyRuntimeEndpoint(provider, baseUrl);

    const rawEnv = typeof r['apiKeyEnv'] === 'string' ? r['apiKeyEnv'].trim() : '';
    if (rawEnv.startsWith('sk-') || (rawEnv !== '' && !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(rawEnv))) {
      fail(400, 'INVALID_API_KEY_ENV', '请填写环境变量名称（如 DEEPSEEK_API_KEY），禁止直接传入明文密钥。');
    }
    const timeoutMs = typeof r['timeoutMs'] === 'number' && Number.isInteger(r['timeoutMs']) && r['timeoutMs'] >= 1000 && r['timeoutMs'] <= 300000
      ? r['timeoutMs']
      : 45000;

    const existing = this.configs.get(id);
    const saved: ModelRuntimeConfig = {
      id,
      version: (existing?.version ?? 0) + 1,
      name,
      provider,
      baseUrl,
      model,
      apiKeyEnv: provider === 'scripted' ? '' : rawEnv,
      timeoutMs,
      isPreset: existing?.isPreset ?? false
    };
    this.configs.set(id, saved);
    // Saving an explicit runtime config replaces any previously injected custom port under this ID
    this.customPorts.delete(id);
    return { ...saved };
  }

  updateRuntime(id: string, partial: Partial<ModelRuntimeConfig>): ModelRuntimeConfig {
    const existing = this.configs.get(id);
    if (!existing) {
      fail(404, 'RUNTIME_NOT_FOUND', `未找到运行时: ${id}`);
    }
    const updated: ModelRuntimeConfig = {
      ...existing,
      ...partial,
      id: existing.id,
      version: (existing.version ?? 1) + 1
    };
    this.configs.set(id, updated);
    this.customPorts.delete(id);
    return { ...updated };
  }

  private buildResolved(cfg: ModelRuntimeConfig, boundPort: ModelPort | undefined): ResolvedRuntime {
    const frozenConfig: ModelRuntimeConfig = { ...cfg };
    const { endpoint, external } = classifyRuntimeEndpoint(frozenConfig.provider, frozenConfig.baseUrl);
    const fingerprint = computeRuntimeFingerprint({
      provider: frozenConfig.provider,
      endpoint,
      model: frozenConfig.model,
      apiKeyEnv: frozenConfig.apiKeyEnv,
      timeoutMs: frozenConfig.timeoutMs
    });
    const binding: ModelRuntimeBinding = {
      id: frozenConfig.id,
      configVersion: frozenConfig.version,
      provider: frozenConfig.provider,
      model: frozenConfig.model,
      endpoint,
      external,
      fingerprint
    };

    return {
      binding,
      config: frozenConfig,
      fingerprint,
      endpoint,
      configVersion: frozenConfig.version,
      getPort(): ModelPort {
        if (boundPort) {
          return boundPort;
        }
        if (frozenConfig.provider === 'scripted') {
          return {
            ...scriptedModel,
            name: frozenConfig.model,
            providerKind: 'scripted',
            endpoint
          };
        }
        const apiKey = frozenConfig.apiKeyEnv ? (process.env[frozenConfig.apiKeyEnv] ?? '') : '';
        if (frozenConfig.provider === 'deepseek') {
          return new DeepSeekProvider({ apiKey, model: frozenConfig.model, baseUrl: frozenConfig.baseUrl });
        }
        return new GenericOpenAiProvider({ apiKey, model: frozenConfig.model, baseUrl: frozenConfig.baseUrl });
      }
    };
  }

  resolve(
    selector?: { runtimeId?: string | undefined; model?: string | undefined } | string,
    runtimeIdLegacy?: string
  ): ResolvedRuntime {
    let resolvedSelector: { runtimeId?: string | undefined; model?: string | undefined } | undefined;
    if (typeof selector === 'string') {
      resolvedSelector = this.configs.has(selector) ? { runtimeId: selector } : { model: selector };
    } else if (selector && typeof selector === 'object') {
      resolvedSelector = selector;
    } else if (runtimeIdLegacy) {
      resolvedSelector = { runtimeId: runtimeIdLegacy };
    }

    const runtimeId = resolvedSelector?.runtimeId?.trim();
    const modelSelector = resolvedSelector?.model?.trim();

    if (runtimeId) {
      const entryCfg = runtimeId === 'default' && this.defaultEntry
        ? this.defaultEntry.config
        : this.configs.get(runtimeId);
      if (!entryCfg) {
        throw new HubError(400, 'UNKNOWN_RUNTIME', `未知的运行时配置: ${runtimeId}`);
      }
      if (modelSelector && modelSelector !== entryCfg.model) {
        throw new HubError(400, 'RUNTIME_MODEL_MISMATCH', `指定的模型 (${modelSelector}) 与运行时 (${runtimeId}: ${entryCfg.model}) 不一致。`);
      }
      const port = runtimeId === 'default' && this.defaultEntry
        ? this.defaultEntry.port
        : this.customPorts.get(runtimeId);
      return this.buildResolved(entryCfg, port);
    }

    if (modelSelector) {
      const candidates = new Map<string, { cfg: ModelRuntimeConfig; port: ModelPort | undefined }>();
      for (const cfg of this.configs.values()) {
        if (cfg.id === modelSelector || cfg.model === modelSelector) {
          candidates.set(cfg.id, { cfg, port: this.customPorts.get(cfg.id) });
        }
      }
      if (this.defaultRuntimeId === 'default' && this.defaultEntry) {
        const def = this.defaultEntry.config;
        const defPort = this.defaultEntry.port;
        const alreadySamePort = Array.from(candidates.values()).some(
          c => c.port === defPort && c.cfg.provider === def.provider && c.cfg.baseUrl === def.baseUrl
        );
        if (!alreadySamePort && (def.id === modelSelector || def.model === modelSelector)) {
          candidates.set(def.id, { cfg: def, port: defPort });
        }
      }

      if (candidates.size === 0) {
        throw new HubError(400, 'UNKNOWN_RUNTIME', `未知的模型或运行时配置: ${modelSelector}`);
      }
      if (candidates.size > 1) {
        const matchedIds = Array.from(candidates.keys()).join(', ');
        throw new HubError(409, 'AMBIGUOUS_RUNTIME', `模型标识 "${modelSelector}" 匹配多个运行时 (${matchedIds})，请明确指定 runtimeId。`);
      }
      const [only] = candidates.values();
      return this.buildResolved(only!.cfg, only!.port);
    }

    if (this.defaultRuntimeId === 'default' && this.defaultEntry) {
      return this.buildResolved(this.defaultEntry.config, this.defaultEntry.port);
    }
    const defaultCfg = this.configs.get(this.defaultRuntimeId)
      ?? fail(500, 'DEFAULT_RUNTIME_MISSING', '默认运行时未注册。');
    return this.buildResolved(defaultCfg, this.customPorts.get(defaultCfg.id));
  }

  resolveBoundRuntime(binding: ModelRuntimeBinding): ResolvedRuntime {
    if (!binding || !binding.id || typeof binding.configVersion !== 'number') {
      fail(409, 'MISSING_RUNTIME_BINDING', '旧运行缺少明确有效的运行时绑定，不得隐式推断授权；请显式指定 runtimeId 重新确认运行时。');
    }
    if (!binding.fingerprint) {
      fail(409, 'MISSING_RUNTIME_FINGERPRINT', '旧运行绑定缺少配置指纹校验依据，不得隐式沿用未验证配置；请人端在看板中显式重新选择并确认运行时后继续。');
    }
    const currentCfg = binding.id === 'default' && this.defaultEntry
      ? this.defaultEntry.config
      : this.configs.get(binding.id);
    if (!currentCfg) {
      fail(409, 'RUNTIME_CONFIG_CHANGED', `原绑定的运行时 (${binding.id}) 已不存在，不得静默替换，请重新选择确认运行时或另起运行。`);
    }
    const port = binding.id === 'default' && this.defaultEntry
      ? this.defaultEntry.port
      : this.customPorts.get(binding.id);
    const resolved = this.buildResolved(currentCfg, port);
    if (
      resolved.binding.configVersion !== binding.configVersion ||
      resolved.binding.provider !== binding.provider ||
      resolved.binding.model !== binding.model ||
      resolved.binding.endpoint !== binding.endpoint ||
      resolved.binding.external !== binding.external ||
      resolved.fingerprint !== binding.fingerprint
    ) {
      fail(
        409,
        'RUNTIME_CONFIG_CHANGED',
        `运行时 "${binding.id}" 配置已变更 (v${binding.configVersion} -> v${resolved.binding.configVersion})，不得静默改变既有授权与目标端点；请明确指定运行时重新核对。`
      );
    }
    return resolved;
  }
}
