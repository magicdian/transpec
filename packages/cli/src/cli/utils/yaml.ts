/**
 * Simple YAML parser for config files
 * Handles basic key-value pairs and nested objects
 */

export function parseYaml(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = content.split('\n');
  let currentSection = '';
  let inMultilineString = false;
  let multilineKey = '';
  let multilineValue: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Skip empty lines and comments
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    // Check for multiline string end
    if (inMultilineString) {
      if (trimmedLine === '"' || trimmedLine === "'") {
        // End of multiline
        (result[currentSection] as Record<string, unknown>)[multilineKey] = multilineValue.join('\n');
        inMultilineString = false;
        multilineKey = '';
        multilineValue = [];
      } else {
        multilineValue.push(line);
      }
      continue;
    }

    // Check for section header (no leading spaces, ends with colon)
    const sectionMatch = trimmedLine.match(/^(\w+):\s*$|^(\w+):\s*\|\s*$/);
    if (sectionMatch && !line.startsWith(' ')) {
      currentSection = sectionMatch[1] || sectionMatch[2];
      if (!result[currentSection]) {
        result[currentSection] = {};
      }

      // Check for multililine
      if (sectionMatch[0].endsWith('|')) {
        inMultilineString = true;
        multilineKey = currentSection;
        multilineValue = [];
      }
      continue;
    }

    // Check for key-value pair in current section
    const keyValueMatch = trimmedLine.match(/^(\w+):\s*(.*)$/);
    if (keyValueMatch && line.startsWith(' ')) {
      const [, key, value] = keyValueMatch;

      if (currentSection && typeof result[currentSection] === 'object') {
        const section = result[currentSection] as Record<string, unknown>;

        // Parse value
        let parsedValue: string | number | boolean = value;
        if (value === 'true') {
          parsedValue = true;
        } else if (value === 'false') {
          parsedValue = false;
        } else if (!isNaN(Number(value)) && value !== '') {
          parsedValue = Number(value);
        } else {
          // Remove quotes
          parsedValue = value.replace(/^["']|["']$/g, '');
        }

        section[key] = parsedValue;
      } else if (currentSection) {
        // Top-level key-value
        let parsedValue: string | number | boolean = keyValueMatch[2];
        if (parsedValue === 'true') {
          parsedValue = true;
        } else if (parsedValue === 'false') {
          parsedValue = false;
        } else if (!isNaN(Number(parsedValue)) && parsedValue !== '') {
          parsedValue = Number(parsedValue);
        } else {
          parsedValue = parsedValue.replace(/^["']|["']$/g, '');
        }
        result[key] = parsedValue;
      }
    }
  }

  return result;
}
