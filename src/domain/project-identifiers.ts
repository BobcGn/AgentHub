import { pinyin } from 'pinyin-pro';

// Shared by the creation preview and server; no network or filesystem access.
export function defaultProjectPrefix(name: string): string {
  const initials = pinyin(name.trim(), { pattern: 'first', toneType: 'none', type: 'array', nonZh: 'consecutive' });
  return initials.join('').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'PRJ';
}
export function isProjectPrefix(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z][A-Z0-9]{0,19}$/.test(value);
}
