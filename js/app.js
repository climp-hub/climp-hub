import { ContributionDataService } from './data-service.js';
import { Calendar3DVisualization } from './calendar-3d.js';
import { Calendar2DFallback } from './calendar-2d.js';

class AppController {
  constructor() {
    this.dataService = new ContributionDataService('climp-hub');
    this.currentYear = 'lastYear';
    this.currentCalendarData = null;
    this.is3DMode = true;

    this.viz3D = null;
    this.viz2D = null;

    // DOM Elements
    this.canvasContainer = document.getElementById('canvas-container');
    this.fallbackContainer = document.getElementById('fallback-container');
    this.tooltipEl = document.getElementById('cube-tooltip');
    this.yearSelectEl = document.getElementById('year-select');

    // Stat Elements
    this.statTotal = document.getElementById('stat-total');
    this.statPublic = document.getElementById('stat-public');
    this.statPrivate = document.getElementById('stat-private');
    this.statLongest = document.getElementById('stat-longest');
    this.statCurrent = document.getElementById('stat-current');
    this.statActive = document.getElementById('stat-active');
    this.sourceBadge = document.getElementById('source-badge');

    // Modals & Controls
    this.ownerModal = document.getElementById('owner-modal');
    this.ownerBtn = document.getElementById('owner-btn');
    this.btnRotate = document.getElementById('btn-rotate');

    this.init();
  }

  async init() {
    this.bindControls();

    // Check WebGL availability
    const webGLSupported = Calendar3DVisualization.isWebGLAvailable();
    if (!webGLSupported) {
      console.warn('WebGL is not available in this environment. Falling back to accessible 2D view.');
      this.is3DMode = false;
      document.getElementById('webgl-warning')?.classList.remove('hidden');
      this.toggleViewMode(false);
    } else {
      this.init3D();
    }

    this.init2D();

    // Load initial data
    await this.loadYear(this.currentYear);
  }

  init3D() {
    if (this.viz3D) return;

    this.viz3D = new Calendar3DVisualization(this.canvasContainer, {
      onCubeHover: (data) => this.showTooltip(data),
      onCubeLeave: () => this.hideTooltip(),
    });
  }

  init2D() {
    if (this.viz2D) return;

    this.viz2D = new Calendar2DFallback(this.fallbackContainer, {
      onTileHover: (data) => this.showTooltip(data),
      onTileLeave: () => this.hideTooltip(),
    });
  }

  bindControls() {
    // Year selector change
    this.yearSelectEl.addEventListener('change', (e) => {
      this.loadYear(e.target.value);
    });

    // View toggle (3D vs 2D Accessible)
    document.getElementById('btn-view-toggle')?.addEventListener('click', () => {
      this.toggleViewMode(!this.is3DMode);
    });

    // Camera Controls
    document.getElementById('btn-reset-cam')?.addEventListener('click', () => {
      this.viz3D?.resetCamera();
    });

    this.btnRotate?.addEventListener('click', () => {
      const active = this.viz3D?.toggleAutoRotate();
      this.btnRotate.classList.toggle('active', active);
    });

    document.getElementById('btn-zoom-in')?.addEventListener('click', () => {
      this.viz3D?.zoomIn();
    });

    document.getElementById('btn-zoom-out')?.addEventListener('click', () => {
      this.viz3D?.zoomOut();
    });

    document.getElementById('btn-topdown')?.addEventListener('click', () => {
      this.viz3D?.setTopDownView();
    });

    // Owner mode modal triggers
    this.ownerBtn?.addEventListener('click', () => {
      if (this.dataService.isOwnerAuthenticated()) {
        this.disconnectOwner();
      } else {
        this.openOwnerModal();
      }
    });

    document.getElementById('modal-close-btn')?.addEventListener('click', () => {
      this.closeOwnerModal();
    });

    document.getElementById('token-submit-btn')?.addEventListener('click', () => {
      this.handleTokenSubmit();
    });
  }

  toggleViewMode(to3D) {
    this.is3DMode = to3D;
    const viewBtn = document.getElementById('btn-view-toggle');

    if (to3D) {
      this.canvasContainer.classList.remove('hidden');
      this.fallbackContainer.classList.add('hidden');
      document.querySelector('.canvas-toolbar')?.classList.remove('hidden');
      if (viewBtn) viewBtn.innerHTML = '<span>📊 2D Accessible Grid</span>';
      if (!this.viz3D && Calendar3DVisualization.isWebGLAvailable()) {
        this.init3D();
      }
      if (this.currentCalendarData && this.viz3D) {
        this.viz3D.renderCalendar(this.currentCalendarData);
      }
    } else {
      this.canvasContainer.classList.add('hidden');
      this.fallbackContainer.classList.remove('hidden');
      document.querySelector('.canvas-toolbar')?.classList.add('hidden');
      if (viewBtn) viewBtn.innerHTML = '<span>🧊 3D Voxel Canvas</span>';
      if (this.currentCalendarData && this.viz2D) {
        this.viz2D.render(this.currentCalendarData);
      }
    }
  }

