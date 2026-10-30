import copy
from datetime import datetime, timedelta, timezone
from email.utils import format_datetime
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch
from urllib.error import HTTPError, URLError
import os
from io import BytesIO

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import publish_nba_web_shot_grid as web

FIXTURES = Path(__file__).parent / "fixtures"
GAME = json.loads((FIXTURES / "nba-web-hou-mil-0022600138.json").read_text())
SLATE = json.loads((FIXTURES / "nba-web-slate-20261028.json").read_text())
NGSS = json.loads((FIXTURES / "nba-web-cle-atl-0022600144.json").read_text())
NOW = datetime(2026, 10, 29, 3, tzinfo=timezone.utc)


def card():
    return next(row for row in web.parse_slate(SLATE, "2026-10-28", "2026-27", 12)
                if row["id"] == "0022600138")


def ngss_card():
    slate = {"selectedDate": "2026-10-29", "hasError": False, "gameCardFeed": {
        "nextPageToken": None, "previousPageToken": None, "modules": [{"cards": [NGSS["card"]]}]}}
    return web.parse_slate(slate, "2026-10-29", "2026-27", 1)[0]


class AuthenticParserTests(unittest.TestCase):
    def test_next_data_and_authentic_calendar_card_contract(self):
        html = ('<script id="__NEXT_DATA__" type="application/json">'
                + json.dumps({"props": {"pageProps": SLATE}}) + '</script>').encode()
        self.assertEqual(web.parse_page(html), SLATE)
        self.assertEqual(len(web.parse_slate(SLATE, "2026-10-28", "2026-27", 12)), 12)
        self.assertEqual(card()["date"], "2026-10-28")

    def test_authentic_correction_order_membership_box_parity_and_separate_heaves(self):
        result = web.parse_game(GAME, card())
        self.assertEqual(len(result["shots"]), 177)
        self.assertEqual(result["teamFieldGoalAttempts"], 2)
        numbers = [row["actionNumber"] for row in result["shots"]]
        self.assertLess(numbers.index(698), numbers.index(576))
        snapshot = web.build_snapshot([result], "2026-27", NOW.isoformat(), NOW.isoformat())
        self.assertEqual(snapshot["source"]["provider"], "NBA.com play-by-play")
        self.assertEqual(snapshot["source"]["formatGameCounts"], {"hanaV3": 1, "ngss": 0})
        self.assertEqual(snapshot["source"]["shotCount"], 179)
        self.assertGreaterEqual(snapshot["source"]["droppedNoLocation"], 2)
        self.assertEqual(sum(c["fga"] for c in snapshot["cells"]) + snapshot["source"]["droppedNoLocation"]
                         + snapshot["source"]["droppedOutsideHalfCourt"], 179)
        self.assertTrue(all(all(c[key] is None for key in ("zoneBasic", "zoneRange", "zoneArea", "gbm", "baseline"))
                            for c in snapshot["cells"]))

    def test_missing_correction_duplicate_fg_and_unknown_membership_fail(self):
        for mutation in ("missing", "duplicate", "player", "team", "heave"):
            with self.subTest(mutation=mutation):
                game = copy.deepcopy(GAME)
                actions = game["playByPlay"]["actions"]
                shot = next(a for a in actions if a["actionNumber"] == 698)
                if mutation == "missing": actions.remove(shot)
                elif mutation == "duplicate": actions.append(copy.deepcopy(shot))
                elif mutation == "player": shot["personId"] = 999999999
                elif mutation == "team": shot["teamId"] = 999999999
                else: next(a for a in actions if a["actionType"] == "Heave")["location"] = ""
                with self.assertRaises(ValueError): web.parse_game(game, card())

    def test_utc_to_eastern_not_misleading_z_suffixed_eastern_field(self):
        slate = copy.deepcopy(SLATE)
        row = slate["gameCardFeed"]["modules"][0]["cards"][0]["cardData"]
        row["gameTimeEastern"] = "2026-10-29T01:00:00Z"
        self.assertEqual(web.parse_slate(slate, "2026-10-28", "2026-27", 12)[0]["date"], "2026-10-28")
        row["gameTimeUtc"] = "2026-10-29T05:00:00Z"
        with self.assertRaises(ValueError): web.parse_slate(slate, "2026-10-28", "2026-27", 12)

    def test_wrong_selected_date_error_pagination_calendar_count_and_game_scores_fail(self):
        for mutation in ("date", "error", "page", "count"):
            slate = copy.deepcopy(SLATE)
            if mutation == "date": slate["selectedDate"] = "2026-10-27"
            elif mutation == "error": slate["hasError"] = True
            elif mutation == "page": slate["gameCardFeed"]["nextPageToken"] = "more"
            else: slate["gameCardFeed"]["modules"][0]["cards"].pop()
            with self.assertRaises(ValueError): web.parse_slate(slate, "2026-10-28", "2026-27", 12)
        game = copy.deepcopy(GAME)
        game["game"]["homeTeam"]["score"] += 1
        with self.assertRaises(ValueError): web.parse_game(game, card())


