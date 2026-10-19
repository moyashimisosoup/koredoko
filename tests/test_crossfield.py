import json
import sys
import pathlib
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'src'))
from contract_checks import validate_evidence_links

def fixture(): return json.loads((ROOT/'examples/synthetic_listing_v0.2.json').read_text(encoding='utf8'))

class CrossfieldChecks(unittest.TestCase):
    def test_valid_references(self): self.assertEqual(validate_evidence_links(fixture()),[])
    def test_source_id_dangling(self):
        d=fixture(); d['evidence'][0]['source_id']='invented'
        self.assertTrue(any('missing source' in e for e in validate_evidence_links(d)))
    def test_missing_quote(self):
        d=fixture(); d['evidence'][0]['verbatim_excerpt']=None
        self.assertTrue(any('no text span' in e for e in validate_evidence_links(d)))
    def test_invalid_field_pointer(self):
        d=fixture(); d['evidence'][0]['field_path']='listing.stations[42].walk_minutes'
        self.assertTrue(any('invalid field path' in e for e in validate_evidence_links(d)))
    def test_duplicate_source_id(self):
        d=fixture();d['sources'].append(d['sources'][0].copy())
        self.assertTrue(any('duplicated' in e for e in validate_evidence_links(d)))

if __name__=='__main__': unittest.main()
