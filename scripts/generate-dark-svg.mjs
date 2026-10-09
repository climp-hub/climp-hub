import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

export function renderIsometricCalendarSVG(calendarData, options = {}) {
  const {
    width = 1200,
    height = 680,
    username = 'climp-hub',
    year = '2026',
  } = options;

  const weeks = calendarData.weeks || [];
  const stats = calendarData.stats || {
    totalContributions: calendarData.totalContributions || 0,
    longestStreak: 0,
    currentStreak: 0,
  };

  // Isometric projection constants
  const originX = 140;
  const originY = 320;
  const tileW = 16;
  const tileH = 9.24; // tileW * tan(30 deg)

  // Height multiplier for voxel columns
  const heightLevels = [2, 10, 20, 32, 46];

  // Palette definition: top, left face, right face, highlight stroke
  const palette = [
    { top: '#161b22', left: '#0e131a', right: '#080b0f', stroke: '#21262d' }, // 0
    { top: '#0e4429', left: '#092d1b', right: '#051d11', stroke: '#006d32' }, // 1
    { top: '#006d32', left: '#004d23', right: '#003317', stroke: '#26a641' }, // 2
    { top: '#26a641', left: '#1b7a2e', right: '#12531e', stroke: '#39d353' }, // 3
    { top: '#39d353', left: '#289d3c', right: '#1c6e2a', stroke: '#56ff76' }, // 4
  ];

  // Build cubes list and sort by rendering order (back to front: row + col)
  const cubes = [];
  for (let c = 0; c < weeks.length; c++) {
    const days = weeks[c].contributionDays || [];
    for (let r = 0; r < days.length; r++) {
      const day = days[r];
      const intensity = Math.min(4, Math.max(0, day.intensity ?? 0));
      cubes.push({
        col: c,
        row: r,
        intensity,
        count: day.contributionCount,
        date: day.date,
        sortKey: c + r,
      });
    }
  }

  // Sort: earlier col+row drawn first (isometric painter's algorithm)
  cubes.sort((a, b) => a.sortKey - b.sortKey);

  // SVG cube builder
  const cubeElements = cubes.map(cube => {
    const h = heightLevels[cube.intensity];
    const pal = palette[cube.intensity];

    // Center of top diamond at ground level
    // col increases along (+x, +y_iso), row increases along (-x, +y_iso)
    const gx = originX + (cube.col * tileW) - (cube.row * tileW * 0.58);
    const gy = originY + (cube.col * tileH * 0.58) + (cube.row * tileH);

    // Apply cube extrusion height (-h in y)
    const tx = gx;
    const ty = gy - h;

    // Top face diamond
    const pTop = `M ${tx} ${ty - tileH} L ${tx + tileW} ${ty} L ${tx} ${ty + tileH} L ${tx - tileW} ${ty} Z`;

    // Left face
    const pLeft = `M ${tx - tileW} ${ty} L ${tx} ${ty + tileH} L ${tx} ${ty + tileH + h} L ${tx - tileW} ${ty + h} Z`;

    // Right face
    const pRight = `M ${tx} ${ty + tileH} L ${tx + tileW} ${ty} L ${tx + tileW} ${ty + h} L ${tx} ${ty + tileH + h} Z`;

    return `
    <g class="cube" data-date="${cube.date}" data-count="${cube.count}">
      <path d="${pLeft}" fill="${pal.left}" />
      <path d="${pRight}" fill="${pal.right}" />
      <path d="${pTop}" fill="${pal.top}" stroke="${pal.stroke}" stroke-width="0.5" />
    </g>`;
  }).join('');

  // Months labels
  const monthLabels = (calendarData.months || []).map(m => {
    // find approx column for month's first week
    const colIndex = weeks.findIndex(w => w.contributionDays.some(d => d.date >= m.firstDay));
    const safeCol = colIndex >= 0 ? colIndex : 0;
    const mx = originX + (safeCol * tileW) + 20;
    const my = originY + (safeCol * tileH * 0.58) - 45;
    return `<text x="${mx.toFixed(1)}" y="${my.toFixed(1)}" fill="#8b949e" font-size="12" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">${m.name}</text>`;
  }).join('\n    ');

  const total = stats.totalContributions ?? calendarData.totalContributions ?? 0;
  const longest = stats.longestStreak ?? 0;
  const current = stats.currentStreak ?? 0;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b0f19" />
      <stop offset="100%" stop-color="#010409" />
    </linearGradient>
    <linearGradient id="cardGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#161b22" />
      <stop offset="100%" stop-color="#0d1117" />
    </linearGradient>
    <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Background container -->
  <rect width="${width}" height="${height}" rx="16" fill="url(#bg)" stroke="#30363d" stroke-width="1.5" />

  <!-- Header Section -->
  <g transform="translate(48, 48)">
    <!-- Avatar / Icon badge -->
    <rect x="0" y="0" width="44" height="44" rx="10" fill="#238636" fill-opacity="0.2" stroke="#238636" stroke-width="1.5" />
    <path d="M 12 28 L 22 14 L 32 28 Z" fill="#39d353" />
    <circle cx="22" cy="18" r="3" fill="#ffffff" />

    <!-- Title & Subtitle -->
    <text x="58" y="20" fill="#f0f6fc" font-size="18" font-weight="600" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
      ${username}'s 3D Contribution Graph
    </text>
    <text x="58" y="38" fill="#8b949e" font-size="13" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
      Verified Year: ${year} • Isometric 3D Projection
    </text>

    <!-- Stats badges on top right -->
    <g transform="translate(${width - 480}, 0)">
      <!-- Total Contributions -->
      <g>
        <rect x="0" y="0" width="120" height="46" rx="8" fill="url(#cardGrad)" stroke="#30363d" stroke-width="1" />
        <text x="12" y="18" fill="#8b949e" font-size="11" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">CONTRIBUTIONS</text>
        <text x="12" y="37" fill="#39d353" font-size="16" font-weight="700" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">${total}</text>
      </g>
      <!-- Longest Streak -->
      <g transform="translate(130, 0)">
        <rect x="0" y="0" width="120" height="46" rx="8" fill="url(#cardGrad)" stroke="#30363d" stroke-width="1" />
        <text x="12" y="18" fill="#8b949e" font-size="11" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">BEST STREAK</text>
        <text x="12" y="37" fill="#f0f6fc" font-size="16" font-weight="700" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">${longest} ${longest === 1 ? 'day' : 'days'}</text>
      </g>
      <!-- Current Streak -->
      <g transform="translate(260, 0)">
        <rect x="0" y="0" width="120" height="46" rx="8" fill="url(#cardGrad)" stroke="#30363d" stroke-width="1" />
        <text x="12" y="18" fill="#8b949e" font-size="11" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">CURRENT</text>
        <text x="12" y="37" fill="#f0f6fc" font-size="16" font-weight="700" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">${current} ${current === 1 ? 'day' : 'days'}</text>
      </g>
    </g>
  </g>

  <!-- Month labels -->
  <g>
    ${monthLabels}
  </g>

  <!-- Voxel Canvas -->
  <g id="calendar-voxels">
    ${cubeElements}
  </g>

  <!-- Footer / Legend Section -->
  <g transform="translate(48, ${height - 40})">
    <text x="0" y="12" fill="#8b949e" font-size="12" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
      🎮 Interactive 3D WebGL Dashboard Available
    </text>

    <!-- Legend -->
    <g transform="translate(${width - 280}, 0)">
      <text x="0" y="12" fill="#8b949e" font-size="11" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">Less</text>
      <rect x="32" y="2" width="12" height="12" rx="2" fill="#161b22" stroke="#30363d" stroke-width="1" />
      <rect x="48" y="2" width="12" height="12" rx="2" fill="#0e4429" />
      <rect x="64" y="2" width="12" height="12" rx="2" fill="#006d32" />
      <rect x="80" y="2" width="12" height="12" rx="2" fill="#26a641" />
      <rect x="96" y="2" width="12" height="12" rx="2" fill="#39d353" />
      <text x="116" y="12" fill="#8b949e" font-size="11" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">More</text>
    </g>
  </g>
</svg>`;
}

export async function generateStaticSVGs() {
  const jsonPath = path.join(REPO_ROOT, 'data', 'contributions.json');
  const raw = await fs.readFile(jsonPath, 'utf8');
  const data = JSON.parse(raw);

  const outDir = path.join(REPO_ROOT, 'profile-3d-contrib');
  await fs.mkdir(outDir, { recursive: true });

  // Generate SVG for trailing 1 year (lastYear)
  const trailingCal = data.years['lastYear'] || data.years['2026'];
  const svgTrailing = renderIsometricCalendarSVG(trailingCal, {
    username: data.username,
    year: '2025-2026 (Trailing)',
  });
  await fs.writeFile(path.join(outDir, 'profile-3d-dark.svg'), svgTrailing, 'utf8');

  // Also generate for current year (2026)
  if (data.years['2026']) {
    const svg2026 = renderIsometricCalendarSVG(data.years['2026'], {
      username: data.username,
      year: '2026',
    });
    await fs.writeFile(path.join(outDir, 'profile-3d-2026.svg'), svg2026, 'utf8');
  }

  console.log('Successfully generated deterministic profile-3d-dark.svg and profile-3d-2026.svg');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  generateStaticSVGs().catch(err => {
    console.error('Error generating SVG:', err);
    process.exit(1);
  });
}
