const REQUIREMENT_HEADER_RE = /^### (?:Requirement:\s*)?(.+?)\s*$/gm;

type ChangeRequirementSection = 'ADDED' | 'MODIFIED';

function getRequirementBlock(content: string, section: ChangeRequirementSection): string {
  const lines = stripFencedCodeBlocksPreservingLines(content).split(/\r?\n/);
  const block: string[] = [];
  let collecting = false;

  for (const line of lines) {
    if (line === `## ${section} Requirements`) {
      collecting = true;
      continue;
    }

    if (collecting && line.startsWith('## ')) {
      break;
    }

    if (collecting) {
      block.push(line);
    }
  }

  return block.join('\n');
}

function extractRequirementNamesFromBlock(block: string): string[] {
  const names: string[] = [];
  let match: RegExpExecArray | null;

  REQUIREMENT_HEADER_RE.lastIndex = 0;
  while ((match = REQUIREMENT_HEADER_RE.exec(block)) !== null) {
    names.push(match[1].trim());
  }

  return names;
}

export function countOpenSpecRequirements(
  content: string,
  section: ChangeRequirementSection,
): number {
  return extractRequirementNamesFromBlock(getRequirementBlock(content, section)).length;
}

export function extractOpenSpecRequirementNames(content: string): string[] {
  return [
    ...extractRequirementNamesFromBlock(getRequirementBlock(content, 'ADDED')),
    ...extractRequirementNamesFromBlock(getRequirementBlock(content, 'MODIFIED')),
  ];
}

function stripFencedCodeBlocksPreservingLines(content: string): string {
  const lines = content.split(/\r?\n/);
  const output: string[] = [];
  let activeFence: { marker: '`' | '~'; length: number } | null = null;

  for (const line of lines) {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})(.*)$/);

    if (!activeFence) {
      if (fenceMatch) {
        activeFence = {
          marker: fenceMatch[1][0] as '`' | '~',
          length: fenceMatch[1].length,
        };
        output.push('');
      } else {
        output.push(line);
      }
      continue;
    }

    output.push('');

    if (isClosingFence(line, activeFence)) {
      activeFence = null;
    }
  }

  return output.join('\n');
}

function isClosingFence(
  line: string,
  activeFence: { marker: '`' | '~'; length: number },
): boolean {
  const fenceMatch = line.match(/^\s*(`{3,}|~{3,})\s*$/);
  return Boolean(
    fenceMatch &&
    fenceMatch[1][0] === activeFence.marker &&
    fenceMatch[1].length >= activeFence.length
  );
}
