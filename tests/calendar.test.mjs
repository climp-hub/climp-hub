import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  calculateStreakStats,
  mapContributionIntensity,
  sanitizeCalendarData,
} from '../js/streak-calculator.js';
import { renderIsometricCalendarSVG } from '../scripts/generate-dark-svg.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

// -----------------------------------------------------------------------------
// 1. Contribution-date parsing and calendar layout
// -----------------------------------------------------------------------------
test('Suite 1: Contribution-date parsing and calendar layout', async (t) => {
  const jsonPath = path.join(REPO_ROOT, 'data', 'contributions.json');
  assert.ok(fs.existsSync(jsonPath), 'contributions.json must exist');

  const raw = fs.readFileSync(jsonPath, 'utf8');
  const data = JSON.parse(raw);

  await t.test('Calendar has standard week and day structures', () => {
    const cal2026 = data.years['2026'];
    assert.ok(cal2026, '2026 calendar must exist');
    assert.ok(Array.isArray(cal2026.weeks), 'weeks must be an array');
    assert.ok(cal2026.weeks.length >= 52 && cal2026.weeks.length <= 54, `Week count (${cal2026.weeks.length}) is valid for full year`);

    for (const week of cal2026.weeks) {
      assert.ok(Array.isArray(week.contributionDays), 'week.contributionDays must be an array');
      for (const day of week.contributionDays) {
        assert.match(day.date, /^\d{4}-\d{2}-\d{2}$/, `Date ${day.date} must match ISO YYYY-MM-DD`);
        assert.ok(typeof day.contributionCount === 'number', 'contributionCount must be a number');
        assert.ok(day.contributionCount >= 0, 'contributionCount cannot be negative');
      }
    }
  });

  await t.test('Months metadata aligns with calendar weeks', () => {
    const trailingCal = data.years['lastYear'];
    assert.ok(Array.isArray(trailingCal.months), 'months metadata must exist');
    assert.ok(trailingCal.months.length >= 12, 'trailing calendar should cover at least 12 months');
    for (const month of trailingCal.months) {
      assert.ok(month.name && month.name.length > 0, 'Month name must be present');
      assert.match(month.firstDay, /^\d{4}-\d{2}-\d{2}$/, 'firstDay must be formatted date');
    }
  });
});

// -----------------------------------------------------------------------------
// 2. Correct weekly and weekday ordering
// -----------------------------------------------------------------------------
test('Suite 2: Correct weekly and weekday ordering', () => {
  const jsonPath = path.join(REPO_ROOT, 'data', 'contributions.json');
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const cal = data.years['2024'];

  for (const week of cal.weeks) {
    let lastWeekday = -1;
    for (const day of week.contributionDays) {
      assert.ok(day.weekday >= 0 && day.weekday <= 6, `Weekday ${day.weekday} must be between 0 (Sun) and 6 (Sat)`);
      assert.ok(day.weekday > lastWeekday, `Weekdays must strictly ascend in week: ${day.weekday} > ${lastWeekday}`);
      lastWeekday = day.weekday;
    }
  }
});

// -----------------------------------------------------------------------------
// 3. Contribution intensity mapping
// -----------------------------------------------------------------------------
test('Suite 3: Contribution intensity mapping (0 to 4)', () => {
  // 0 contributions
  assert.strictEqual(mapContributionIntensity(0), 0);
  assert.strictEqual(mapContributionIntensity(-5), 0);
  assert.strictEqual(mapContributionIntensity(null), 0);
  assert.strictEqual(mapContributionIntensity(undefined), 0);

  // Level 1: 1 - 3
  assert.strictEqual(mapContributionIntensity(1), 1);
  assert.strictEqual(mapContributionIntensity(2), 1);
  assert.strictEqual(mapContributionIntensity(3), 1);

  // Level 2: 4 - 6
  assert.strictEqual(mapContributionIntensity(4), 2);
  assert.strictEqual(mapContributionIntensity(5), 2);
  assert.strictEqual(mapContributionIntensity(6), 2);

  // Level 3: 7 - 9
  assert.strictEqual(mapContributionIntensity(7), 3);
  assert.strictEqual(mapContributionIntensity(8), 3);
  assert.strictEqual(mapContributionIntensity(9), 3);

  // Level 4: 10+
  assert.strictEqual(mapContributionIntensity(10), 4);
  assert.strictEqual(mapContributionIntensity(25), 4);
  assert.strictEqual(mapContributionIntensity(100), 4);
});