class NgssParserTests(unittest.TestCase):
    def test_authentic_ngss_keeps_native_coordinates_and_team_heave_separate(self):
        result = web.parse_game(NGSS, ngss_card())
        ordinary = [a for a in NGSS["playByPlay"]["actions"] if a.get("isFieldGoal") == 1]
        self.assertEqual(len(result["shots"]), 182)
        self.assertEqual(result["teamFieldGoalAttempts"], 1)
        self.assertEqual([(s["x"], s["y"]) for s in result["shots"]],
                         [(a["xLegacy"], a["yLegacy"]) for a in ordinary])
        snapshot = web.build_snapshot([web.parse_game(GAME, card()), result], "2026-27", NOW.isoformat(), NOW.isoformat())
        self.assertEqual(snapshot["source"]["provider"], "NBA.com play-by-play")
        self.assertEqual(snapshot["source"]["formatGameCounts"], {"hanaV3": 1, "ngss": 1})
        self.assertEqual(snapshot["source"]["shotCount"], 362)
        self.assertEqual(snapshot["source"]["teamFieldGoalAttempts"], 3)

    def test_ngss_geometry_missing_unknown_side_out_of_bounds_or_mismatch_fails(self):
        for key, value in (("x", None), ("y", 101), ("side", "center"), ("xLegacy", None),
                           ("yLegacy", float("inf")), ("xLegacy", 100)):
            with self.subTest(key=key, value=value):
                game = copy.deepcopy(NGSS)
                next(a for a in game["playByPlay"]["actions"] if a.get("isFieldGoal") == 1)[key] = value
                with self.assertRaises(ValueError): web.parse_game(game, ngss_card())

    def test_half_unit_rounding_tolerance_is_bounded(self):
        for delta, accepted in ((0.50000005, True), (0.5000002, False)):
            game = copy.deepcopy(NGSS)
            shot = next(a for a in game["playByPlay"]["actions"] if a.get("isFieldGoal") == 1)
            expected = (25 - shot["y"] * .5) * 10 if shot["side"] == "left" else (shot["y"] * .5 - 25) * 10
            shot["xLegacy"] = expected + delta
            if accepted: self.assertEqual(len(web.parse_game(game, ngss_card())["shots"]), 182)
            else:
                with self.assertRaises(ValueError): web.parse_game(game, ngss_card())

    def test_ngss_heave_membership_geometry_fields_and_fg_contradictions_fail(self):
        for key, value in (("teamId", 999), ("personId", 999), ("xLegacy", 0), ("x", 0),
                           ("shotResult", "Missed"), ("shotValue", 3), ("isFieldGoal", 1),
                           ("actionType", "3pt"), ("qualifiers", [])):
            with self.subTest(key=key, value=value):
                game = copy.deepcopy(NGSS)
                next(a for a in game["playByPlay"]["actions"] if a["actionNumber"] == 326)[key] = value
                with self.assertRaises(ValueError): web.parse_game(game, ngss_card())

    def test_formats_are_explicit_and_hana_value_contract_stays_strict(self):
        game = copy.deepcopy(GAME)
        del next(a for a in game["playByPlay"]["actions"] if a.get("isFieldGoal") == 1)["shotValue"]
        with self.assertRaises(ValueError): web.parse_game(game, card())
        for source in ("other", None):
            game = copy.deepcopy(NGSS)
            game["playByPlay"]["source"] = source
            with self.assertRaises(ValueError): web.parse_game(game, ngss_card())


