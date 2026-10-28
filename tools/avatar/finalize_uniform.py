"""Put Blender's smoothed, UV-mapped, weighted garments into the VRM.
Run after build_school_avatar.py and the Blender preview script.
"""
from pathlib import Path
import json, struct, os
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/os.environ.get('YYC_AVATAR_OUT','models/yyc-info-day')
path=ROOT/os.environ.get('YYC_AVATAR_VRM','public/vrm/YYC_InfoDay.vrm')
base=OUT/'YYC_InfoDay_base.glb'
raw=(base if base.exists()else path).read_bytes();length=struct.unpack_from('<I',raw,12)[0]
doc=json.loads(raw[20:20+length]);binary=bytearray(raw[28+length:])
def accessor(values,kind,component=5126,target=34962):
    while len(binary)%4:binary.append(0)
    start=len(binary);width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[kind];fmt={5126:'f',5123:'H',5125:'I'}[component]
    for value in values:binary.extend(struct.pack('<'+fmt*width,*(value if isinstance(value,(tuple,list))else[value])))
    view=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':start,'byteLength':len(binary)-start,'target':target})
    a={'bufferView':view,'componentType':component,'count':len(values),'type':kind}
    if kind=='VEC3':
        a['min']=[min(v[k]for v in values)for k in range(3)];a['max']=[max(v[k]for v in values)for k in range(3)]
    doc['accessors'].append(a);return len(doc['accessors'])-1
materials={m['name']:i for i,m in enumerate(doc['materials'])}
for garment in json.loads((OUT/'uniform-geometry.json').read_text()):
    for node in doc['nodes']:
        if node.get('name')in garment['replaces']+[garment['name']]:
            node.pop('mesh',None);node.pop('skin',None)
    keys=['positions','normals','uv','joints','weights'];values={k:[]for k in keys};mapping={};lookup={}
    for i in range(len(garment['positions'])):
        key=tuple(tuple(round(v,6)for v in garment[k][i])for k in keys)
        if key not in lookup:
            lookup[key]=len(values['positions'])
            for k in keys:values[k].append(garment[k][i])
        mapping[i]=lookup[key]
    # Blender UVs use a lower-left image origin; glTF/VRM uses upper-left.
    uv=[[u,1-v]for u,v in values['uv']]
    attrs={'POSITION':accessor(values['positions'],'VEC3'),'NORMAL':accessor(values['normals'],'VEC3'),'TEXCOORD_0':accessor(uv,'VEC2'),'JOINTS_0':accessor(values['joints'],'VEC4',5123),'WEIGHTS_0':accessor(values['weights'],'VEC4')}
    primitives=[]
    for name,indices in garment['primitives'].items():
        primitives.append({'attributes':attrs,'indices':accessor([mapping[i]for i in indices],'SCALAR',5125,34963),'material':materials[name],'mode':4})
    mesh=len(doc['meshes']);doc['meshes'].append({'name':garment['name'],'primitives':primitives})
    node=len(doc['nodes']);doc['nodes'].append({'name':garment['name'],'mesh':mesh,'skin':1})
    doc['scenes'][doc.get('scene',0)]['nodes'].append(node)
    print(garment['name'],'vertices',len(values['positions']))
doc['extensions']['VRM']['meta']['version']=os.environ.get('YYC_AVATAR_VERSION','0.4.3')
doc['buffers'][0]['byteLength']=len(binary)
data=json.dumps(doc,ensure_ascii=False,separators=(',',':')).encode();data+=b' '*((-len(data))%4)
binary+=b'\0'*((-len(binary))%4)
output=struct.pack('<4sII',b'glTF',2,28+len(data)+len(binary))+struct.pack('<II',len(data),0x4e4f534a)+data+struct.pack('<II',len(binary),0x004e4942)+binary
path.write_bytes(output);(OUT/'YYC_InfoDay.glb').write_bytes(output)
print(path)
