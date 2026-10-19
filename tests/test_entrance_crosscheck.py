import copy
import json
import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from entrance_crosscheck import PairStatus, audit_pair, audit_collection


def sample():
    return json.loads((ROOT / "examples/r06_fukuoka_exit_pairs_2026-10-19.json").read_text(encoding="utf8"))


class CrosscheckTests(unittest.TestCase):
    def test_eight_public_exit_pairs(self):
        self.assertEqual(len(sample()["entries"]), 8)

    def test_all_nearby_but_all_unverified(self):
        report = audit_collection(sample()["entries"])
        self.assertEqual(report["n_pairs"], 8)
        self.assertEqual(report["counts"][PairStatus.COORDINATE_AGREEMENT_ONLY.value], 8)
        self.assertEqual(report["independently_verified_count"], 0)
        self.assertTrue(all(not r.independently_verified for r in report["results"]))

    def test_distances_match_observation_rounding(self):
        records = sample()["entries"]
        distances = [audit_pair(r).difference_m for r in records]
        expected = [12.55, 9.77, 6.13, 5.06, 1.69, 7.15, 7.97, 2.28]
        for a, b in zip(distances, expected):
            self.assertAlmostEqual(a, b, delta=0.08)
        self.assertAlmostEqual(audit_collection(records)["median_difference_m"], 6.64, delta=0.10)

    def test_all_within_review_threshold(self):
        report = audit_collection(sample()["entries"])
        self.assertLess(report["max_difference_m"], 20)

    def test_aerial_imagery_does_not_establish_source_independence(self):
        p = sample()["entries"][0]
        p["imagery_used"] = "Bing Maps Aerial"
        p["different_user"] = True
        self.assertFalse(audit_pair(p).independently_verified)

    def test_even_spurious_flag_cannot_promote(self):
        p = sample()["entries"][0]
        p["independently_verified"] = True
        self.assertFalse(audit_pair(p).independently_verified)

    def test_far_apart_points_review(self):
        p = sample()["entries"][0]
        p["osm"]["lat"] += 0.01
        self.assertEqual(audit_pair(p).status, PairStatus.POSITION_DISAGREEMENT)

    def test_identity_without_history_unresolved(self):
        p = sample()["entries"][0]
        p["identity_match"] = "nearest-only"
        self.assertEqual(audit_pair(p).status, PairStatus.IDENTITY_UNRESOLVED)

    def test_corrupt_coordinates_fail_closed(self):
        p = sample()["entries"][0]
        p["osm"]["lat"] = 250
        self.assertEqual(audit_pair(p).status, PairStatus.MALFORMED)

    def test_nan_coordinates_fail_closed(self):
        p = sample()["entries"][0]
        p["osm"]["lon"] = float("nan")
        self.assertEqual(audit_pair(p).status, PairStatus.MALFORMED)

    def test_missing_revision_fail_closed(self):
        p = sample()["entries"][0]
        p["legacy"].pop("source_revision")
        self.assertEqual(audit_pair(p).status, PairStatus.MALFORMED)

    def test_duplicate_osm_id_rejected(self):
        pairs = sample()["entries"]
        pairs[1]["osm"]["node_id"] = pairs[0]["osm"]["node_id"]
        with self.assertRaises(ValueError):
            audit_collection(pairs)

    def test_duplicate_gtfs_id_rejected(self):
        pairs = sample()["entries"]
        pairs[1]["legacy"]["record_id"] = pairs[0]["legacy"]["record_id"]
        with self.assertRaises(ValueError):
            audit_collection(pairs)

    def test_duplicate_pair_key_rejected(self):
        pairs = sample()["entries"]
        pairs[1]["key"] = pairs[0]["key"]
        with self.assertRaises(ValueError):
            audit_collection(pairs)

    def test_empty_collection_rejected(self):
        with self.assertRaises(ValueError):
            audit_collection([])

    def test_negative_threshold_rejected(self):
        self.assertEqual(audit_pair(sample()["entries"][0], review_distance_m=-1).status, PairStatus.MALFORMED)


if __name__ == "__main__":
    unittest.main()
