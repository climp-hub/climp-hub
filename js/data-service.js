import { sanitizeCalendarData, mapContributionIntensity, calculateStreakStats } from './streak-calculator.js';

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

export class ContributionDataService {
  constructor(defaultUsername = 'climp-hub') {
    this.username = defaultUsername;
    this.cachedData = null;
    this.ownerToken = null;
  }

  /**
   * Loads pre-generated public contribution data.
   */
  async loadPublicData() {
    if (this.cachedData) {
      return this.cachedData;
    }

    try {
      const response = await fetch('./data/contributions.json');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to load contributions.json`);
      }
      const json = await response.json();
      this.cachedData = json;
      return json;
    } catch (err) {
      console.warn('Failed to load local contributions.json:', err);
      throw err;
    }
  }

  /**
   * Retrieves data for a specific year from cache or static file.
   * @param {string|number} year - 'lastYear' or 4-digit year like '2026'
   */
  async getYearData(year = 'lastYear') {
    const key = String(year);

    if (this.ownerToken) {
      // If owner authenticated, fetch live data including restricted contributions
      return await this.fetchLiveOwnerYear(key);
    }

    const data = await this.loadPublicData();
    if (data && data.years && data.years[key]) {
      return sanitizeCalendarData(data.years[key]);
    }

    throw new Error(`Data for year "${year}" not available.`);
  }

  /**
   * Authenticates owner with session token in memory.
   * Does NOT write to disk, localStorage, or cookies.
   */
  async authenticateOwner(token) {
    if (!token || typeof token !== 'string') {
      throw new Error('Invalid token provided.');
    }
    const cleanToken = token.trim();

    // Verify token validity by testing a minimal query
    const testRes = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `bearer ${cleanToken}`,
      },
      body: JSON.stringify({
        query: `query { viewer { login } }`,
      }),
    });

    if (!testRes.ok) {
      if (testRes.status === 401) {
        throw new Error('Authentication failed: Invalid GitHub Personal Access Token.');
      }
      throw new Error(`GitHub API error: HTTP ${testRes.status}`);
    }

    const testData = await testRes.json();
    if (testData.errors) {
      throw new Error(testData.errors[0]?.message || 'GraphQL error verifying token.');
    }

    const viewerLogin = testData.data?.viewer?.login;
    this.ownerToken = cleanToken;

    return {
      success: true,
      viewerLogin,
      isOwner: viewerLogin?.toLowerCase() === this.username.toLowerCase(),
    };
  }

  /**
   * Wipes owner token from memory.
   */
  disconnectOwner() {
    this.ownerToken = null;
  }

  isOwnerAuthenticated() {
    return Boolean(this.ownerToken);
  }

  /**
   * Live fetch for a specific year with owner token.
   */
  async fetchLiveOwnerYear(yearKey) {
    if (!this.ownerToken) {
      throw new Error('Owner token not present.');
    }

    const variables = { login: this.username };
    if (yearKey !== 'lastYear') {
      variables.from = `${yearKey}-01-01T00:00:00Z`;
      variables.to = `${yearKey}-12-31T23:59:59Z`;
    }

    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `bearer ${this.ownerToken}`,
      },
      body: JSON.stringify({
        query: GRAPHQL_QUERY,
        variables,
      }),
    });

    if (!res.ok) {
      throw new Error(`Live query failed: HTTP ${res.status}`);
    }

    const result = await res.json();
    if (result.errors) {
      throw new Error(result.errors[0]?.message || 'Failed to query live contributions.');
    }

    const collection = result.data?.user?.contributionsCollection;
    if (!collection) {
      throw new Error(`No contribution data returned for ${this.username}.`);
    }

    const cal = collection.contributionCalendar;
    const restricted = collection.restrictedContributionsCount || 0;

    const weeks = cal.weeks.map(w => ({
      contributionDays: w.contributionDays.map(d => ({
        date: d.date,
        contributionCount: d.contributionCount,
        weekday: d.weekday,
        intensity: mapContributionIntensity(d.contributionCount),
        color: d.color,
      })),
    }));

    return {
      label: String(yearKey),
      totalContributions: cal.totalContributions,
      publicContributions: Math.max(0, cal.totalContributions - restricted),
      restrictedContributionsCount: restricted,
      isOwnerView: true,
      months: cal.months,
      weeks,
      stats: calculateStreakStats(weeks),
    };
  }
}

