export interface ParsedTaskSubtask {
  name: string;
  status: string;
}

export type StructuredTaskSectionKind =
  | 'summary'
  | 'acceptance'
  | 'follow_up'
  | 'estimate'
  | 'checklist'
  | 'other';

export interface StructuredTaskEstimate {
  scope: string | null;
  value: string;
}

export interface StructuredTaskSection {
  title: string;
  level: number;
  kind: StructuredTaskSectionKind;
  content: string;
  items: string[];
}

export interface ParsedTaskStructure {
  subtasks: ParsedTaskSubtask[];
  summary: string | null;
  acceptanceCriteria: string[];
  followUpSuggestions: string[];
  estimates: StructuredTaskEstimate[];
  sections: StructuredTaskSection[];
}

interface RawStructuredTaskSection {
  title: string;
  level: number;
  lines: string[];
}

const SUMMARY_SECTION_PATTERN = /\b(overview|summary|context|goal|background)\b|概览|概要|背景|说明|目标/i;
const ACCEPTANCE_SECTION_PATTERN = /\b(acceptance criteria|acceptance|success criteria|definition of done|validation)\b|验收准则|验收标准|完成标准/i;
const FOLLOW_UP_SECTION_PATTERN = /\b(follow[- ]?up|optional|future work|next step|later|backlog)\b|后续|可选任务|未来工作|扩展项/i;
const ESTIMATE_SECTION_PATTERN = /\b(estimate|effort|duration|timeline|sizing)\b|估时|工时|耗时|预计时间|时间评估/i;
const CHECKLIST_SECTION_PATTERN = /\b(task list|tasks|checklist|implementation plan)\b|任务清单|任务列表|实施计划/i;
const ESTIMATE_LINE_PATTERN = /^\s*(?:[-*+]\s+)?(?:estimate|effort|duration|timeline|sizing|估时|工时|耗时|预计时间|时间评估)\s*[:：]\s*(.+?)\s*$/i;