class BoundaryTests(unittest.TestCase):
    def test_default_budget_and_cli_accept_840_seconds(self):
        with patch.object(web.time, "monotonic", return_value=0):
            self.assertEqual(web.Budget().remaining(), 840)
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory, "output.json")
            args = ["collector", "--season", "2026-27", "--output", str(output), "--budget-seconds", "840"]
            with patch.object(sys, "argv", args), patch.object(web.time, "monotonic", return_value=0), \
                 patch.object(web, "collect", return_value=None) as collect, \
                 self.assertLogs(web.logger, level="INFO"):
                self.assertEqual(web.main(), 3)
                self.assertEqual(collect.call_args.kwargs["budget"].remaining(), 840)

    def test_cli_rejects_841_seconds_before_network(self):
        with tempfile.TemporaryDirectory() as directory:
            args = ["collector", "--output", str(Path(directory, "output.json")), "--budget-seconds", "841"]
            with patch.object(sys, "argv", args), patch.object(web, "collect") as collect, \
                 patch.object(web.urllib.request, "build_opener") as opened, \
                 patch.object(sys, "stderr"), self.assertRaises(SystemExit) as error:
                web.main()
            self.assertEqual(error.exception.code, 2)
            collect.assert_not_called()
            opened.assert_not_called()

    def test_missing_or_duplicate_next_data_and_wrong_json_fail(self):
        for body in (b"<html></html>", b'<script id="__NEXT_DATA__">{</script>',
                     b'<script id="__NEXT_DATA__">{}</script>' * 2):
            with self.subTest(body=body), self.assertRaises(ValueError):
                web.parse_page(body)
        with self.assertRaises(web.EmptyResponse): web.parse_page(b"  ")

    def test_public_host_page_cap_and_cooperative_read_deadline(self):
        class Response(BytesIO):
            def __enter__(self): return self
            def __exit__(self, *args): self.close()
            def geturl(self): return "https://www.nba.com/games"
        class Opener:
            def open(self, request, timeout):
                self.timeout = timeout
                return Response(b"x" * (web.MAX_PAGE_BYTES + 1))
        opener = Opener()
        with patch.object(web.urllib.request, "build_opener", return_value=opener):
            with self.assertRaises(ValueError): web.fetch_page("https://www.nba.com/games", web.Budget())
        self.assertLessEqual(opener.timeout, 8)
        with self.assertRaises(ValueError): web.fetch_page("https://example.com/games", web.Budget())
        with patch.object(web.time, "monotonic", return_value=0): budget = web.Budget(seconds=270)
        with patch.object(web.time, "monotonic", return_value=271), patch.object(web.urllib.request, "build_opener") as opened:
            with self.assertRaises(TimeoutError): web.fetch_page("https://www.nba.com/games", budget)
            opened.assert_not_called()

    def test_preseason_filtered_only_after_card_count_validation(self):
        slate = copy.deepcopy(SLATE)
        row = slate["gameCardFeed"]["modules"][0]["cards"][0]["cardData"]
        row.update(seasonType="Preseason", gameId="0012600001")
        self.assertEqual(len(web.parse_slate(slate, "2026-10-28", "2026-27", 12)), 11)
        with self.assertRaises(ValueError): web.parse_slate(slate, "2026-10-28", "2026-27", 11)
        row.update(seasonType="Regular Season", gameId="0022500001")
        with self.assertRaises(ValueError): web.parse_slate(slate, "2026-10-28", "2026-27", 12)

    def test_global_loss_guard_does_not_hide_unknown_locations(self):
        result = web.parse_game(GAME, card())
        for shot in result["shots"][:3]: shot["x"] = None
        with self.assertRaises(ValueError): web.build_snapshot([result], "2026-27", NOW.isoformat(), NOW.isoformat())
        other = web.parse_game(GAME, card())
        other["gameId"] = "0022600139"
        snapshot = web.build_snapshot([result, other], "2026-27", NOW.isoformat(), NOW.isoformat())
        self.assertEqual(snapshot["source"]["droppedNoLocation"], 7)

    def test_main_diagnostic_never_exposes_exception_sentinel(self):
        with tempfile.TemporaryDirectory() as directory:
            output, reason = Path(directory, "output.json"), Path(directory, "reason.json")
            output.write_bytes(b"prior")
            with patch.object(sys, "argv", ["collector", "--season", "2026-27", "--output", str(output)]), \
                 patch.dict(os.environ, {"FULLCOURT_COLLECTION_REASON_PATH": str(reason)}), \
                 patch.object(web, "collect", side_effect=web.ValidationFailure("SECRET_SENTINEL")), \
                 self.assertLogs(web.logger, level="ERROR") as logs:
                self.assertEqual(web.main(), 1)
            self.assertEqual(output.read_bytes(), b"prior")
            self.assertEqual(json.loads(reason.read_text())["reason"], "validation-error")
            self.assertNotIn("SECRET_SENTINEL", " ".join(logs.output) + reason.read_text())