  async loadYear(year) {
    this.currentYear = year;
    this.showLoading(true);

    try {
      const data = await this.dataService.getYearData(year);
      this.currentCalendarData = data;

      this.updateStats(data);

      if (this.is3DMode && this.viz3D) {
        this.viz3D.renderCalendar(data);
      } else if (this.viz2D) {
        this.viz2D.render(data);
      }

      this.showError(null);
    } catch (err) {
      console.error('Error loading calendar year:', err);
      this.showError(err.message || 'Failed to load contribution data.');
    } finally {
      this.showLoading(false);
    }
  }

  updateStats(data) {
    const stats = data.stats || {};
    const total = data.totalContributions ?? stats.totalContributions ?? 0;
    const isOwner = Boolean(data.isOwnerView);

    this.statTotal.textContent = total.toLocaleString();
    this.statPublic.textContent = (data.publicContributions ?? total).toLocaleString();

    if (isOwner) {
      this.statPrivate.textContent = (data.restrictedContributionsCount ?? 0).toLocaleString();
      this.statPrivate.parentElement.classList.remove('locked');
      this.statPrivate.parentElement.title = 'Private contributions unlocked via owner authorization';
    } else {
      this.statPrivate.textContent = 'Locked (Owner Only)';
      this.statPrivate.parentElement.classList.add('locked');
      this.statPrivate.parentElement.title = 'Private contributions require owner authorization';
    }

    this.statLongest.textContent = `${stats.longestStreak || 0} ${stats.longestStreak === 1 ? 'day' : 'days'}`;
    this.statCurrent.textContent = `${stats.currentStreak || 0} ${stats.currentStreak === 1 ? 'day' : 'days'}`;
    this.statActive.textContent = `${stats.activeDays || 0} ${stats.activeDays === 1 ? 'day' : 'days'}`;

    if (this.sourceBadge) {
      this.sourceBadge.textContent = isOwner
        ? '✓ Verified Owner Mode (Live GraphQL)'
        : '✓ Verified Public API Dataset';
      this.sourceBadge.className = isOwner ? 'badge badge-owner' : 'badge badge-verified';
    }
  }

  showTooltip(data) {
    if (!this.tooltipEl || !data) return;

    const count = data.contributionCount;
    const countText = count === 1 ? '1 contribution' : `${count} contributions`;

    // Format date string nicely: "Thursday, Oct 8, 2026"
    let formattedDate = data.date;
    try {
      const [y, m, d] = data.date.split('-').map(Number);
      const dateObj = new Date(Date.UTC(y, m - 1, d));
      formattedDate = dateObj.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      });
    } catch {}

    const intensityLevel = data.intensity ?? 0;
    const intensityBadge = `<span class="tooltip-badge level-${intensityLevel}">Level ${intensityLevel}</span>`;

    this.tooltipEl.innerHTML = `
      <div class="tooltip-header">
        <strong>${countText}</strong>
        ${intensityBadge}
      </div>
      <div class="tooltip-date">${formattedDate}</div>
    `;

    // Positioning
    const x = data.clientX + 14;
    const y = data.clientY - 42;

    this.tooltipEl.style.left = `${x}px`;
    this.tooltipEl.style.top = `${y}px`;
    this.tooltipEl.classList.remove('hidden');
  }

  hideTooltip() {
    this.tooltipEl?.classList.add('hidden');
  }

  showLoading(isLoading) {
    const loader = document.getElementById('loading-indicator');
    if (loader) {
      loader.classList.toggle('hidden', !isLoading);
    }
  }

  showError(message) {
    const errorBanner = document.getElementById('error-banner');
    if (!errorBanner) return;

    if (message) {
      errorBanner.textContent = `Notice: ${message}`;
      errorBanner.classList.remove('hidden');
    } else {
      errorBanner.classList.add('hidden');
    }
  }

  openOwnerModal() {
    this.ownerModal?.classList.remove('hidden');
    document.getElementById('token-input')?.focus();
  }

  closeOwnerModal() {
    this.ownerModal?.classList.add('hidden');
    const input = document.getElementById('token-input');
    if (input) input.value = '';
    const err = document.getElementById('modal-error');
    if (err) err.textContent = '';
  }

  async handleTokenSubmit() {
    const input = document.getElementById('token-input');
    const err = document.getElementById('modal-error');
    const token = input?.value?.trim();

    if (!token) {
      if (err) err.textContent = 'Please enter a GitHub Personal Access Token.';
      return;
    }

    if (err) err.textContent = 'Authenticating with GitHub GraphQL API...';

    try {
      const res = await this.dataService.authenticateOwner(token);
      if (res.success) {
        this.closeOwnerModal();
        this.ownerBtn.innerHTML = `<span>🔓 Lock Owner Mode (${res.viewerLogin})</span>`;
        this.ownerBtn.classList.add('btn-owner-active');

        // Reload current year with live owner data
        await this.loadYear(this.currentYear);
      }
    } catch (error) {
      if (err) err.textContent = error.message || 'Failed to authenticate.';
    }
  }

  disconnectOwner() {
    this.dataService.disconnectOwner();
    this.ownerBtn.innerHTML = `<span>🔐 Authenticate (Owner Mode)</span>`;
    this.ownerBtn.classList.remove('btn-owner-active');
    this.loadYear(this.currentYear);
  }
}

// Bootstrap application on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  new AppController();
});

