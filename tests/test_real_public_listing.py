import json
import pathlib
import unittest
from jsonschema import Draft202012Validator, FormatChecker

ROOT = pathlib.Path(__file__).resolve().parents[1]
def data(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))

class PublicURListingContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.listing = data("examples/real_ur_kamata_listing_v0.2.json")
        cls.validator = Draft202012Validator(
            data("schema/listing_v0.2.schema.json"), format_checker=FormatChecker())

    def test_public_listing_conforms_to_input_schema(self):
        self.assertEqual(list(self.validator.iter_errors(self.listing)), [])

    def test_original_ad_claims_not_silently_invented(self):
        self.assertIsNone(self.listing["listing"]["built_year"])
        self.assertIsNone(self.listing["listing"]["area_sqm"])
        self.assertIsNone(self.listing["listing"]["unit_floor"])

    def test_station_minutes_and_single_source_lineage(self):
        self.assertEqual([s["walk_minutes"] for s in self.listing["listing"]["stations"]], [5,10])
        source_ids = {e["source_id"] for e in self.listing["evidence"]}
        self.assertEqual(source_ids, {"ur-kamata-official-20261019"})
        self.assertEqual(len({e["dependency_group"] for e in self.listing["evidence"]}), 1)

if __name__ == "__main__":
    unittest.main()
