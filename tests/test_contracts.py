import copy
import json
import pathlib
import unittest

from jsonschema import Draft202012Validator, FormatChecker

ROOT = pathlib.Path(__file__).resolve().parents[1]

def get(path): return json.loads((ROOT / path).read_text(encoding='utf-8'))

class ContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.input_validator = Draft202012Validator(get('schema/listing_v0.2.schema.json'),format_checker=FormatChecker())
        cls.output_validator = Draft202012Validator(get('schema/inference_output_v0.2.schema.json'),format_checker=FormatChecker())

    def test_synthetic_input_valid(self): self.assertFalse(list(self.input_validator.iter_errors(get('examples/synthetic_listing_v0.2.json'))))
    def test_synthetic_output_valid(self): self.assertFalse(list(self.output_validator.iter_errors(get('examples/synthetic_output_v0.2.json'))))
    def test_untracked_evidence_rejected(self):
        obj=get('examples/synthetic_listing_v0.2.json');obj['evidence'][0].pop('source_id')
        self.assertTrue(list(self.input_validator.iter_errors(obj)))
    def test_walk_mode_missing_rejected(self):
        obj=get('examples/synthetic_listing_v0.2.json');obj['listing']['stations'][0].pop('travel_mode')
        self.assertTrue(list(self.input_validator.iter_errors(obj)))
    def test_confidence_percentage_field_prohibited(self):
        obj=get('examples/synthetic_output_v0.2.json');obj['confidence_percent']=97
        self.assertTrue(list(self.output_validator.iter_errors(obj)))
    def test_single_source_unverified(self):
        obj=get('examples/synthetic_output_v0.2.json');obj['state']='verified_public';obj['location_is_verified']=True;obj['verified_source_ids']=['one']
        self.assertTrue(list(self.output_validator.iter_errors(obj)))
    def test_unverified_cannot_flag_true(self):
        obj=get('examples/synthetic_output_v0.2.json');obj['location_is_verified']=True
        self.assertTrue(list(self.output_validator.iter_errors(obj)))
    def test_valid_verified_requires_two_sources(self):
        obj=get('examples/synthetic_output_v0.2.json');obj['state']='verified_public';obj['location_is_verified']=True;obj['verified_source_ids']=['official','independent']
        self.assertFalse(list(self.output_validator.iter_errors(obj)))

if __name__ == '__main__': unittest.main()
