"""C1-continuous tailored cloth profiles; shape changes do not add mesh density."""
from bisect import bisect_right
from math import ceil

TORSO_RINGS=[(.960,.193,.126),(.964,.1936,.1266),(.972,.1935,.1265),(.978,.192,.125),(.995,.190,.123),(1.08,.184,.118),(1.15,.176,.112),(1.22,.172,.108),(1.29,.181,.109),(1.35,.188,.103),(1.40,.187,.093),(1.435,.173,.081),(1.46,.130,.067),(1.48,.064,.054)]
SLEEVE_RINGS=[(-.047,.002,.002),(-.030,.043,.040),(-.010,.057,.052),(.012,.061,.055),(.050,.060,.054),(.110,.058,.052),(.174,.057,.051),(.180,.0574,.0512),(.187,.0578,.0514),(.194,.058,.0515)]

class ClothProfile:
    """Monotone cubic Hermite interpolation, with no radius overshoot."""
    def __init__(self,rings):
        self.rings=rings;self.x=[r[0]for r in rings];self.h=[b-a for a,b in zip(self.x,self.x[1:])];self.slopes=[]
        for col in range(1,len(rings[0])):
            v=[r[col]for r in rings];d=[(b-a)/h for a,b,h in zip(v,v[1:],self.h)]
            if len(d)==1:m=[d[0],d[0]]
            else:
                m=[0.]*len(v)
                for i in range(1,len(v)-1):
                    if d[i-1]*d[i]>0:
                        w1=2*self.h[i]+self.h[i-1];w2=self.h[i]+2*self.h[i-1]
                        m[i]=(w1+w2)/(w1/d[i-1]+w2/d[i])
                for edge,h0,h1,d0,d1 in [(0,self.h[0],self.h[1],d[0],d[1]),(-1,self.h[-1],self.h[-2],d[-1],d[-2])]:
                    value=((2*h0+h1)*d0-h0*d1)/(h0+h1)
                    if value*d0<=0:value=0.
                    elif d0*d1<0 and abs(value)>3*abs(d0):value=3*d0
                    m[edge]=value
            self.slopes.append(m)
    def at(self,x):
        x=max(self.x[0],min(self.x[-1],x));i=max(0,min(len(self.x)-2,bisect_right(self.x,x)-1));h=self.h[i];t=(x-self.x[i])/h
        result=[x]
        for col,m in enumerate(self.slopes,1):
            result.append((2*t**3-3*t*t+1)*self.rings[i][col]+(t**3-2*t*t+t)*h*m[i]+(-2*t**3+3*t*t)*self.rings[i+1][col]+(t**3-t*t)*h*m[i+1])
        return tuple(result)
    def dense(self,step=.005):
        rows=[]
        for a,b in zip(self.x,self.x[1:]):
            count=max(1,ceil((b-a)/step));rows.extend(self.at(a+(b-a)*j/count)for j in range(count))
        return rows+[self.at(self.x[-1])]

TORSO_PROFILE=ClothProfile(TORSO_RINGS)
