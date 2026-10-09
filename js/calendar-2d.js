/**
 * Accessible 2D contribution calendar fallback.
 * Renders semantic, accessible HTML with full ARIA attributes and keyboard support.
 */
export class Calendar2DFallback {
  constructor(containerElement, options = {}) {
    this.container = containerElement;
    this.options = {
      onTileHover: options.onTileHover || null,
      onTileLeave: options.onTileLeave || null,
      ...options,
    };
    this.table = null;
  }

  render(calendarData) {
    this.container.innerHTML = '';
    if (!calendarData || !calendarData.weeks) {
      this.container.innerHTML = '<div class="empty-state">No contribution data available.</div>';
      return;
    }

    const weeks = calendarData.weeks;
    const months = calendarData.months || [];

    const wrapper = document.createElement('div');
    wrapper.className = 'calendar-2d-wrapper';
    wrapper.setAttribute('role', 'region');
    wrapper.setAttribute('aria-label', `Contribution Calendar ${calendarData.label || ''}`);

    const table = document.createElement('table');
    table.className = 'calendar-2d-table';
    table.setAttribute('role', 'grid');
    table.setAttribute('aria-label', 'Contribution Grid');

    // Months row
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const cornerTh = document.createElement('th');
    cornerTh.className = 'weekday-col';
    cornerTh.setAttribute('aria-hidden', 'true');
    headerRow.appendChild(cornerTh);

    for (let c = 0; c < weeks.length; c++) {
      const th = document.createElement('th');
      const week = weeks[c];
      const firstDay = week.contributionDays?.[0]?.date;
      const monthMatch = months.find(m => m.firstDay === firstDay);
      if (monthMatch) {
        th.textContent = monthMatch.name;
        th.className = 'month-label';
      }
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Days rows (0 = Sun, 1 = Mon, ..., 6 = Sat)
    const tbody = document.createElement('tbody');
    const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (let r = 0; r < 7; r++) {
      const tr = document.createElement('tr');
      tr.setAttribute('role', 'row');

      const dayHeader = document.createElement('th');
      dayHeader.className = 'weekday-label';
      dayHeader.setAttribute('scope', 'row');
      dayHeader.textContent = (r === 1 || r === 3 || r === 5) ? weekdayNames[r] : '';
      tr.appendChild(dayHeader);

      for (let c = 0; c < weeks.length; c++) {
        const td = document.createElement('td');
        td.setAttribute('role', 'gridcell');

        const day = weeks[c].contributionDays?.find(d => d.weekday === r);

        if (day) {
          const count = day.contributionCount || 0;
          const countStr = count === 1 ? '1 contribution' : `${count} contributions`;
          const intensity = day.intensity ?? 0;

          td.className = `contrib-tile level-${intensity}`;
          td.setAttribute('tabindex', '0');
          td.setAttribute('aria-label', `${countStr} on ${day.date}`);
          td.dataset.date = day.date;
          td.dataset.count = String(count);
          td.dataset.intensity = String(intensity);

          td.addEventListener('pointerenter', (e) => {
            if (this.options.onTileHover) {
              this.options.onTileHover({
                date: day.date,
                contributionCount: count,
                intensity,
                weekday: r,
                clientX: e.clientX,
                clientY: e.clientY,
              });
            }
          });

          td.addEventListener('pointerleave', () => {
            if (this.options.onTileLeave) {
              this.options.onTileLeave();
            }
          });

          td.addEventListener('focus', () => {
            const rect = td.getBoundingClientRect();
            if (this.options.onTileHover) {
              this.options.onTileHover({
                date: day.date,
                contributionCount: count,
                intensity,
                weekday: r,
                clientX: rect.left + rect.width / 2,
                clientY: rect.top,
              });
            }
          });

          td.addEventListener('blur', () => {
            if (this.options.onTileLeave) {
              this.options.onTileLeave();
            }
          });
        } else {
          td.className = 'contrib-tile empty';
          td.setAttribute('aria-hidden', 'true');
        }

        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    wrapper.appendChild(table);
    this.container.appendChild(wrapper);
    this.table = table;
  }

  dispose() {
    this.container.innerHTML = '';
    this.table = null;
  }
}