export function parseTaskStructure(content: string): ParsedTaskStructure {
  const subtasks: ParsedTaskSubtask[] = [];
  const seenSubtasks = new Set<string>();
  const rawSections: RawStructuredTaskSection[] = [];
  const estimates: StructuredTaskEstimate[] = [];
  const preambleLines: string[] = [];
  const lines = content.split(/\r?\n/);

  let currentNumberedSection: {
    number: string;
    title: string;
    checkboxStatuses: string[];
    hasStructuredDetails: boolean;
  } | null = null;
  let currentMarkdownSection: RawStructuredTaskSection | null = null;

  const pushSubtask = (name: string, status: string): void => {
    const normalizedName = name.trim();
    if (!normalizedName) {
      return;
    }

    const key = `${normalizedName}::${status}`;
    if (seenSubtasks.has(key)) {
      return;
    }

    seenSubtasks.add(key);
    subtasks.push({ name: normalizedName, status });
  };

  const pushEstimate = (scope: string | null, value: string): void => {
    const normalizedValue = value.trim();
    if (!normalizedValue) {
      return;
    }

    estimates.push({
      scope: scope?.trim() || null,
      value: normalizedValue,
    });
  };

  const flushNumberedSection = (): void => {
    if (!currentNumberedSection || !currentNumberedSection.hasStructuredDetails) {
      currentNumberedSection = null;
      return;
    }

    pushSubtask(
      `${currentNumberedSection.number}. ${currentNumberedSection.title}`,
      deriveSectionStatus(currentNumberedSection.checkboxStatuses),
    );
    currentNumberedSection = null;
  };

  const flushMarkdownSection = (): void => {
    if (!currentMarkdownSection) {
      return;
    }

    rawSections.push(currentMarkdownSection);
    currentMarkdownSection = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^#\s+/.test(trimmed)) {
      continue;
    }

    const markdownSectionMatch = line.match(/^(#{2,6})\s+(.+)$/);
    if (markdownSectionMatch) {
      flushMarkdownSection();
      currentMarkdownSection = {
        title: markdownSectionMatch[2].trim(),
        level: markdownSectionMatch[1].length,
        lines: [],
      };
      continue;
    }

    const sectionMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (sectionMatch) {
      flushNumberedSection();
      currentNumberedSection = {
        number: sectionMatch[1],
        title: sectionMatch[2].trim(),
        checkboxStatuses: [],
        hasStructuredDetails: false,
      };
    }

    const checkboxMatch = line.match(/^\s*-\s\[([ xX])\]\s*(\d+\.\d+(?:\.\d+)?)?\s*(.+?)\s*$/);
    if (checkboxMatch) {
      const status = checkboxMatch[1].toLowerCase() === 'x' ? 'completed' : 'pending';
      const number = checkboxMatch[2] || '';
      const description = checkboxMatch[3].trim();

      if (currentNumberedSection) {
        currentNumberedSection.checkboxStatuses.push(status);
      }

      pushSubtask(number ? `${number} ${description}` : description, status);
    } else if (currentNumberedSection && trimmed) {
      if (trimmed.startsWith('- ')) {
        currentNumberedSection.hasStructuredDetails = true;
      } else if (!/^估时[:：]/.test(trimmed)) {
        currentNumberedSection.hasStructuredDetails = true;
      }

      const estimateMatch = trimmed.match(ESTIMATE_LINE_PATTERN);
      if (estimateMatch) {
        pushEstimate(
          `${currentNumberedSection.number}. ${currentNumberedSection.title}`,
          estimateMatch[1],
        );
      }
    } else if (!currentNumberedSection && !currentMarkdownSection && trimmed) {
      const estimateMatch = trimmed.match(ESTIMATE_LINE_PATTERN);
      if (estimateMatch) {
        pushEstimate(null, estimateMatch[1]);
      }
    }

    if (currentMarkdownSection) {
      currentMarkdownSection.lines.push(line);
    } else if (!currentNumberedSection && trimmed) {
      preambleLines.push(line);
    }
  }

  flushNumberedSection();
  flushMarkdownSection();

  const sections = rawSections
    .map(section => buildStructuredSection(section, estimates))
    .filter((section): section is StructuredTaskSection => section !== null);

  const summarySection = sections.find(section => section.kind === 'summary');
  const acceptanceSection = sections.find(section => section.kind === 'acceptance');
  const followUpSection = sections.find(section => section.kind === 'follow_up');
  const normalizedEstimates = dedupeEstimates(estimates);

  return {
    subtasks,
    summary: summarySection ? stringifySection(sectionToTextParts(summarySection)) : stringifySection(extractPreambleSummary(preambleLines)),
    acceptanceCriteria: acceptanceSection ? sectionToTextParts(acceptanceSection) : [],
    followUpSuggestions: followUpSection ? sectionToTextParts(followUpSection) : [],
    estimates: normalizedEstimates,
    sections,
  };
}

export function hasStructuredTaskContent(structure: ParsedTaskStructure): boolean {
  return Boolean(structure.summary)
    || structure.acceptanceCriteria.length > 0
    || structure.followUpSuggestions.length > 0
    || structure.estimates.length > 0
    || structure.sections.some(section => section.kind !== 'checklist');
}

function buildStructuredSection(
  section: RawStructuredTaskSection,
  estimates: StructuredTaskEstimate[],
): StructuredTaskSection | null {
  const kind = classifyTaskSection(section.title);
  const paragraphs: string[] = [];
  const items: string[] = [];

  for (const line of section.lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const estimateMatch = trimmed.match(ESTIMATE_LINE_PATTERN);
    if (estimateMatch) {
      if (kind !== 'checklist') {
        estimates.push({
          scope: section.title,
          value: estimateMatch[1].trim(),
        });
      }
      continue;
    }

    if (/^\s*-\s\[([ xX])\]\s+/.test(line)) {
      continue;
    }

    const nonCheckboxListItem = extractNonCheckboxListItem(line);
    if (nonCheckboxListItem) {
      items.push(nonCheckboxListItem);
      continue;
    }

    paragraphs.push(trimmed);
  }

  const content = paragraphs.join(' ').trim();
  if (!content && items.length === 0 && kind !== 'checklist') {
    return null;
  }

  return {
    title: section.title,
    level: section.level,
    kind,
    content,
    items,
  };
}

function classifyTaskSection(title: string): StructuredTaskSectionKind {
  if (SUMMARY_SECTION_PATTERN.test(title)) {
    return 'summary';
  }
  if (ACCEPTANCE_SECTION_PATTERN.test(title)) {
    return 'acceptance';
  }
  if (FOLLOW_UP_SECTION_PATTERN.test(title)) {
    return 'follow_up';
  }
  if (ESTIMATE_SECTION_PATTERN.test(title)) {
    return 'estimate';
  }
  if (CHECKLIST_SECTION_PATTERN.test(title)) {
    return 'checklist';
  }
  return 'other';
}

function sectionToTextParts(section: StructuredTaskSection): string[] {
  return [
    ...section.items,
    ...(section.content ? [section.content] : []),
  ].filter(Boolean);
}

function extractPreambleSummary(lines: string[]): string[] {
  const parts: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || /^(\d+)\.\s+/.test(trimmed) || /^\s*-\s*\[/.test(trimmed)) {
      continue;
    }

    const estimateMatch = trimmed.match(ESTIMATE_LINE_PATTERN);
    if (estimateMatch) {
      continue;
    }

    const nonCheckboxListItem = extractNonCheckboxListItem(line);
    if (nonCheckboxListItem) {
      parts.push(nonCheckboxListItem);
      continue;
    }

    parts.push(trimmed);
  }
  return parts;
}

function stringifySection(parts: string[]): string | null {
  const normalized = parts
    .map(part => part.trim())
    .filter(Boolean)
    .join(' ');
  return normalized || null;
}

function extractNonCheckboxListItem(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  const bulletMatch = trimmed.match(/^[-*+]\s+(.+)$/);
  if (bulletMatch) {
    return bulletMatch[1].trim();
  }

  const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
  if (orderedMatch) {
    return orderedMatch[1].trim();
  }

  return null;
}

function deriveSectionStatus(statuses: string[]): string {
  if (statuses.length === 0) {
    return 'pending';
  }

  const completedCount = statuses.filter(status => status === 'completed').length;
  if (completedCount === 0) {
    return 'pending';
  }
  if (completedCount === statuses.length) {
    return 'completed';
  }
  return 'in_progress';
}

function dedupeEstimates(estimates: StructuredTaskEstimate[]): StructuredTaskEstimate[] {
  const seen = new Set<string>();
  const next: StructuredTaskEstimate[] = [];

  for (const estimate of estimates) {
    const key = `${estimate.scope || ''}::${estimate.value}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    next.push(estimate);
  }

  return next;
}
