import { CoreEntity } from '../ir/types.js';

const UI_SURFACE_SIGNAL_PATTERNS = [
  /\b(ui|ux|tui|screen|page|component|layout|dialog|panel|widget|menuconfig|breadcrumb|submenu)\b/i,
  /\bterminal\s+ui\b/i,
  /\bhelp\s+panel\b/i,
  /\binteractive-setup\b/i,
  /\bsetup\s+ui\b/i,
  /\btree(?:\s|-)?(?:menu|navigation|view|node)\b/i,
  /\b(?:single|dual|two)-column\b/i,
  /(?:^|[\\/_.-])(ui|view|screen|layout|component|panel|dialog|widget|setup_ui)(?:[\\/_.-]|$)/i,
] as const;
const UI_CONTEXT_SIGNAL_PATTERNS = [
  /\bsetup\b/i,
  /\bmenu\b/i,
  /\bnavigation\b/i,
  /\bform\b/i,
  /\bfield(?:s)?\b/i,
  /\btoggle\b/i,
  /\bbreadcrumb\b/i,
  /\bsubmenu\b/i,
] as const;
const UI_SETUP_CONTEXT_PATTERN = /\b(setup|interactive-setup)\b/i;
export const CLI_SIGNAL_PATTERN = /\b(cli|command|terminal|shell|subcommand|prompt|interactive|completion)\b/i;

export function buildSignalHaystack(...values: unknown[]): string {
  const parts: string[] = [];
  for (const value of values) {
    collectSignalParts(value, parts);
  }
  return parts.join('\n');
}

export function hasUiSignals(...values: unknown[]): boolean {
  const haystack = buildSignalHaystack(...values);
  if (!haystack) {
    return false;
  }

  if (UI_SURFACE_SIGNAL_PATTERNS.some(pattern => pattern.test(haystack))) {
    return true;
  }

  const contextualHits = UI_CONTEXT_SIGNAL_PATTERNS.filter(pattern => pattern.test(haystack)).length;
  return UI_SETUP_CONTEXT_PATTERN.test(haystack) && contextualHits >= 2;
}

export function hasCliSignals(...values: unknown[]): boolean {
  return CLI_SIGNAL_PATTERN.test(buildSignalHaystack(...values));
}

export function buildEntitySignalHaystack(entity: CoreEntity): string {
  return buildSignalHaystack(
    entity.name,
    entity.content,
    entity.sourcePath,
    entity.metadata,
  );
}

function collectSignalParts(value: unknown, parts: string[]): void {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) {
      parts.push(trimmed);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectSignalParts(item, parts);
    }
    return;
  }

  if (value && typeof value === 'object') {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      collectSignalParts(entry, parts);
    }
  }
}
