import pathlib
import sys
import unittest
from datetime import date

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from entrance_quality import (Entrance, EntranceGate, EntranceCheck, PositionEvidence,
                              parse_exit_csv, audit_operator_exit_names,
                              verify_exit_position, compare_walk_with_entrance_checks)
from route_quality import RouteAssessment, RouteGate, WalkAdGate

CSV = "stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station\n" \
      "E1,サンプル北出口,35.681,139.767,2,ST1\n" \
      "E2,サンプル南出口,35.680,139.767,2,ST1\n"
URL = "https://example.org/gtfs/source.csv"


def records(src=CSV):
    return parse_exit_csv(src, source_url=URL, source_lineage="provider-2018",
                          source_revision="sha-test", survey_year=2018)


class ParseTests(unittest.TestCase):
    def test_extract_two_entries(self): self.assertEqual(len(records()), 2)
    def test_records_capture_lineage(self): self.assertEqual(records()[0].source_revision, "sha-test")
    def test_duplicate_id_rejected(self):
        with self.assertRaises(ValueError): records(CSV + CSV.splitlines()[1] + "\n")
    def test_missing_parent_rejected(self):
        with self.assertRaises(ValueError): records(CSV.replace("2,ST1", "2,"))
    def test_non_exit_rejected(self):
        with self.assertRaises(ValueError): records(CSV.replace(",2,ST1", ",1,ST1"))
    def test_invalid_coord_rejected(self):
        with self.assertRaises(ValueError): records(CSV.replace("35.681", "999.999"))
    def test_nan_rejected(self):
        with self.assertRaises(ValueError): records(CSV.replace("35.681", "nan"))
    def test_header_rejected(self):
        with self.assertRaises(ValueError): records("stop_name,stop_lat\n北,35\n")
    def test_empty_rows_rejected(self):
        with self.assertRaises(ValueError): records(CSV.splitlines()[0]+"\n")
    def test_missing_provenance_rejected(self):
        with self.assertRaises(ValueError):
            parse_exit_csv(CSV, source_url="", source_lineage="x", source_revision="sha")
    def test_identity_only_names(self):
        self.assertEqual(audit_operator_exit_names(records(), "ST1", {"サンプル北出口", "サンプル南出口"}), ((), ()))
    def test_missing_operator_name(self):
        missing, extra = audit_operator_exit_names(records(), "ST1", {"サンプル東出口"})
        self.assertEqual(missing, ("サンプル東出口",))
        self.assertEqual(len(extra), 2)


class GateTests(unittest.TestCase):
    def setUp(self):
        self.entrance = records()[0]
        self.today = date(2026, 10, 19)
    def alt(self, *, lon=139.76702, lineage="other-survey-2026", independent=True, src="https://other.example/survey", when=date(2026, 10, 1)):
        return PositionEvidence(35.681, lon, src, lineage, when, independent)
    def check(self, alternative=None, name=True):
        return verify_exit_position(self.entrance, name_confirmed_by_operator=name,
                                    alternative=alternative, as_of=self.today)
    def test_name_not_confirmed(self): self.assertEqual(self.check(self.alt(),name=False).gate,EntranceGate.UNCHECKED)
    def test_missing_alt_name_only(self): self.assertEqual(self.check().gate,EntranceGate.NAME_CHECKED)
    def test_distinct_close_current(self): self.assertEqual(self.check(self.alt()).gate, EntranceGate.POSITION_CORROBORATED)
    def test_same_lineage_not_independent(self):
        x=self.check(self.alt(lineage="provider-2018"))
        self.assertEqual(x.gate,EntranceGate.POSITION_REVIEW)
        self.assertIn("not_independent", x.reasons)
    def test_same_source_url_rejected(self): self.assertEqual(self.check(self.alt(src=URL)).gate,EntranceGate.POSITION_REVIEW)
    def test_independently_false(self): self.assertEqual(self.check(self.alt(independent=False)).gate,EntranceGate.POSITION_REVIEW)
    def test_old_independent_source_rejected(self): self.assertEqual(self.check(self.alt(when=date(2018,1,1))).gate,EntranceGate.POSITION_REVIEW)
    def test_future_date_rejected(self): self.assertEqual(self.check(self.alt(when=date(2027,1,1))).gate,EntranceGate.POSITION_REVIEW)
    def test_distant_source_rejected(self):
        c=self.check(self.alt(lon=139.768))
        self.assertEqual(c.gate,EntranceGate.POSITION_REVIEW)
        self.assertIn("position_disagreement", c.reasons)
    def test_tolerance_validation(self):
        with self.assertRaises(ValueError):
            verify_exit_position(self.entrance,name_confirmed_by_operator=True,alternative=self.alt(),as_of=self.today,max_distance_m=-1)
    def test_name_confirmation_does_not_imply_coordinates(self):
        self.assertNotEqual(self.check().gate,EntranceGate.POSITION_CORROBORATED)
    def test_route_will_abstain_with_name_only(self):
        route=RouteAssessment(RouteGate.PROVISIONAL, 520, 450, 1.15, 3, 3, ())
        c=self.check()
        self.assertEqual(compare_walk_with_entrance_checks(7,route,c,c,road_graph_version_pinned=True),WalkAdGate.UNRESOLVED)
    def test_route_will_abstain_with_unpinned_graph(self):
        route=RouteAssessment(RouteGate.PROVISIONAL, 520, 450, 1.15, 3, 3, ())
        c=self.check(self.alt())
        self.assertEqual(compare_walk_with_entrance_checks(7,route,c,c,road_graph_version_pinned=False),WalkAdGate.UNRESOLVED)
    def test_independent_and_pinned_are_eligible(self):
        route=RouteAssessment(RouteGate.PROVISIONAL, 520, 450, 1.15, 3, 3, ())
        c=self.check(self.alt())
        self.assertEqual(compare_walk_with_entrance_checks(7,route,c,c,road_graph_version_pinned=True),WalkAdGate.COMPATIBLE)

if __name__ == "__main__": unittest.main()
