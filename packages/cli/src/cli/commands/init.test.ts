import { describe, expect, it } from 'vitest';
import { buildInitConfigYaml, createInitialDraftConfig, parseIdeOption } from './init.js';

describe('parseIdeOption', () => {
  it('should parse comma-separated IDE values and ignore duplicates', () => {
    expect(parseIdeOption('claude-code,codex,claude-code')).toEqual(['claude-code', 'codex']);
  });

  it('should return empty when none is provided', () => {
    expect(parseIdeOption('none')).toEqual([]);
  });
});

describe('createInitialDraftConfig', () => {
  const detected = [
    { framework: 'openspec', entityCount: 10 },
    { framework: 'trellis', entityCount: 8 },
  ];

  it('should infer default target and codeSpec for trellis target', () => {
    const draft = createInitialDraftConfig({ source: 'openspec', ide: 'codex' }, detected);

    expect(draft.sourceFramework).toBe('openspec');
    expect(draft.targetFramework).toBe('trellis');
    expect(draft.codeSpec).toBe('merged');
    expect(draft.ides).toEqual(['codex']);
    expect(draft.fileLoggingEnabled).toBe(true);
  });

  it('should disable codeSpec for non-trellis targets', () => {
    const draft = createInitialDraftConfig({ source: 'trellis', target: 'openspec' }, detected);

    expect(draft.codeSpec).toBeNull();
  });
});

describe('buildInitConfigYaml', () => {
  const baseInput = {
    sourceFramework: 'openspec',
    targetFramework: 'trellis',
    ide: 'codex',
    ides: ['codex'],
    mode: 'on-demand' as const,
    codeSpec: 'merged' as const,
    preprocessSkillPath: '.transpec/skills/preprocess/openspec/SKILL.md',
    postprocessSkillPath: '.transpec/skills/postprocess/trellis/SKILL.md',
    preprocessContextPath: '.transpec/workspace/preprocess-context.json',
    enhancedAnalysisPath: '.transpec/workspace/enhanced-analysis.json',
    postprocessContextPath: '.transpec/workspace/postprocess-context.json',
    logFilePath: '.transpec/logs/transpec.log',
    logLevel: 'info' as const,
    fileLoggingEnabled: false,
    createdAt: '2026-04-10T00:00:00.000Z',
  };

  it('should include file logging switch and codeSpec line when provided', () => {
    const yaml = buildInitConfigYaml(baseInput);

    expect(yaml).toContain('codeSpec: merged');
    expect(yaml).toContain('enabled: false');
  });

  it('should omit codeSpec line when value is null', () => {
    const yaml = buildInitConfigYaml({
      ...baseInput,
      targetFramework: 'openspec',
      codeSpec: null,
      fileLoggingEnabled: true,
    });

    expect(yaml).not.toContain('codeSpec:');
    expect(yaml).toContain('enabled: true');
  });
});
