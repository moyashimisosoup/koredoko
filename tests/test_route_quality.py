import pathlib, sys, unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'src'))
from route_quality import (decode_polyline6, assess_pedestrian_route,
                           compare_advertised_walk, RouteGate, WalkAdGate,
                           RouteAssessment)


def enc(points):
    last_a=last_b=0
    output=''
    for a,b in points:
        aa=int(round(a*1_000_000));bb=int(round(b*1_000_000))
        for delta in (aa-last_a,bb-last_b):
            number = delta << 1 if delta>=0 else ~(delta << 1)
            while number >= 0x20:
                output += chr((0x20 | (number&0x1f))+63)
                number >>= 5
            output += chr(number+63)
        last_a,last_b=aa,bb
    return output


def response(points, km=.687, unit='kilometers', status=0):
    return {'trip':{'status':status,'units':unit,'summary':{'length':km},
                    'legs':[{'shape':enc(points)}]}}

START=(35.681236,139.767052)
END=(35.6781,139.7639)

class PolylineTests(unittest.TestCase):
    def test_decode_roundtrip(self):
        a=[START,(35.6805,139.7660),END]
        self.assertEqual(decode_polyline6(enc(a)), a)
    def test_empty_shape_rejected(self):
        with self.assertRaises(ValueError): decode_polyline6('')
    def test_one_point_rejected(self):
        with self.assertRaises(ValueError): decode_polyline6(enc([START]))
    def test_truncated_shape_rejected(self):
        with self.assertRaises(ValueError): decode_polyline6('~')

class RouteQualityTests(unittest.TestCase):
    def test_normal_route_provisional_not_verified(self):
        a=assess_pedestrian_route(response([START,END]), START,END)
        self.assertEqual(a.gate,RouteGate.PROVISIONAL)
        self.assertEqual(a.road_m,687.0)
    def test_45m_snap_forces_review(self):
        moved=(END[0]-.0004,END[1])
        a=assess_pedestrian_route(response([START,moved]),START,END)
        self.assertEqual(a.gate,RouteGate.REVIEW)
    def test_wrong_unit_invalid(self):
        self.assertEqual(assess_pedestrian_route(response([START,END],unit='miles'),START,END).gate,RouteGate.INVALID)
    def test_non_success_invalid(self):
        self.assertEqual(assess_pedestrian_route(response([START,END],status=1),START,END).gate,RouteGate.INVALID)
    def test_impossible_shorter_than_geodesic(self):
        self.assertEqual(assess_pedestrian_route(response([START,END],km=.005),START,END).gate,RouteGate.INVALID)
    def test_missing_shape_invalid(self):
        self.assertEqual(assess_pedestrian_route({'trip':{'status':0,'units':'kilometers','summary':{'length':.687},'legs':[{}]}},START,END).gate,RouteGate.INVALID)
    def test_nan_invalid(self):
        self.assertEqual(assess_pedestrian_route(response([START,END],km=float('nan')),START,END).gate,RouteGate.INVALID)
    def test_invalid_lat_invalid(self):
        self.assertEqual(assess_pedestrian_route(response([START,END]),(139.7,35),END).gate,RouteGate.INVALID)
    def test_zero_length_invalid(self):
        self.assertEqual(assess_pedestrian_route(response([START,END],km=0),START,END).gate,RouteGate.INVALID)

class AdvertisementGateTests(unittest.TestCase):
    def obs(self,d,gate=RouteGate.PROVISIONAL):
        return RouteAssessment(gate,d,450,1.5,3,5,())
    def test_unverified_entrance_must_abstain(self):
        self.assertEqual(compare_advertised_walk(7,self.obs(687),graph_provenance_verified=True),WalkAdGate.UNRESOLVED)
    def test_unverified_graph_must_abstain(self):
        self.assertEqual(compare_advertised_walk(7,self.obs(687),entrances_independently_verified=True),WalkAdGate.UNRESOLVED)
    def test_large_snap_abstain(self):
        self.assertEqual(compare_advertised_walk(7,self.obs(687,RouteGate.REVIEW),entrances_independently_verified=True,graph_provenance_verified=True),WalkAdGate.UNRESOLVED)
    def test_caution_boundary_abstain(self):
        self.assertEqual(compare_advertised_walk(7,self.obs(565),entrances_independently_verified=True,graph_provenance_verified=True),WalkAdGate.UNRESOLVED)
    def test_compatible_only_all_gates(self):
        self.assertEqual(compare_advertised_walk(7,self.obs(520),entrances_independently_verified=True,graph_provenance_verified=True),WalkAdGate.COMPATIBLE)
    def test_incompatible_only_all_gates(self):
        self.assertEqual(compare_advertised_walk(7,self.obs(687),entrances_independently_verified=True,graph_provenance_verified=True),WalkAdGate.INCOMPATIBLE)
    def test_uncalibrated_error_buffer_rejected(self):
        self.assertEqual(compare_advertised_walk(7,self.obs(520),entrances_independently_verified=True,graph_provenance_verified=True,error_buffer_m=float('nan')),WalkAdGate.UNRESOLVED)

if __name__=='__main__': unittest.main()
