import { describe, expect, it } from 'vitest';
import {
  countOpenSpecRequirements,
  extractOpenSpecRequirementNames,
} from './openspec-format.js';

describe('OpenSpec format helpers', () => {
  const mixedFormatChange = `# Example Change

## ADDED Requirements
### Requirement: Legacy Heading
The system SHALL support the legacy heading format.

### Plain Heading
The system SHALL also support the newer compact heading style.

## MODIFIED Requirements
### Requirement: Updated Behavior
The system SHALL preserve modified requirement extraction.
`;

  const fencedHeaderChange = `# Fenced Example

## ADDED Requirements
\`\`\`md
### Requirement: Ignored In Fence
This should not count.
\`\`\`

### Real Header
This should count.
`;

  it('should count requirement headings in both legacy and compact formats', () => {
    expect(countOpenSpecRequirements(mixedFormatChange, 'ADDED')).toBe(2);
    expect(countOpenSpecRequirements(mixedFormatChange, 'MODIFIED')).toBe(1);
  });

  it('should extract requirement names from added and modified sections', () => {
    expect(extractOpenSpecRequirementNames(mixedFormatChange)).toEqual([
      'Legacy Heading',
      'Plain Heading',
      'Updated Behavior',
    ]);
  });

  it('should ignore requirement-looking headers inside fenced code blocks', () => {
    expect(countOpenSpecRequirements(fencedHeaderChange, 'ADDED')).toBe(1);
    expect(extractOpenSpecRequirementNames(fencedHeaderChange)).toEqual(['Real Header']);
  });
});