class HttpRetryTests(unittest.TestCase):
    url = "https://www.nba.com/games?date=2026-10-28"

    def response(self, body=None):
        class Response(BytesIO):
            def __enter__(self): return self
            def __exit__(self, *args): self.close()
            def geturl(inner): return self.url
        if body is None:
            body = b'<script id="__NEXT_DATA__">' + json.dumps({"props": {"pageProps": SLATE}}).encode() + b'</script>'
        return Response(body)

    def http_error(self, code, retry_after=None):
        headers = {} if retry_after is None else {"Retry-After": retry_after}
        return HTTPError(self.url, code, "SECRET_SENTINEL", headers, None)

    def test_503_then_success_retries_once_and_logs_only_safe_code(self):
        opener = Mock()
        opener.open.side_effect = [self.http_error(503), self.response()]
        with patch.object(web.urllib.request, "build_opener", return_value=opener), \
             patch.object(web.time, "sleep") as sleep, self.assertLogs(web.logger, level="WARNING") as logs:
            self.assertEqual(web.fetch_page(self.url, web.Budget()), SLATE)
        self.assertEqual(opener.open.call_count, 2)
        sleep.assert_called_once_with(1)
        self.assertNotIn("SECRET_SENTINEL", " ".join(logs.output))
        self.assertNotIn("www.nba.com", " ".join(logs.output))

    def test_429_retry_after_seconds_and_http_date_are_honored(self):
        for header, delay in (("2", 2), (format_datetime(NOW + timedelta(seconds=3), usegmt=True), 3)):
            opener = Mock()
            opener.open.side_effect = [self.http_error(429, header), self.response()]
            with self.subTest(header=header), patch.object(web.urllib.request, "build_opener", return_value=opener), \
                 patch.object(web.time, "sleep") as sleep, patch.object(web, "datetime", wraps=datetime) as clock, \
                 self.assertLogs(web.logger, level="WARNING"):
                clock.now.return_value = NOW
                self.assertEqual(web.fetch_page(self.url, web.Budget()), SLATE)
            sleep.assert_called_once_with(delay)
            self.assertEqual(opener.open.call_count, 2)

    def test_403_other_4xx_and_non_timeout_url_errors_are_not_retried(self):
        for error in (self.http_error(403), self.http_error(404), URLError("SECRET_SENTINEL")):
            opener = Mock()
            opener.open.side_effect = [error, self.response()]
            with self.subTest(error=type(error).__name__), patch.object(web.urllib.request, "build_opener", return_value=opener), \
                 patch.object(web.time, "sleep") as sleep, self.assertRaises(type(error)):
                web.fetch_page(self.url, web.Budget())
            self.assertEqual(opener.open.call_count, 1)
            sleep.assert_not_called()

    def test_direct_timeout_can_recover_but_nested_timeout_has_only_one_retry(self):
        for errors, success in (([TimeoutError("SECRET_SENTINEL")], True),
                                ([URLError(TimeoutError("SECRET_SENTINEL"))] * 2, False)):
            opener = Mock()
            opener.open.side_effect = errors + [self.response()]
            with patch.object(web.urllib.request, "build_opener", return_value=opener), \
                 patch.object(web.time, "sleep") as sleep, self.assertLogs(web.logger, level="WARNING"):
                if success: self.assertEqual(web.fetch_page(self.url, web.Budget()), SLATE)
                else:
                    with self.assertRaises(URLError): web.fetch_page(self.url, web.Budget())
            self.assertEqual(opener.open.call_count, 2)
            sleep.assert_called_once_with(1)

    def test_expired_budget_after_wait_prevents_second_request(self):
        clock = [0]
        opener = Mock()
        opener.open.side_effect = [self.http_error(503), self.response()]
        with patch.object(web.time, "monotonic", side_effect=lambda: clock[0]):
            budget = web.Budget(seconds=1.5)
            with patch.object(web.urllib.request, "build_opener", return_value=opener), \
                 patch.object(web.time, "sleep", side_effect=lambda delay: clock.__setitem__(0, 2)), \
                 self.assertLogs(web.logger, level="WARNING"), self.assertRaises(TimeoutError):
                web.fetch_page(self.url, budget)
        self.assertEqual(opener.open.call_count, 1)

    def test_malformed_or_over_budget_retry_after_fails_without_retry(self):
        for header in ("not-a-date", "-1", "1.5", "999999"):
            opener = Mock()
            opener.open.side_effect = [self.http_error(429, header), self.response()]
            with self.subTest(header=header), patch.object(web.urllib.request, "build_opener", return_value=opener), \
                 patch.object(web.time, "sleep") as sleep, self.assertRaises(Exception):
                web.fetch_page(self.url, web.Budget())
            self.assertEqual(opener.open.call_count, 1)
            sleep.assert_not_called()

    def test_empty_invalid_json_and_schema_responses_are_not_retried(self):
        for body in (b" ", b'<script id="__NEXT_DATA__">{</script>',
                     b'<script id="__NEXT_DATA__">{"props":{"pageProps":[]}}</script>'):
            opener = Mock()
            opener.open.side_effect = [self.response(body), self.response()]
            with self.subTest(body=body), patch.object(web.urllib.request, "build_opener", return_value=opener), \
                 patch.object(web.time, "sleep") as sleep, self.assertRaises(ValueError):
                web.fetch_page(self.url, web.Budget())
            self.assertEqual(opener.open.call_count, 1)
            sleep.assert_not_called()

    def test_exhausted_http_retry_leaves_main_output_bytes_unchanged(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory, "output.json")
            output.write_bytes(b"last-good")
            opener = Mock()
            opener.open.side_effect = [self.http_error(503), self.http_error(503), self.response()]
            with patch.object(sys, "argv", ["collector", "--output", str(output)]), \
                 patch.object(web.urllib.request, "build_opener", return_value=opener), \
                 patch.object(web.time, "sleep"), self.assertLogs(web.logger, level="WARNING"):
                self.assertEqual(web.main(), 1)
            self.assertEqual(opener.open.call_count, 2)
            self.assertEqual(output.read_bytes(), b"last-good")


