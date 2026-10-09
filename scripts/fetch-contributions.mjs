import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const USERNAME = process.env.USERNAME || 'climp-hub';

const YEARS = [2026, 2025, 2024, 2023, 2022, 2021];

function calculateStats(weeks) {
  let totalCount = 0;
  let activeDays = 0;
  let maxDaily = 0;
  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;

  // Flatten chronological days
  const allDays = [];
  for (const week of weeks) {
    for (const day of week.contributionDays) {
      allDays.push(day);
    }
  }

  // Sort by date just to be sure
  allDays.sort((a, b) => a.date.localeCompare(b.date));

  for (const day of allDays) {
    totalCount += day.contributionCount;
    if (day.contributionCount > 0) {
      activeDays++;
      tempStreak++;
      if (tempStreak > longestStreak) {
        longestStreak = tempStreak;
      }
      if (day.contributionCount > maxDaily) {
        maxDaily = day.contributionCount;
      }
    } else {
      tempStreak = 0;
    }
  }

  // Calculate current streak from the end
  let cur = 0;
  for (let i = allDays.length - 1; i >= 0; i--) {
    if (allDays[i].contributionCount > 0) {
      cur++;
    } else {
      // If today or yesterday is 0, we check if streak was active yesterday
      if (i === allDays.length - 1) {
        // Today is 0, could have been active yesterday
        continue;
      }
      break;
    }
  }
  currentStreak = cur;

  return {
    totalContributions: totalCount,
    activeDays,
    maxDailyContributions: maxDaily,
    longestStreak,
    currentStreak,
  };
}

function mapIntensity(count) {
  if (count <= 0) return 0;
  if (count <= 3) return 1;
  if (count <= 6) return 2;
  if (count <= 9) return 3;
  return 4;
}

const GRAPHQL_QUERY = `
query($login: String!, $from: DateTime, $to: DateTime) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      restrictedContributionsCount
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            date
            contributionCount
            color
            weekday
          }
        }
        months {
          name
          firstDay
          totalWeeks
        }
      }
    }
  }
}
`;

async function executeQuery(variables) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `bearer ${token}`,
        'User-Agent': 'climp-hub-3d-contrib-fetcher',
      },
      body: JSON.stringify({
        query: GRAPHQL_QUERY,
        variables,
      }),
    });
    if (!res.ok) {
      throw new Error(`GraphQL request failed: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    if (data.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
    }
    return data.data;
  }

  // Fallback to local gh CLI if token is not passed in environment
  try {
    const stdout = execFileSync('gh', [
      'api',
      'graphql',
      '-f',
      `query=${GRAPHQL_QUERY}`,
      '-f',
      `login=${variables.login}`,
      ...(variables.from ? ['-f', `from=${variables.from}`] : []),
      ...(variables.to ? ['-f', `to=${variables.to}`] : []),
    ], { encoding: 'utf8' });
    const parsed = JSON.parse(stdout);
    return parsed.data;
  } catch (err) {
    throw new Error(`Failed to query GitHub GraphQL API: ${err.message}`);
  }
}

function processCalendarData(rawCollection, label) {
  const cal = rawCollection.contributionCalendar;
  const restricted = rawCollection.restrictedContributionsCount || 0;

  const weeks = cal.weeks.map(week => ({
    contributionDays: week.contributionDays.map(day => ({
      date: day.date,
      contributionCount: day.contributionCount,
      weekday: day.weekday,
      intensity: mapIntensity(day.contributionCount),
      color: day.color,
    })),
  }));

  const stats = calculateStats(weeks);

  return {
    label: String(label),
    totalContributions: cal.totalContributions,
    publicContributions: Math.max(0, cal.totalContributions - restricted),
    restrictedContributionsCount: restricted,
    months: cal.months,
    weeks,
    stats,
  };
}

export async function fetchAllContributions() {
  console.log(`Fetching contribution data for user: ${USERNAME}`);

  const output = {
    username: USERNAME,
    fetchedAt: new Date().toISOString(),
    availableYears: YEARS,
    years: {},
  };

  // 1. Fetch trailing 1 year ("lastYear")
  console.log('Fetching trailing 365 days (lastYear)...');
  const trailingData = await executeQuery({ login: USERNAME });
  if (trailingData?.user?.contributionsCollection) {
    output.years['lastYear'] = processCalendarData(
      trailingData.user.contributionsCollection,
      'lastYear'
    );
  }

  // 2. Fetch each calendar year
  for (const year of YEARS) {
    console.log(`Fetching year ${year}...`);
    const from = `${year}-01-01T00:00:00Z`;
    const to = `${year}-12-31T23:59:59Z`;
    const yearData = await executeQuery({ login: USERNAME, from, to });
    if (yearData?.user?.contributionsCollection) {
      output.years[String(year)] = processCalendarData(
        yearData.user.contributionsCollection,
        year
      );
    }
  }

  const outDir = path.join(REPO_ROOT, 'data');
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, 'contributions.json');
  await fs.writeFile(outPath, JSON.stringify(output, null, 2), 'utf8');
  console.log(`Successfully saved contribution data to ${outPath}`);

  return output;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fetchAllContributions().catch(err => {
    console.error('Error fetching contributions:', err);
    process.exit(1);
  });
}

