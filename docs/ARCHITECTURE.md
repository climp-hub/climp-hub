# Architecture & Developer Documentation

## climp-hub 3D GitHub Contribution Experience

### 1. Overview & Design Philosophy
This repository upgrades the `climp-hub` GitHub profile from a static-only SVG display into a dual-layer experience:
1. **Public GitHub Profile (`README.md`)**: Renders deterministic 3D/isometric vector images (`profile-3d-contrib/profile-green-animate.svg` and `profile-3d-contrib/profile-3d-dark.svg`) with direct launch links to the web experience. Fully compatible with GitHub's image rendering and markdown sanitizer.
2. **Interactive 3D WebGL Dashboard (`index.html`)**: A browser-accessible web application featuring real Three.js voxel cube rendering, realistic lighting, interactive camera controls (OrbitControls), hover tooltips with exact counts and dates, multi-year navigation, and verified statistics.

---

### 2. Architecture & Directory Structure

```
climp-hub/
├── .github/
│   └── workflows/
│       └── profile-3d.yml        # Automated daily generation & verification workflow
├── data/
│   └── contributions.json        # Verified, sanitized multi-year contribution dataset
├── css/
│   └── style.css                 # Dark GitHub theme interface styles
├── js/
│   ├── app.js                    # UI coordinator, event handling, view toggling
│   ├── calendar-3d.js            # Three.js 3D voxel engine & raycasting
│   ├── calendar-2d.js            # Accessible semantic HTML/ARIA 2D grid fallback
│   ├── data-service.js           # Data retrieval (Public dataset & Live Owner mode)
│   └── streak-calculator.js      # Streak analysis and data sanitization logic
├── profile-3d-contrib/           # Generated SVGs for GitHub profile
│   ├── profile-3d-dark.svg       # High-contrast dark 3D isometric SVG
│   ├── profile-green-animate.svg # Existing animated isometric SVG
│   └── ...                       # Legacy isometric SVGs preserved
├── scripts/
│   ├── fetch-contributions.mjs   # GitHub GraphQL API multi-year sync script
│   ├── generate-dark-svg.mjs     # Deterministic dark isometric SVG generator
│   └── serve.mjs                 # Zero-dependency local preview server
├── tests/
│   └── calendar.test.mjs         # Test suite covering all 8 quality gates
├── vendor/                       # Self-contained Three.js ES modules
│   ├── three.module.js
│   └── addons/
│       └── controls/OrbitControls.js
├── index.html                    # Interactive dashboard entry point
├── package.json                  # Scripts and test commands
└── README.md                     # GitHub profile README
```

---

### 3. Data & Privacy Boundary

#### A. Public Mode (Safe for All Visitors)
- Uses pre-aggregated, sanitized data in `data/contributions.json`.
- Contains only: date, weekday, contribution count, and computed intensity level.
- **Strict Privacy**: Zero repository names, commit messages, issue titles, author emails, or tokens exist in public datasets or client-side JavaScript.
- Private contributions are reported as locked or 0.

#### B. Owner Mode (Authenticated Access)
- The profile owner can click **Authenticate (Owner Mode)**.
- Prompts for a GitHub Personal Access Token (Classic with `read:user` or Fine-Grained with profile read permissions).
- **Zero-Persistence Guarantee**:
  - The token is stored strictly in JavaScript runtime variable memory.
  - It is **never** written to `localStorage`, `sessionStorage`, cookies, or disk.
  - It is **never** sent to any third-party backend; requests are made directly from the user's browser to `https://api.github.com/graphql`.
  - Closing the tab or clicking **Lock Owner Mode** immediately purges the token from memory.

---

### 4. 3D Voxel Engine Details

- **Geometry & Performance**: Uses box geometries with heights corresponding to activity levels (Level 0: 0.12 base tile up to Level 4: 2.20 vibrant green pillar).
- **Lighting**: Three-point studio lighting with a directional key light, ambient fill, and subtle green accent point light.
- **Controls**: Three.js `OrbitControls` with damping enabled, bounded pitch angle to prevent viewing beneath the base platform, zoom limits, and smooth camera reset.
- **Raycasting**: Precise pointer raycasting highlights the active cube on hover and displays an HTML tooltip with the exact date, contribution count, and level.
- **Accessibility & Fallback**: Detects WebGL capability automatically. If unavailable, or when toggled via the `2D Accessible Grid` button, presents a keyboard-focusable, screen-reader-accessible table with complete ARIA attributes.

---

### 5. Local Development & Preview

#### Run the Test Suite
```bash
npm test
```

#### Run the Preview Server
```bash
npm run preview
# Open http://localhost:3000 in your browser
```

#### Fetch Fresh Contribution Data (Local)
Requires `GITHUB_TOKEN` environment variable or active `gh` CLI authentication:
```bash
npm run fetch-data
```

#### Regenerate Static SVGs
```bash
npm run generate-svg
```

---

### 6. GitHub Pages Deployment

The dashboard is structured to run directly on GitHub Pages with zero build steps needed:
1. In repository settings on GitHub, navigate to **Pages**.
2. Under **Build and deployment > Source**, select **Deploy from a branch**.
3. Choose the `main` branch and `/ (root)` folder, then save.
4. The dashboard will be live at `https://climp-hub.github.io/climp-hub/`.

---

### 7. Troubleshooting

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| **WebGL Warning Banner Shown** | Browser has hardware acceleration disabled or running in an environment without GPU support. | Click "2D Accessible Grid" or enable hardware acceleration in browser settings. |
| **GraphQL 401 Unauthorized in Owner Mode** | Invalid or expired GitHub Personal Access Token. | Generate a new token with `read:user` scope at [github.com/settings/tokens](https://github.com/settings/tokens). |
| **CORS error loading data locally** | Opening `index.html` via `file://` protocol directly in browsers that restrict local fetch. | Run `npm run preview` to serve via HTTP at `http://localhost:3000`. |
| **Actions Workflow Skipped Commit** | No contribution changes since yesterday. | Expected behavior: workflow uses change detection to avoid empty commits. |

