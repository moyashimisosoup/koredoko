import json,pathlib,sys,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
from blind_evaluate import evaluate

class HeldoutEvaluationTests(unittest.TestCase):
    def test_reference_file_belongs_to_locked_prior_commit(self):
        d=json.loads((ROOT/"examples/blind_holdout_gsi_references_20261019.json").read_text(encoding="utf8"))
        self.assertEqual(d["prediction_locked_commit"],"080c24c9de63586469ad267b9c8fd1eeb9bcac16")
        self.assertEqual(len(d["records"]),4)
        self.assertTrue(all("gsi" in k.lower() for k in ("gsi",)))
    def test_fixed_input_has_no_heldout_coordinates(self):
        inp=json.loads((ROOT/"examples/blind_poi_inputs_20261019.json").read_text(encoding="utf8"))
        self.assertTrue(all(not any(k in c for k in ("reference_lat","reference_lng","official_complex","address","name")) for c in inp["cases"]))
    def test_every_scenario_is_evaluated_without_mutation(self):
        result=evaluate()
        self.assertEqual(result["sample_count"],4)
        self.assertEqual(result["locked_prediction_sha"],"080c24c9de63586469ad267b9c8fd1eeb9bcac16")
        self.assertTrue(all(len(c["checks"])==2 for c in result["cases"]))
        for c in result["cases"]:
            self.assertEqual([x["buffer_m"] for x in c["checks"]],[0,100])
            self.assertEqual(len(c["checks"][0]["station_checks"]),len(c["checks"][1]["station_checks"]))
            self.assertLessEqual(c["checks"][0]["area_km2"],c["checks"][1]["area_km2"])
            if c["checks"][0]["block_reference_inside_nominal_envelope"]:
                self.assertTrue(c["checks"][1]["block_reference_inside_nominal_envelope"])
    def test_no_statistical_guarantee_is_emitted(self):
        report=evaluate()
        for disallowed in ("accuracy_probability","verified_property","confidence_percent","guaranteed_location"):
            self.assertNotIn(disallowed,report)
if __name__=="__main__":unittest.main()
