"""Geometry regressions: upper profiles must be smooth without radius overshoot."""
import unittest
from cloth_profiles import ClothProfile,TORSO_PROFILE,TORSO_RINGS,SLEEVE_RINGS

class ClothProfileTests(unittest.TestCase):
    def test_radii_do_not_overshoot_between_tailoring_knots(self):
        for rings in [TORSO_RINGS,SLEEVE_RINGS]:
            p=ClothProfile(rings)
            for a,b in zip(rings,rings[1:]):
                for i in range(33):
                    point=p.at(a[0]+(b[0]-a[0])*i/32)
                    for col in [1,2]:
                        self.assertGreaterEqual(point[col],min(a[col],b[col])-1e-10)
                        self.assertLessEqual(point[col],max(a[col],b[col])+1e-10)
    def test_upper_chest_derivatives_are_continuous(self):
        e=1e-7
        for x in [1.29,1.35,1.40,1.435,1.46]:
            for col in [1,2]:
                left=(TORSO_PROFILE.at(x)[col]-TORSO_PROFILE.at(x-e)[col])/e
                right=(TORSO_PROFILE.at(x+e)[col]-TORSO_PROFILE.at(x)[col])/e
                self.assertLess(abs(left-right),.001)
    def test_original_long_hem_and_slim_cuff_endpoints_remain(self):
        self.assertEqual(TORSO_PROFILE.at(.960),TORSO_RINGS[0])
        self.assertEqual(ClothProfile(SLEEVE_RINGS).at(.194),SLEEVE_RINGS[-1])

if __name__=='__main__':unittest.main()
