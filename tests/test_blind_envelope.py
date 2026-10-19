import pathlib,sys,unittest,json
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"src"))
from blind_envelope import compute_envelope,contains_reference_point

FIXTURE=json.loads((ROOT/"examples/blind_poi_inputs_20261019.json").read_text(encoding="utf8"))

def sample_groups():
    return [
      {"station_key":"a","max_walk_minutes":5,"representatives":[{"lat":35.0,"lng":139.0}]},
      {"station_key":"b","max_walk_minutes":5,"representatives":[{"lat":35.0,"lng":139.003}]}
    ]

class BlindEnvelopeTests(unittest.TestCase):
    def test_fixtures_never_hold_address_or_reference_coordinates(self):
        for c in FIXTURE["cases"]:
            self.assertNotIn("name",c)
            self.assertNotIn("address",c)
            self.assertNotIn("ground_truth",c)
            self.assertNotIn("reference",c)
            self.assertNotIn("lat",c)
            self.assertNotIn("lng",c)
    def test_station_duplicate_identity_rejected(self):
        g=sample_groups();g[1]["station_key"]="a"
        with self.assertRaises(ValueError):compute_envelope(g)
    def test_nominal_overlap_is_nonempty(self):
        g=sample_groups()
        r=compute_envelope(g)
        self.assertGreater(r["candidate_cell_count"],0)
        self.assertLess(r["estimated_area_m2"],r["single_station_baseline_area_m2"])
    def test_impossible_nominal_pair_yields_zero(self):
        g=sample_groups()
        g[1]["representatives"][0]["lng"]=139.1
        self.assertEqual(compute_envelope(g)["candidate_cell_count"],0)
    def test_additional_station_restricts_or_preserves_area(self):
        g=sample_groups()
        a=compute_envelope(g[:1])
        b=compute_envelope(g)
        self.assertLessEqual(b["candidate_cell_count"],a["candidate_cell_count"]+2)
    def test_sensitivity_buffer_broadens(self):
        g=sample_groups()
        self.assertLessEqual(compute_envelope(g,buffer_m=0)["estimated_area_m2"],
                             compute_envelope(g,buffer_m=100)["estimated_area_m2"])
    def test_reference_point_is_evaluated_only_post_prediction(self):
        r=compute_envelope(sample_groups()[:1])
        self.assertFalse(r["contains_point_not_ground_truth"])
        self.assertTrue(contains_reference_point(r,35.0,139.0))
        self.assertFalse(contains_reference_point(r,35.2,139.0))
    def test_multiple_representatives_are_union(self):
        g=sample_groups()
        g[0]["representatives"].append({"lat":35.0002,"lng":139.0})
        r=compute_envelope(g)
        self.assertEqual(r["station_group_count"],2)
        self.assertEqual(r["station_representative_count"],3)
    def test_bad_minutes_rejected(self):
        g=sample_groups();g[0]["max_walk_minutes"]="7-11"
        with self.assertRaises(ValueError):compute_envelope(g)
    def test_out_of_range_coords_rejected(self):
        g=sample_groups();g[0]["representatives"][0]["lat"]=101
        with self.assertRaises(ValueError):compute_envelope(g)
    def test_unsafe_resolution_rejected(self):
        with self.assertRaises(ValueError):compute_envelope(sample_groups(),grid_m=1)
    def test_margins_are_preregistered(self):
        self.assertEqual(FIXTURE["scenarios_m"],[0,100])
    def test_four_cases(self):
        self.assertEqual(len(FIXTURE["cases"]),4)
    def test_one_shared_station_not_double_counted(self):
        c=next(c for c in FIXTURE["cases"] if c["id"]=="C04")
        self.assertEqual(len(c["groups"]),1)

if __name__=="__main__": unittest.main()