class CollectionTests(unittest.TestCase):
    def test_unknown_or_mispaired_competition_fails_whole_collection_before_game_fetches(self):
        def unexpected_game(*args):
            raise AssertionError("Unproven slate reached game parser")
        for label, identifier in (("regular season", "0022600138"), ("Unknown", "0022600138"),
                                  ("Preseason", "0022600138"), ("Regular Season", "0012600138"),
                                  ("Preseason", "0012500138"), ("Pre Season", "0012600138")):
            with self.subTest(label=label, identifier=identifier):
                slate = copy.deepcopy(SLATE)
                slate["allGamesInCurrentYear"] = {"2026": {f"2026-10-{day:02}": 12 if day == 28 else 0 for day in range(1, 29)}}
                row = next(c["cardData"] for c in slate["gameCardFeed"]["modules"][0]["cards"]
                           if c["cardData"]["gameId"] == "0022600138")
                row.update(seasonType=label, gameId=identifier)
                with patch.object(web, "parse_game", side_effect=unexpected_game) as games:
                    with self.assertRaises(web.ValidationFailure):
                        web.collect("2026-27", fetch=lambda url, budget: slate, now=lambda: NOW)
                    games.assert_not_called()

    def collect(self, change=None, missing=False):
        counts = {f"2026-10-{day:02}": 0 for day in range(1, 29)}
        counts["2026-10-28"] = 1
        if missing:
            del counts["2026-10-01"]
        slate = copy.deepcopy(SLATE)
        slate["allGamesInCurrentYear"] = {"2026": counts}
        slate["gameCardFeed"]["modules"][0]["cards"] = [next(c for c in SLATE["gameCardFeed"]["modules"][0]["cards"]
                                                                    if c["cardData"]["gameId"] == "0022600138")]
        calls = []
        def fetch(url, budget):
            calls.append(url)
            if "/game/" in url: return GAME
            response = copy.deepcopy(slate)
            day = url.split("date=")[-1]
            response["selectedDate"] = day
            if day != "2026-10-28":
                response["gameCardFeed"]["modules"][0]["cards"] = []
            if len([u for u in calls if "/games?" in u]) > 1 and change:
                change(response)
            return response
        return web.collect("2026-27", fetch=fetch, now=lambda: NOW), calls

    def test_complete_october_range_and_final_cohort_recheck(self):
        snapshot, calls = self.collect()
        self.assertEqual(snapshot["source"]["gameIds"], ["0022600138"])
        self.assertEqual(len(calls), 3)

    def test_missing_calendar_day_is_observed_empty_and_rechecked_not_assumed_zero(self):
        snapshot, calls = self.collect(missing=True)
        self.assertEqual(snapshot["source"]["gameIds"], ["0022600138"])
        self.assertEqual(calls.count(web.ORIGIN + "/games?date=2026-10-01"), 2)
        def explicit_zero(response):
            response["allGamesInCurrentYear"]["2026"]["2026-10-01"] = 0
        with self.assertRaises(ValueError): self.collect(explicit_zero, missing=True)
        slate = copy.deepcopy(SLATE)
        with self.assertRaises(ValueError): web.parse_slate(slate, "2026-10-28", "2026-27", None)

    def test_previously_nonfinal_game_becoming_final_aborts_cohort(self):
        counts = {f"2026-10-{day:02}": 0 for day in range(1, 29)}
        counts.update({"2026-10-27": 1, "2026-10-28": 1})
        calls = []
        def fetch(url, budget):
            calls.append(url)
            if "/game/" in url: return GAME
            day = url.split("date=")[-1]
            slate = copy.deepcopy(SLATE)
            slate.update(selectedDate=day, allGamesInCurrentYear={"2026": counts})
            row = copy.deepcopy(next(c for c in slate["gameCardFeed"]["modules"][0]["cards"]
                                     if c["cardData"]["gameId"] == "0022600138"))
            if day == "2026-10-27":
                row["cardData"].update(gameId="0022600139", gameTimeUtc="2026-10-27T23:00:00Z",
                                       gameStatus=1 if calls.count(url) == 1 else 3)
            slate["gameCardFeed"]["modules"][0]["cards"] = [row]
            return slate
        with self.assertRaises(ValueError): web.collect("2026-27", fetch=fetch, now=lambda: NOW)
        self.assertEqual(calls.count(web.ORIGIN + "/games?date=2026-10-27"), 2)

    def test_changed_calendar_or_final_score_refuses_entire_collection(self):
        for change in (lambda s: s["allGamesInCurrentYear"]["2026"].update({"2026-10-01": 1}),
                       lambda s: s["gameCardFeed"]["modules"][0]["cards"][0]["cardData"]["homeTeam"].update(score=101)):
            with self.assertRaises(ValueError): self.collect(change)

    def test_budget_and_atomic_version2_regression_preserve_prior_bytes(self):
        result = web.parse_game(GAME, card())
        snapshot = web.build_snapshot([result], "2026-27", NOW.isoformat(), NOW.isoformat())
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory, "shot.json")
            self.assertTrue(web.publish(snapshot, output))
            old = output.read_bytes()
            self.assertEqual(json.loads(old)["schemaVersion"], 2)
            with patch.object(web.time, "monotonic", return_value=0): budget = web.Budget(seconds=270)
            with patch.object(web.time, "monotonic", return_value=271), self.assertRaises(TimeoutError):
                web.publish(snapshot, output, budget)
            self.assertEqual(output.read_bytes(), old)
            updated = copy.deepcopy(snapshot)
            next(cell for cell in updated["cells"] if cell["fgm"] < cell["fga"])["fgm"] += 1
            with patch.object(budget, "check", side_effect=[None, TimeoutError()]), self.assertRaises(TimeoutError):
                web.publish(updated, output, budget)
            self.assertEqual(output.read_bytes(), old)
            self.assertEqual(list(Path(directory).iterdir()), [output])
            changed = copy.deepcopy(snapshot); changed["source"]["shotCount"] -= 1
            with self.assertRaises(ValueError): web.publish(changed, output)
            self.assertEqual(output.read_bytes(), old)


