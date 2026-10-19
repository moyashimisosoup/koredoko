import sys
import pathlib
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from accuracy_core import (
    Decision, OutputState, walk_advertisement_bounds, route_distance_consistency,
    straight_line_screen, haversine_m, poi_quality, result_state
)


class WalkingAdvertisementTests(unittest.TestCase):
    def test_one_minute_interval(self): self.assertEqual(walk_advertisement_bounds(1), (0, 80))
    def test_seven_minute_interval(self): self.assertEqual(walk_advertisement_bounds(7), (480, 560))
    def test_twelve_minute_interval(self): self.assertEqual(walk_advertisement_bounds(12), (880, 960))
    def test_upper_included(self): self.assertEqual(route_distance_consistency(7, 560), Decision.POSSIBLE)
    def test_lower_excluded(self): self.assertEqual(route_distance_consistency(7, 480), Decision.CONTRADICTION)
    def test_above_upper(self): self.assertEqual(route_distance_consistency(7, 560.01), Decision.CONTRADICTION)
    def test_above_lower(self): self.assertEqual(route_distance_consistency(7, 480.01), Decision.POSSIBLE)
    def test_noninteger_minutes(self):
        with self.assertRaises(ValueError): walk_advertisement_bounds(7.1)
    def test_boolean_minutes(self):
        with self.assertRaises(ValueError): walk_advertisement_bounds(True)
    def test_invalid_meters(self): self.assertEqual(route_distance_consistency(7, float('nan')), Decision.INVALID)
    def test_geodesic_cannot_confirm_walking_match(self): self.assertEqual(straight_line_screen(7, 300), Decision.REVIEW)
    def test_geodesic_above_upper_is_contradiction(self): self.assertEqual(straight_line_screen(7, 560.01), Decision.CONTRADICTION)
    def test_uncertainty_buffer(self): self.assertEqual(straight_line_screen(7, 568, tolerance_m=10), Decision.REVIEW)
    def test_reverse_coordinates_caught_by_bounds(self):
        with self.assertRaises(ValueError): haversine_m(139.7, 35.6, 35.6, 139.7)
    def test_identical_coords(self): self.assertAlmostEqual(haversine_m(35.6, 139.7, 35.6,139.7), 0)


class PoiEvidenceTests(unittest.TestCase):
    def test_missing_coordinate(self): self.assertEqual(poi_quality(name='x', lat=None,lng=139.7,admin_polygon_match=True), Decision.INVALID)
    def test_missing_source_requires_review(self): self.assertEqual(poi_quality(name='x', lat=35.7,lng=139.7,admin_polygon_match=True,has_source=False), Decision.REVIEW)
    def test_confirmed_admin_conflict_is_review(self): self.assertEqual(poi_quality(name='x',lat=35.7,lng=139.7,admin_polygon_match=False), Decision.REVIEW)
    def test_unchecked_admin_is_review(self): self.assertEqual(poi_quality(name='x',lat=35.7,lng=139.7,admin_polygon_match=None), Decision.REVIEW)
    def test_confirmed_valid(self): self.assertEqual(poi_quality(name='x',lat=35.7,lng=139.7,admin_polygon_match=True), Decision.POSSIBLE)


class StateGateTests(unittest.TestCase):
    def params(self, **overrides):
        p = dict(independent_public_identification=False,official_public_location=False,provenance_complete=True,
                 candidate_count=1,region_computable=True,unresolved_critical_conflict=False)
        p.update(overrides)
        return p
    def test_single_candidate_not_verified(self): self.assertEqual(result_state(**self.params()),OutputState.CANDIDATE)
    def test_verified_requires_both(self): self.assertEqual(result_state(**self.params(independent_public_identification=True,official_public_location=True)),OutputState.VERIFIED_PUBLIC)
    def test_official_only_is_candidate(self): self.assertEqual(result_state(**self.params(official_public_location=True)),OutputState.CANDIDATE)
    def test_independence_only_is_candidate(self): self.assertEqual(result_state(**self.params(independent_public_identification=True)),OutputState.CANDIDATE)
    def test_missing_provenance_forces_abstain(self): self.assertEqual(result_state(**self.params(provenance_complete=False)),OutputState.ABSTAIN)
    def test_critical_conflict_forces_abstain(self): self.assertEqual(result_state(**self.params(unresolved_critical_conflict=True)),OutputState.ABSTAIN)
    def test_no_candidate_but_region(self): self.assertEqual(result_state(**self.params(candidate_count=0)),OutputState.REGION)
    def test_no_evidence_forces_abstain(self): self.assertEqual(result_state(**self.params(candidate_count=0,region_computable=False)),OutputState.ABSTAIN)

if __name__ == '__main__': unittest.main()
