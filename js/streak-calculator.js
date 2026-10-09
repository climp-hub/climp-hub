/**
 * Calculates contribution streaks and verified statistics from calendar weeks.
 * Supports both trailing 365-day periods and specific calendar years.
 *
 * @param {Array} weeks - Array of weeks containing contributionDays
 * @returns {Object} Verified stats: total, activeDays, maxDaily, currentStreak, longestStreak
 */
export function calculateStreakStats(weeks = []) {
  const allDays = [];
  const safeWeeks = Array.isArray(weeks) ? weeks : [];

  for (const week of safeWeeks) {
    if (week && Array.isArray(week.contributionDays)) {
      for (const day of week.contributionDays) {
        if (day && day.date) {
          allDays.push({
            date: day.date,
            contributionCount: Number(day.contributionCount) || 0,
            intensity: Number(day.intensity) || 0,
            weekday: Number(day.weekday) || 0,
          });
        }
      }
    }
  }

  // Ensure chronological order
  allDays.sort((a, b) => a.date.localeCompare(b.date));

  let totalContributions = 0;
  let activeDays = 0;
  let maxDailyContributions = 0;
  let longestStreak = 0;
  let currentStreak = 0;
  let tempStreak = 0;

  for (const day of allDays) {
    totalContributions += day.contributionCount;
    if (day.contributionCount > 0) {
      activeDays++;
      tempStreak++;
      if (tempStreak > longestStreak) {
        longestStreak = tempStreak;
      }
      if (day.contributionCount > maxDailyContributions) {
        maxDailyContributions = day.contributionCount;
      }
    } else {
      tempStreak = 0;
    }
  }

  // Calculate current streak from the latest day
  // If the last day has 0 contributions, check if yesterday had contributions.
  let streakCount = 0;
  const n = allDays.length;
  if (n > 0) {
    const lastDay = allDays[n - 1];
    let startIndex = n - 1;

    // If latest day has 0 contributions, streak may still be active if yesterday was active
    if (lastDay.contributionCount === 0 && n >= 2) {
      startIndex = n - 2;
    }

    for (let i = startIndex; i >= 0; i--) {
      if (allDays[i].contributionCount > 0) {
        streakCount++;
      } else {
        break;
      }
    }
  }
  currentStreak = streakCount;

  return {
    totalContributions,
    activeDays,
    maxDailyContributions,
    longestStreak,
    currentStreak,
    totalDays: allDays.length,
  };
}

/**
 * Maps raw contribution count to GitHub intensity level (0 to 4).
 *
 * @param {number} count
 * @returns {number} Intensity level 0, 1, 2, 3, or 4
 */
export function mapContributionIntensity(count) {
  const c = Number(count) || 0;
  if (c <= 0) return 0;
  if (c <= 3) return 1;
  if (c <= 6) return 2;
  if (c <= 9) return 3;
  return 4;
}

/**
 * Sanitizes calendar payload ensuring no private repo names or sensitive tokens exist.
 *
 * @param {Object} data - Raw calendar payload
 * @returns {Object} Sanitized object
 */
export function sanitizeCalendarData(data) {
  if (!data) return null;

  return {
    label: String(data.label || ''),
    totalContributions: Number(data.totalContributions) || 0,
    publicContributions: Number(data.publicContributions ?? data.totalContributions) || 0,
    restrictedContributionsCount: Number(data.restrictedContributionsCount) || 0,
    months: (data.months || []).map(m => ({
      name: String(m.name || ''),
      firstDay: String(m.firstDay || ''),
      totalWeeks: Number(m.totalWeeks) || 0,
    })),
    weeks: (data.weeks || []).map(w => ({
      contributionDays: (w.contributionDays || []).map(d => ({
        date: String(d.date || ''),
        contributionCount: Number(d.contributionCount) || 0,
        weekday: Number(d.weekday) || 0,
        intensity: mapContributionIntensity(d.contributionCount),
        color: String(d.color || '#161b22'),
      })),
    })),
    stats: calculateStreakStats(data.weeks || []),
  };
}