class EmptySeasonTests(unittest.TestCase):
    def test_valid_future_or_preseason_still_rechecks_and_returns_unavailable(self):
        for preseason, expected in ((False, None), (True, None), (False, []), (False, ["0022600138"])):
            with self.subTest(preseason=preseason, expected=expected), tempfile.TemporaryDirectory() as directory:
                output = Path(directory, "output.json")
                if preseason or expected is not None:
                    output.write_bytes(b"last-good")
                slate = copy.deepcopy(SLATE)
                slate["allGamesInCurrentYear"] = {"2026": {f"2026-10-{day:02}": int(day == 28) for day in range(1, 29)}}
                row = copy.deepcopy(next(c for c in slate["gameCardFeed"]["modules"][0]["cards"]
                                         if c["cardData"]["gameId"] == "0022600138"))
                row["cardData"]["gameStatus"] = 1
                row["cardData"]["homeTeam"]["score"] = row["cardData"]["awayTeam"]["score"] = 0
                if preseason:
                    row["cardData"].update(seasonType="Preseason", gameId="0012600138")
                slate["gameCardFeed"]["modules"][0]["cards"] = [row]
                body = json.dumps({"props": {"pageProps": slate}}).encode()
                body = b'<script id="__NEXT_DATA__">' + body + b'</script>'
                self.run_main(output, body, expected, 1 if expected else 3)
                if preseason or expected is not None: self.assertEqual(output.read_bytes(), b"last-good")
                else: self.assertFalse(output.exists())

    def test_unreadable_response_is_failure_not_unavailable(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory, "output.json")
            output.write_bytes(b"last-good")
            self.run_main(output, b'<script id="__NEXT_DATA__">{</script>', None, 1, calls=1)
            self.assertEqual(output.read_bytes(), b"last-good")

    def run_main(self, output, body, expected, status, calls=2):
        class Response(BytesIO):
            def __enter__(self): return self
            def __exit__(self, *args): self.close()
            def geturl(self): return web.ORIGIN + "/games?date=2026-10-28"
        class Opener:
            def open(self, request, timeout): return Response(body)
        args = ["collector", "--season", "2026-27", "--output", str(output)]
        if expected is not None:
            path = output.with_name("expected.json")
            path.write_text(json.dumps(expected))
            args.extend(["--expected-game-ids", str(path)])
        with patch.object(sys, "argv", args), patch.object(web, "datetime", wraps=datetime) as clock, \
             patch.object(web.urllib.request, "build_opener", return_value=Opener()) as opened, \
             self.assertLogs(web.logger, level="INFO"):
            clock.now.return_value = NOW
            self.assertEqual(web.main(), status)
        self.assertEqual(opened.call_count, calls)


if __name__ == "__main__": unittest.main()
