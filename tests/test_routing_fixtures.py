import json,pathlib,sys,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'src'))
from accuracy_core import haversine_m

class RoutingSnapshotTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture=json.loads((ROOT/'examples'/'routing_observations_2026-10-19.json').read_text(encoding='utf8'))['entries']
    def test_unique_six_routes(self):
        self.assertEqual(len(self.fixture),6)
        self.assertEqual(len(set(x['id'] for x in self.fixture)),6)
    def test_distance_and_snap_numbers_replay(self):
        for case in self.fixture:
            with self.subTest(case=case['id']):
                d=haversine_m(*case['start_lat_lon'],*case['end_lat_lon'])
                p=haversine_m(*case['start_lat_lon'],*case['shape_first_lat_lon'])
                q=haversine_m(*case['end_lat_lon'],*case['shape_last_lat_lon'])
                self.assertAlmostEqual(d,case['straight_m_rounded'],delta=1.5)
                self.assertAlmostEqual(p,case['snapping_start_m_rounded'],delta=1.5)
                self.assertAlmostEqual(q,case['snapping_end_m_rounded'],delta=1.5)
                self.assertGreater(case['road_m']+p+q+3,d)
    def test_outlier_requires_review(self):
        case=next(x for x in self.fixture if x['id']=='T01')
        self.assertGreater(haversine_m(*case['end_lat_lon'],*case['shape_last_lat_lon']),25)
    def test_no_route_is_claimed_as_verified_property(self):
        self.assertTrue(all(not x['official_entrances_verified'] and not x['routing_graph_snapshot_identified'] for x in self.fixture))

if __name__=='__main__':unittest.main()
