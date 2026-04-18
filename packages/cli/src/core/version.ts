import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_JSON_PATH = path.resolve(__dirname, '../../package.json');

export interface Version {
  year: number;      // YY (e.g., 26 for 2026)
  month: number;    // MM (1-12, e.g., 4 for April)
  day: number;       // dd (1-31, e.g., 9)
  build: number;     // BuildNumber (starts at 1)
}

export interface VersionString {
  full: string;      // "2604.9.1"
  date: string;       // "2604.9"
}

/**
 * Parse version string like "2604.9.1" into Version object
 */
export function parseVersion(versionStr: string): Version | null {
  const match = versionStr.match(/^(\d{2})(\d{2})\.(\d{1,2})\.(\d+)$/);
  if (!match) return null;

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  const build = parseInt(match[4], 10);

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (build < 1) return null;

  return { year, month, day, build };
}

/**
 * Format Version object into string like "2604.9.1"
 */
export function formatVersion(version: Version): string {
  const monthStr = version.month.toString().padStart(2, '0'); // MM, padded
  const dayStr = version.day.toString();                      // dd, no padding
  return `${version.year}${monthStr}.${dayStr}.${version.build}`;
}

/**
 * Get current date as Version components (using local time)
 */
export function getCurrentDateVersion(): Pick<Version, 'year' | 'month' | 'day'> {
  const now = new Date();
  const yearStr = now.getFullYear().toString();
  return {
    year: parseInt(yearStr.slice(-2), 10),
    month: now.getMonth() + 1,
    day: now.getDate(),
  };
}

/**
 * Read current version from package.json
 */
export function readCurrentVersion(): Version | null {
  try {
    const content = fs.readFileSync(PACKAGE_JSON_PATH, 'utf-8');
    const pkg = JSON.parse(content);
    if (!pkg.version) return null;
    return parseVersion(pkg.version);
  } catch {
    return null;
  }
}

/**
 * Calculate next version based on current version and today's date
 *
 * Rules:
 * - If date matches today -> build + 1
 * - If date differs -> reset build to 1, update date
 */
export function calculateNextVersion(current: Version | null): Version {
  const today = getCurrentDateVersion();

  if (!current) {
    // No current version, start with today and build 1
    return { ...today, build: 1 };
  }

  // Check if year, month, and day match
  if (current.year === today.year && current.month === today.month && current.day === today.day) {
    // Same date, increment build
    return { ...current, build: current.build + 1 };
  }

  // Different date, reset build to 1 with new date
  return { ...today, build: 1 };
}

/**
 * Write new version to package.json
 */
export function writeVersion(version: Version): void {
  const content = fs.readFileSync(PACKAGE_JSON_PATH, 'utf-8');
  const pkg = JSON.parse(content);
  pkg.version = formatVersion(version);
  fs.writeFileSync(PACKAGE_JSON_PATH, JSON.stringify(pkg, null, 2) + '\n');
}

/**
 * Bump version: read current, calculate next, write, return next version
 */
export function bumpVersion(): VersionString {
  const current = readCurrentVersion();
  const next = calculateNextVersion(current);
  writeVersion(next);

  const full = formatVersion(next);
  const date = `${next.year}${next.month}.${next.day}`;

  return { full, date };
}

/**
 * Get current version string without modifying anything
 */
export function getVersionString(): string | null {
  const current = readCurrentVersion();
  return current ? formatVersion(current) : null;
}
