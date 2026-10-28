"""Generate lightweight, original VRMA idle, nod and wave clips."""
import json, math, struct, os
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
DEST=ROOT/os.environ.get('YYC_MOTION_OUT','public/animations/yyc')
DEST.mkdir(parents=True,exist_ok=True)
names=['hips','spine','chest','neck','head','leftUpperArm','rightUpperArm','leftLowerArm','rightLowerArm','leftHand','rightHand']
parents=[None,0,1,2,3,2,2,5,6,7,8]
positions=[(0,1,0),(0,.16,0),(0,.14,0),(0,.17,0),(0,.1,0),(.2,.12,0),(-.2,.12,0),(.23,0,0),(-.23,0,0),(.27,0,0),(-.27,0,0)]
for side,hand,sign in [('left',9,1),('right',10,-1)]:
    for finger in ['Index','Middle','Ring','Little']:
        parent=hand
        for segment in ['Proximal','Intermediate','Distal']:
            name=side+finger+segment
            names.append(name);parents.append(parent);positions.append((sign*.025,0,0));parent=len(names)-1
finger_names=names[11:]
def quat(axis,degrees):
    a=math.radians(degrees)/2
    return [axis[0]*math.sin(a),axis[1]*math.sin(a),axis[2]*math.sin(a),math.cos(a)]
def multiply(a,b):
    x,y,z,w=a;u,v,s,t=b
    return [w*u+x*t+y*s-z*v,w*v-x*s+y*t+z*u,w*s+x*v-y*u+z*t,w*t-x*u-y*v-z*s]
def euler(x,y,z):return multiply(multiply(quat((1,0,0),x),quat((0,1,0),y)),quat((0,0,1),z))
for mode,duration in [('idle',4.),('nod',2.4),('wave',3.2)]:
    if os.environ.get('YYC_MOTION_MODE') and os.environ['YYC_MOTION_MODE']!=mode:continue
    nodes=[{'name':name,'translation':list(positions[i])}for i,name in enumerate(names)]
    for i,p in enumerate(parents):
        if p is not None:nodes[p].setdefault('children',[]).append(i)
    doc={'asset':{'version':'2.0','generator':'YYC Original Reception Motions'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':nodes,
         'extensionsUsed':['VRMC_vrm_animation'],'extensions':{'VRMC_vrm_animation':{'specVersion':'1.0','humanoid':{'humanBones':{name:{'node':i}for i,name in enumerate(names)}}}},
         'buffers':[{}],'bufferViews':[],'accessors':[],'animations':[{'name':'YYC_'+mode,'samplers':[],'channels':[]}]}
    binary=bytearray()
    def acc(values,width):
        start=len(binary)
        for v in values:binary.extend(struct.pack('<'+'f'*width,*v))
        view=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':start,'byteLength':len(binary)-start})
        a={'bufferView':view,'componentType':5126,'count':len(values),'type':'SCALAR'if width==1 else'VEC4'}
        if width==1:a.update(min=[values[0][0]],max=[values[-1][0]])
        doc['accessors'].append(a);return len(doc['accessors'])-1
    times=[i*duration/80 for i in range(81)]
    timing=acc([(t,)for t in times],1)
    for name in ['spine','head','leftUpperArm','rightUpperArm','leftLowerArm','rightLowerArm','rightHand']+finger_names:
        values=[]
        for t in times:
            phase=t/duration
            angle=0.;axis=(0,0,1)
            if name=='leftUpperArm':angle=-75
            if name=='rightUpperArm':angle=75
            if name in ['leftLowerArm','rightLowerArm']:axis=(1,0,0);angle=18 if name.startswith('right')else -18
            if name in finger_names:
                axis=(0,0,1);angle=(-1 if name.startswith('left')else 1)*(12 if name.endswith('Proximal')else 16 if name.endswith('Intermediate')else 10)
                if mode=='wave' and name.startswith('right'):angle*=1-.8*math.sin(math.pi*phase)**.6
            if name=='spine':axis=(1,0,0);angle=.8*math.sin(2*math.pi*phase)
            if name=='head':
                axis=(1,0,0)
                angle=9*math.sin(4*math.pi*phase)*math.sin(math.pi*phase)**2 if mode=='nod' else .7*math.sin(2*math.pi*phase)
            if mode=='wave':
                envelope=math.sin(math.pi*phase)**.6
                # Keep this reception gesture close to the body.
                if name=='rightUpperArm':angle=75-20*envelope
                if name=='rightLowerArm':axis=(0,0,1);angle=-115*envelope
                if name=='rightHand':axis=(0,1,0);angle=18*math.sin(12*math.pi*phase)*envelope
            value=quat(axis,angle)
            if mode=='wave':
                # VRMA uses the VRM1 rest axes; retargeting to this VRM0 rig
                # flips X/Z. Match the upright, palm-forward runtime wave.
                if name=='rightUpperArm':value=euler(-10*envelope,0,76.7-21.7*envelope)
                if name=='rightLowerArm':value=euler(8*(1-envelope),14-39*envelope,6-151*envelope)
                if name=='rightHand':value=euler(-90*envelope,-2*(1-envelope),2*(1-envelope)-8*math.sin(10*t)*envelope)
            values.append(value)
        output=acc(values,4);animation=doc['animations'][0];sampler=len(animation['samplers'])
        animation['samplers'].append({'input':timing,'output':output,'interpolation':'LINEAR'})
        animation['channels'].append({'sampler':sampler,'target':{'node':names.index(name),'path':'rotation'}})
    doc['buffers'][0]['byteLength']=len(binary)
    data=json.dumps(doc,separators=(',',':')).encode();data+=b' '*((-len(data))%4)
    blob=struct.pack('<4sII',b'glTF',2,28+len(data)+len(binary))+struct.pack('<II',len(data),0x4e4f534a)+data+struct.pack('<II',len(binary),0x004e4942)+binary
    path=DEST/('YYC_'+mode+'.vrma');path.write_bytes(blob);print(path)
