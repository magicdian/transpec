import { parse } from 'yaml';

export function parseYaml(content: string): Record<string, unknown> {
  const parsed = parse(content);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }

  return parsed as Record<string, unknown>;
}