// -----------------------------------------------------------------------------
// 4. Empty and missing data handling
// -----------------------------------------------------------------------------
test('Suite 4: Empty and missing data handling', () => {
  const emptyStats = calculateStreakStats([]);
  assert.deepStrictEqual(emptyStats, {
    totalContributions: 0,
    activeDays: 0,
    maxDailyContributions: 0,
    longestStreak: 0,
    currentStreak: 0,
    totalDays: 0,
  });

  const nullStats = calculateStreakStats(null);
  assert.strictEqual(nullStats.totalContributions, 0);

  // Missing properties in week objects
  const malformedWeeks = [
    { contributionDays: null },
    {},
    { contributionDays: [{ date: '2026-01-01', contributionCount: 0 }] },
  ];
  const malformedStats = calculateStreakStats(malformedWeeks);
  assert.strictEqual(malformedStats.totalContributions, 0);
  assert.strictEqual(malformedStats.totalDays, 1);
});

// -----------------------------------------------------------------------------
// 5. Year navigation and boundary dates
// -----------------------------------------------------------------------------
test('Suite 5: Year navigation and boundary dates', () => {
  const jsonPath = path.join(REPO_ROOT, 'data', 'contributions.json');
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  const expectedYears = ['2021', '2022', '2023', '2024', '2025', '2026', 'lastYear'];
  for (const yr of expectedYears) {
    assert.ok(data.years[yr], `Year ${yr} must be navigable and present in data`);
  }

  // Leap year 2024 verification
  const leapDays = [];
  for (const week of data.years['2024'].weeks) {
    for (const day of week.contributionDays) {
      if (day.date.startsWith('2024')) {
        leapDays.push(day.date);
      }
    }
  }
  assert.ok(leapDays.includes('2024-02-29'), 'Leap year 2024 must include February 29');
  assert.strictEqual(leapDays.length, 366, 'Leap year 2024 must have exactly 366 calendar days');

  // Year boundary verification: Dec 31 to Jan 1 continuity
  const cal2023 = data.years['2023'];
  const dates2023 = cal2023.weeks.flatMap(w => w.contributionDays.map(d => d.date)).filter(d => d.startsWith('2023'));
  assert.strictEqual(dates2023[0], '2023-01-01', 'First day of 2023 must be 2023-01-01');
  assert.strictEqual(dates2023[dates2023.length - 1], '2023-12-31', 'Last day of 2023 must be 2023-12-31');
});

// -----------------------------------------------------------------------------
// 6. Public/private data separation
// -----------------------------------------------------------------------------
test('Suite 6: Public/private data separation and sanitization', () => {
  const jsonPath = path.join(REPO_ROOT, 'data', 'contributions.json');
  const content = fs.readFileSync(jsonPath, 'utf8');

  // Verify that no private metadata, commit messages, tokens, or repo names are leaked
  assert.doesNotMatch(content, /"repository"/i, 'Must not expose repository objects');
  assert.doesNotMatch(content, /"commit"/i, 'Must not expose commit messages');
  assert.doesNotMatch(content, /ghp_|github_pat_/i, 'Must not expose tokens');
  assert.doesNotMatch(content, /"email"/i, 'Must not expose author emails');

  // Test sanitizeCalendarData utility
  const taintedData = {
    label: '2026',
    totalContributions: 5,
    privateRepoDetails: { secretName: 'top-secret' },
    weeks: [
      {
        contributionDays: [
          { date: '2026-05-01', contributionCount: 2, commitMessage: 'fix: internal bug' },
        ],
      },
    ],
  };

  const sanitized = sanitizeCalendarData(taintedData);
  assert.strictEqual(sanitized.totalContributions, 5);
  assert.strictEqual(sanitized.privateRepoDetails, undefined, 'Must strip private details');
  assert.strictEqual(sanitized.weeks[0].contributionDays[0].commitMessage, undefined, 'Must strip commit messages');
});

