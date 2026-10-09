#!/usr/bin/env python3
"""Generate a static isometric 3D-style GitHub contribution calendar SVG."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import os
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

GITHUB_GRAPHQL_URL = "https://api.github.com/graphql"

PALETTE = [
    "#161b22",  # 0 contributions
    "#0e4429",
    "#006d32",
    "#26a641",
    "#39d353",
]


@dataclass(frozen=True)
class DayCell:
    date: dt.date
    count: int
    weekday: int  # 0=Sunday..6=Saturday
    week_index: int


def clamp(value: int, minimum: int, maximum: int) -> int:
    return max(minimum, min(maximum, value))


def intensity_level(count: int, max_count: int) -> int:
    if count <= 0 or max_count <= 0:
        return 0
    ratio = count / max_count
    return clamp(int(math.ceil(ratio * (len(PALETTE) - 1))), 1, len(PALETTE) - 1)


def cube_height(count: int, max_count: int) -> int:
    if count <= 0 or max_count <= 0:
        return 0
    return clamp(int(round((count / max_count) * 10)), 1, 10)


def adjust_hex_color(color: str, percent: float) -> str:
    color = color.lstrip("#")
    r = int(color[0:2], 16)
    g = int(color[2:4], 16)
    b = int(color[4:6], 16)

    def channel(v: int) -> int:
        if percent >= 0:
            return clamp(int(v + (255 - v) * percent), 0, 255)
        return clamp(int(v * (1 + percent)), 0, 255)

    return f"#{channel(r):02x}{channel(g):02x}{channel(b):02x}"


def fetch_contribution_calendar(username: str, token: str, date_from: dt.date, date_to: dt.date) -> dict:
    query = """
    query($username: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $username) {
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                contributionCount
                date
                weekday
              }
            }
          }
        }
      }
    }
    """
    variables = {
        "username": username,
        "from": f"{date_from.isoformat()}T00:00:00Z",
        "to": f"{date_to.isoformat()}T23:59:59Z",
    }

    payload = json.dumps({"query": query, "variables": variables}).encode("utf-8")
    req = urllib.request.Request(
        GITHUB_GRAPHQL_URL,
        data=payload,
        headers={
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json",
            "User-Agent": "climp-hub-contrib-svg-generator",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            body = response.read()
    except urllib.error.URLError as exc:
        raise RuntimeError(f"GitHub GraphQL request failed: {exc}") from exc

    result = json.loads(body)
    if "errors" in result:
        raise RuntimeError(f"GitHub GraphQL returned errors: {result['errors']}")

    return result


def calendar_days_from_graphql(graphql_payload: dict) -> list[DayCell]:
    calendar = (
        graphql_payload.get("data", {})
        .get("user", {})
        .get("contributionsCollection", {})
        .get("contributionCalendar", {})
    )
    weeks = calendar.get("weeks", [])

    cells: list[DayCell] = []
    for week_index, week in enumerate(weeks):
        for day in week.get("contributionDays", []):
            cells.append(
                DayCell(
                    date=dt.date.fromisoformat(day["date"]),
                    count=int(day.get("contributionCount", 0)),
                    weekday=int(day["weekday"]),
                    week_index=week_index,
                )
            )

    cells.sort(key=lambda item: item.date)
    return cells


def month_labels(days: Iterable[DayCell]) -> list[tuple[int, str]]:
    labels: list[tuple[int, str]] = []
    seen: set[tuple[int, int]] = set()
    for cell in sorted(days, key=lambda c: c.date):
        key = (cell.date.year, cell.date.month)
        if key in seen:
            continue
        seen.add(key)
        labels.append((cell.week_index, cell.date.strftime("%b")))
    return labels


def generate_svg(days: list[DayCell], username: str, source_mode: str, date_from: dt.date, date_to: dt.date) -> str:
    if not days:
        raise ValueError("No day cells available to render")

    max_count = max((d.count for d in days), default=0)
    total = sum(d.count for d in days)
    weeks_count = max(d.week_index for d in days) + 1

    margin_left = 64
    margin_top = 48
    cell = 10
    week_gap = 2
    row_gap = 3
    iso_dx = 4
    iso_dy = 2
    face_depth = 3

    col_step = cell + week_gap
    row_step = cell + row_gap

    grid_width = weeks_count * col_step + cell + iso_dx
    grid_height = 7 * row_step + cell + 14

    width = margin_left + grid_width + 28
    height = margin_top + grid_height + 52

    parts: list[str] = []
    parts.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="100%" role="img" aria-labelledby="chart-title chart-desc">')
    parts.append(f"  <title id=\"chart-title\">Isometric GitHub contribution calendar for {username}</title>")
    parts.append(
        "  <desc id=\"chart-desc\">"
        f"Daily contribution cubes from {date_from.isoformat()} to {date_to.isoformat()}. "
        f"Cube color intensity and height are derived from each day's contribution count. "
        f"Data source: {source_mode}."
        "</desc>"
    )
    parts.append("  <rect x=\"0\" y=\"0\" width=\"100%\" height=\"100%\" fill=\"#0d1117\" rx=\"12\"/>")

    parts.append(f'  <text x="{margin_left}" y="28" fill="#c9d1d9" font-size="14" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif" font-weight="600">3D Contribution Calendar</text>')
    subtitle = f"{date_from.isoformat()} → {date_to.isoformat()} · {total} contributions"
    parts.append(f'  <text x="{margin_left}" y="42" fill="#8b949e" font-size="10" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif">{subtitle}</text>')

    # Weekday labels
    for row, label in [(1, "Mon"), (3, "Wed"), (5, "Fri")]:
        y = margin_top + row * row_step + cell
        parts.append(
            f'  <text x="18" y="{y}" fill="#8b949e" font-size="9" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif">{label}</text>'
        )

    for week_index, label in month_labels(days):
        x = margin_left + week_index * col_step
        parts.append(
            f'  <text x="{x}" y="{margin_top - 8}" fill="#8b949e" font-size="9" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif">{label}</text>'
        )

    parts.append("  <g stroke-width=\"0.5\" stroke=\"#30363d\">")
    for d in sorted(days, key=lambda c: (c.week_index, c.weekday)):
        x = margin_left + d.week_index * col_step
        y = margin_top + d.weekday * row_step

        level = intensity_level(d.count, max_count)
        base_color = PALETTE[level]
        top_color = adjust_hex_color(base_color, 0.16)
        left_color = adjust_hex_color(base_color, -0.10)
        right_color = adjust_hex_color(base_color, -0.20)
        elevation = cube_height(d.count, max_count)

        top_y = y - elevation
        points_top = [
            (x, top_y),
            (x + iso_dx, top_y - iso_dy),
            (x + iso_dx + cell, top_y - iso_dy),
            (x + cell, top_y),
        ]
        points_left = [
            (x, top_y),
            (x + iso_dx, top_y - iso_dy),
            (x + iso_dx, top_y - iso_dy + face_depth),
            (x, top_y + face_depth),
        ]
        points_right = [
            (x + cell, top_y),
            (x + iso_dx + cell, top_y - iso_dy),
            (x + iso_dx + cell, top_y - iso_dy + face_depth),
            (x + cell, top_y + face_depth),
        ]

        tip = f"{d.date.isoformat()} · {d.count} contributions"
        parts.append("    <g>")
        parts.append(f"      <title>{tip}</title>")
        parts.append(f"      <polygon fill=\"{left_color}\" points=\"{' '.join(f'{px},{py}' for px, py in points_left)}\"/>")
        parts.append(f"      <polygon fill=\"{right_color}\" points=\"{' '.join(f'{px},{py}' for px, py in points_right)}\"/>")
        parts.append(f"      <polygon fill=\"{top_color}\" points=\"{' '.join(f'{px},{py}' for px, py in points_top)}\"/>")
        parts.append("    </g>")
    parts.append("  </g>")

    # Legend
    legend_x = margin_left
    legend_y = height - 20
    parts.append(f'  <text x="{legend_x}" y="{legend_y - 5}" fill="#8b949e" font-size="9" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif">Less</text>')
    for idx, color in enumerate(PALETTE):
        x = legend_x + 24 + idx * 13
        parts.append(f'  <rect x="{x}" y="{legend_y - 12}" width="10" height="10" rx="2" fill="{color}" stroke="#30363d" stroke-width="0.5"/>')
    parts.append(f'  <text x="{legend_x + 24 + len(PALETTE) * 13 + 6}" y="{legend_y - 5}" fill="#8b949e" font-size="9" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif">More</text>')

    if source_mode.lower().startswith("fixture"):
        parts.append(f'  <text x="{width - 160}" y="{height - 8}" fill="#d29922" font-size="9" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif">Test data fixture (not real activity)</text>')

    parts.append("</svg>")
    return "\n".join(parts) + "\n"


def load_fixture(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--username", required=True, help="GitHub username")
    parser.add_argument("--output", required=True, help="Output SVG path")
    parser.add_argument("--days", type=int, default=365, help="Number of days to include")
    parser.add_argument("--token-env", default="GITHUB_TOKEN", help="Environment variable holding GitHub token")
    parser.add_argument("--fixture", help="Optional fixture JSON for local/test generation")

    args = parser.parse_args()

    date_to = dt.date.today()
    date_from = date_to - dt.timedelta(days=max(args.days - 1, 1))

    token = os.getenv(args.token_env)
    payload: dict
    source_mode: str

    if token:
        payload = fetch_contribution_calendar(args.username, token, date_from, date_to)
        source_mode = "GitHub GraphQL"
    elif args.fixture:
        payload = load_fixture(Path(args.fixture))
        source_mode = f"fixture:{Path(args.fixture).name}"
    else:
        raise SystemExit(
            f"Missing {args.token_env}. Provide a token or pass --fixture for labeled test-data generation."
        )

    days = calendar_days_from_graphql(payload)
    if not days:
        raise SystemExit("No contribution days returned from data source")

    svg = generate_svg(days, args.username, source_mode, days[0].date, days[-1].date)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(svg, encoding="utf-8")

    print(f"Generated {output_path} using {source_mode} ({len(days)} days).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
