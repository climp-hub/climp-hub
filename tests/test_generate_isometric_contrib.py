import datetime as dt
import importlib.util
import pathlib
import unittest

SCRIPT_PATH = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "generate_isometric_contrib.py"
spec = importlib.util.spec_from_file_location("generate_isometric_contrib", SCRIPT_PATH)
mod = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(mod)


class ContributionSvgTests(unittest.TestCase):
    def _payload_from_dates(self, start: dt.date, weeks: int, value_fn):
        all_weeks = []
        for w in range(weeks):
            week_days = []
            for weekday in range(7):
                date = start + dt.timedelta(days=w * 7 + weekday)
                week_days.append(
                    {
                        "contributionCount": value_fn(date, weekday),
                        "date": date.isoformat(),
                        "weekday": weekday,
                    }
                )
            all_weeks.append({"contributionDays": week_days})

        return {
            "data": {
                "user": {
                    "contributionsCollection": {
                        "contributionCalendar": {
                            "weeks": all_weeks,
                            "totalContributions": sum(
                                d["contributionCount"]
                                for w in all_weeks
                                for d in w["contributionDays"]
                            ),
                        }
                    }
                }
            }
        }

    def test_calendar_days_are_chronological(self):
        payload = self._payload_from_dates(dt.date(2024, 12, 29), 3, lambda _d, _w: 1)
        days = mod.calendar_days_from_graphql(payload)
        self.assertEqual(days[0].date, dt.date(2024, 12, 29))
        self.assertEqual(days[-1].date, dt.date(2025, 1, 18))
        self.assertTrue(all(days[i].date <= days[i + 1].date for i in range(len(days) - 1)))

    def test_year_boundary_and_leap_day_are_present(self):
        payload = self._payload_from_dates(dt.date(2023, 12, 31), 10, lambda _d, _w: 2)
        days = mod.calendar_days_from_graphql(payload)
        dates = {d.date for d in days}
        self.assertIn(dt.date(2024, 2, 29), dates)
        self.assertIn(dt.date(2024, 1, 1), dates)
        self.assertIn(dt.date(2023, 12, 31), dates)

    def test_intensity_and_height_mapping(self):
        self.assertEqual(mod.intensity_level(0, 20), 0)
        self.assertEqual(mod.intensity_level(1, 20), 1)
        self.assertEqual(mod.intensity_level(20, 20), 4)
        self.assertEqual(mod.cube_height(0, 20), 0)
        self.assertGreaterEqual(mod.cube_height(1, 20), 1)
        self.assertEqual(mod.cube_height(20, 20), 10)

    def test_generate_svg_contains_structure_and_accessibility(self):
        payload = self._payload_from_dates(dt.date(2024, 1, 7), 4, lambda d, _w: (d.day % 5))
        days = mod.calendar_days_from_graphql(payload)
        svg = mod.generate_svg(days, "climp-hub", "fixture:test", days[0].date, days[-1].date)
        self.assertIn('<title id="chart-title">', svg)
        self.assertIn('<desc id="chart-desc">', svg)
        self.assertIn("3D Contribution Calendar", svg)
        self.assertIn("Test data fixture", svg)
        self.assertIn("Less", svg)
        self.assertIn("More", svg)

    def test_empty_activity_days_use_zero_intensity_color(self):
        payload = self._payload_from_dates(dt.date(2025, 1, 5), 2, lambda _d, _w: 0)
        days = mod.calendar_days_from_graphql(payload)
        svg = mod.generate_svg(days, "climp-hub", "fixture:test", days[0].date, days[-1].date)
        self.assertIn(mod.PALETTE[0], svg)


if __name__ == "__main__":
    unittest.main()