// -----------------------------------------------------------------------------
// 7. SVG generation and deterministic output
// -----------------------------------------------------------------------------
test('Suite 7: SVG generation and deterministic output', () => {
  const mockCalendar = {
    label: '2026',
    totalContributions: 1,
    months: [{ name: 'Oct', firstDay: '2026-10-01', totalWeeks: 1 }],
    weeks: [
      {
        contributionDays: [
          { date: '2026-10-08', contributionCount: 1, intensity: 1, weekday: 4 },
        ],
      },
    ],
    stats: {
      totalContributions: 1,
      longestStreak: 1,
      currentStreak: 0,
    },
  };

  const svg1 = renderIsometricCalendarSVG(mockCalendar, { username: 'climp-hub', year: '2026' });
  const svg2 = renderIsometricCalendarSVG(mockCalendar, { username: 'climp-hub', year: '2026' });

  assert.ok(svg1.startsWith('<svg'), 'Generated SVG must begin with <svg');
  assert.ok(svg1.endsWith('</svg>'), 'Generated SVG must end with </svg>');
  assert.ok(svg1.includes('viewBox="0 0 1200 680"'), 'SVG must include defined viewBox');
  assert.strictEqual(svg1, svg2, 'SVG generation must be strictly deterministic (identical outputs for identical inputs)');

  // Verify static SVG files in repository
  const darkSvgPath = path.join(REPO_ROOT, 'profile-3d-contrib', 'profile-3d-dark.svg');
  assert.ok(fs.existsSync(darkSvgPath), 'profile-3d-dark.svg must exist');
  const darkContent = fs.readFileSync(darkSvgPath, 'utf8');
  assert.ok(darkContent.includes('climp-hub'), 'profile-3d-dark.svg must contain username');
  assert.doesNotMatch(darkContent, /ghp_|github_pat_|repository|commit/i, 'Public SVG must contain no sensitive data');
});

// -----------------------------------------------------------------------------
// 8. Streak calculation and existing compatibility
// -----------------------------------------------------------------------------
test('Suite 8: Streak calculation correctness and compatibility', async (t) => {
  await t.test('Correctly calculates multi-day streaks', () => {
    const mockWeeks = [
      {
        contributionDays: [
          { date: '2026-10-01', contributionCount: 1 },
          { date: '2026-10-02', contributionCount: 2 },
          { date: '2026-10-03', contributionCount: 1 },
          { date: '2026-10-04', contributionCount: 0 }, // Break
          { date: '2026-10-05', contributionCount: 1 },
          { date: '2026-10-06', contributionCount: 3 },
        ],
      },
    ];

    const stats = calculateStreakStats(mockWeeks);
    assert.strictEqual(stats.totalContributions, 8);
    assert.strictEqual(stats.activeDays, 5);
    assert.strictEqual(stats.maxDailyContributions, 3);
    assert.strictEqual(stats.longestStreak, 3); // Oct 1, 2, 3
    assert.strictEqual(stats.currentStreak, 2); // Oct 5, 6
  });

  await t.test('Preserves existing README references and compatibility', () => {
    const readmePath = path.join(REPO_ROOT, 'README.md');
    const readme = fs.readFileSync(readmePath, 'utf8');

    // Must reference the existing profile-green-animate.svg
    assert.ok(readme.includes('profile-3d-contrib/profile-green-animate.svg'), 'README must retain reference to profile-green-animate.svg');
    // Must contain original profile bio and links
    assert.ok(readme.includes("Hi, I'm KANISHQ 👋"), 'README must retain profile greeting');
    assert.ok(readme.includes('s3n5e.netlify.app'), 'README must retain portfolio link');
    assert.ok(readme.includes('tryhackme.com/p/S3N5E'), 'README must retain TryHackMe link');
    assert.ok(readme.includes('app.hackthebox.com/profile/1803320'), 'README must retain HackTheBox link');
    assert.ok(readme.includes('0009-0002-8493-0725'), 'README must retain ORCID link');

    // Existing SVG file must exist and be non-empty
    const existingSvg = path.join(REPO_ROOT, 'profile-3d-contrib', 'profile-green-animate.svg');
    assert.ok(fs.existsSync(existingSvg), 'Existing profile-green-animate.svg must not be deleted');
    const stat = fs.statSync(existingSvg);
    assert.ok(stat.size > 1000, 'profile-green-animate.svg must be non-empty');
  });
});

