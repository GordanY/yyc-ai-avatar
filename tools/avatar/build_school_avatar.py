"""Build the Amica school-uniform avatar without changing the source VRM.

Uses the bundled, modification/redistribution-permitted VRoid Project sample
as a rigged anime base. New garments are weighted meshes, not painted pictures.
Run from the repository root with Python 3.9+.
"""
import copy
import json
import math
from pathlib import Path
import struct
import zlib
import os
from cloth_profiles import TORSO_PROFILE

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / os.environ.get('YYC_AVATAR_OUT', 'models/yyc-info-day')
OUT.mkdir(parents=True, exist_ok=True)
source = ROOT / 'public/vrm/AvatarSample_D.vrm'
raw = source.read_bytes()
json_length = struct.unpack_from('<I', raw, 12)[0]
doc = json.loads(raw[20:20 + json_length])
binary = bytearray(raw[28 + json_length:])
vrm = doc['extensions']['VRM']
license_url = vrm['meta']['otherLicenseUrl']
assert 'modification=allow' in license_url and 'redistribution=allow' in license_url


def accessor(values, kind, component=5126, target=34962):
    while len(binary) % 4:
        binary.append(0)
    offset = len(binary)
    width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[kind]
    fmt = {5126: 'f', 5123: 'H', 5125: 'I'}[component]
    for value in values:
        binary.extend(struct.pack('<' + fmt * width, *(value if isinstance(value, (tuple, list)) else [value])))
    vi = len(doc['bufferViews'])
    doc['bufferViews'].append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(binary) - offset, 'target': target})
    a = {'bufferView': vi, 'componentType': component, 'count': len(values), 'type': kind}
    if kind == 'VEC3' and component == 5126:
        a['min'] = [min(v[k] for v in values) for k in range(3)]
        a['max'] = [max(v[k] for v in values) for k in range(3)]
    doc['accessors'].append(a)
    return len(doc['accessors']) - 1


def material(name, color):
    index = len(doc['materials'])
    doc['materials'].append({'name': name, 'pbrMetallicRoughness': {'baseColorFactor': [*color, 1], 'metallicFactor': 0, 'roughnessFactor': .85}, 'doubleSided': True})
    vrm['materialProperties'].append({'name': name, 'shader': 'VRM/MToon', 'renderQueue': 2000,
        'floatProperties': {'_BlendMode': 0, '_CullMode': 0, '_OutlineWidthMode': 1, '_OutlineWidth': .12, '_ShadeShift': 0, '_ShadeToony': .8, '_IndirectLightIntensity': .3, '_ZWrite': 1, '_SrcBlend': 1, '_DstBlend': 0},
        'vectorProperties': {'_Color': [*color, 1], '_ShadeColor': [*(c * .72 for c in color), 1], '_OutlineColor': [.04, .04, .05, 1]},
        'textureProperties': {}, 'keywordMap': {'MTOON_OUTLINE_WIDTH_WORLD': True, 'MTOON_OUTLINE_COLOR_FIXED': True}, 'tagMap': {'RenderType': 'Opaque'}})
    return index


red = material('YYC_Sports_Red', (.60, .008, .014))
white = material('YYC_Sports_White', (.8, .82, .84))
green = material('YYC_Track_DeepGreen', (.01, .04, .025))
black = material('YYC_Collar_Charcoal', (.0134117489, .0153252033, .0196066485))
vrm['materialProperties'][black]['vectorProperties'].update({'_Color':[.12,.13,.15,1],'_ShadeColor':[.09,.098,.113,1]})
vrm['materialProperties'][black]['floatProperties'].update({'_OutlineWidthMode':0,'_OutlineWidth':0,'_ShadeShift':-.5,'_ShadeToony':.2})
vrm['materialProperties'][black]['keywordMap']={} 
# Median of 142 unpainted cheek samples from the actual face texture.
# glTF factors are linear; VRM 0.x MToon colours are stored in sRGB.
face_skin_srgb=[0.9313725490196079,0.807843137254902,0.7156862745098039]
face_skin_linear=[0.8509272707154808,0.6172065624196511,0.4706525279681792]
skin = material('YYC_Uncovered_Skin',tuple(face_skin_linear))
doc['materials'][skin]['pbrMetallicRoughness']['roughnessFactor']=.9
skin_prop=vrm['materialProperties'][skin]
skin_prop['vectorProperties'].update({'_Color':[*face_skin_srgb,1],'_ShadeColor':[*face_skin_srgb,1],'_OutlineColor':[.36,.24,.20,1]})
skin_prop['floatProperties'].update({'_ShadeShift':-.9,'_ShadeToony':0,'_IndirectLightIntensity':.1,'_OutlineWidth':.025})
# Keep a subtle warm silhouette instead of heavy dark borders on skin.
vrm['materialProperties'][5]['floatProperties']['_OutlineWidth']=.045
vrm['materialProperties'][5]['vectorProperties']['_OutlineColor']=[.36,.22,.20,1]
scalp = material('YYC_Hair_ScalpBlack', (.014,.017,.024))
sole = material('YYC_Sneaker_Rubber', (.055,.065,.080))
sleeve_red = material('YYC_Sleeve_Red', (.64,.012,.023))
vrm['materialProperties'][sleeve_red]['floatProperties'].update({'_OutlineWidthMode':0,'_OutlineWidth':0})
vrm['materialProperties'][sleeve_red]['keywordMap']={}
vrm['materialProperties'][sleeve_red]['floatProperties'].update({'_ShadeShift':-.35,'_ShadeToony':.4})

# A restrained, original anime fabric texture: broad soft folds, double-stitched
# hems and very low-contrast weave. No photographed fabric or external assets.
size=1024
pixels=bytearray()
shirt_pixels=bytearray()
sleeve_pixels=bytearray()
pants_pixels=bytearray()
hair_pixels=bytearray()
for py in range(size):
    pixels.append(0)
    shirt_pixels.append(0);pants_pixels.append(0);sleeve_pixels.append(0)
    hair_pixels.append(0)
    v=py/(size-1)
    width=.021-.007*v
    height=min(1.45,.93+.52*v)
    panel_path=[(.93,.177),(1.05,.169),(1.15,.158),(1.25,.151),(1.34,.143),(1.40,.113),(1.45,.077)]
    pa,pb=next((a,b)for a,b in zip(panel_path,panel_path[1:])if a[0]<=height<=b[0])
    pt=(height-pa[0])/(pb[0]-pa[0])
    pi=panel_path.index(pa)
    prev=panel_path[max(0,pi-1)];following=panel_path[min(len(panel_path)-1,pi+2)]
    ma=(pb[1]-prev[1])/(pb[0]-prev[0]);mb=(following[1]-pa[1])/(following[0]-pa[0])
    span=pb[0]-pa[0]
    panel_x=(2*pt**3-3*pt**2+1)*pa[1]+(pt**3-2*pt**2+pt)*span*ma+(-2*pt**3+3*pt**2)*pb[1]+(pt**3-pt**2)*span*mb
    panel_center=.5-panel_x/.70
    body_path=[(.93,.190),(1.05,.182),(1.15,.173),(1.25,.172),(1.34,.184),(1.40,.164),(1.45,.067)]
    ba,bb=next((a,b)for a,b in zip(body_path,body_path[1:])if a[0]<=height<=b[0])
    body_radius=ba[1]+(bb[1]-ba[1])*(height-ba[0])/(bb[0]-ba[0])
    shoulder_blend=max(0,min(1,(height-1.18)/.06))
    outer_x=(body_radius+.006)*(1-shoulder_blend)+(panel_x+width*.70)*shoulder_blend
    for px in range(size):
        u=px/(size-1)
        highlight=math.exp(-((v-(.36+.045*math.sin(u*math.pi*2)))/.13)**2)
        strand=1.4*math.sin(u*math.pi*112)+.7*math.sin(u*math.pi*270)
        hair_pixels.extend((round(18+12*highlight+strand),round(20+13*highlight+strand),round(25+16*highlight+strand),255))
        folds=0.;shirt_folds=0.
        for center,strength,fold_width in [(.14,.07,.024),(.29,.035,.04),(.70,.04,.045),(.88,.055,.025)]:
            curved=center+.013*math.sin(u*math.pi*6)+.007*math.sin(u*math.pi*14)
            d=(v-curved)/fold_width
            folds+=strength*math.exp(-d*d)-strength*.45*math.exp(-((d-.85)/.7)**2)
            if center<.4:shirt_folds+=.55*strength*math.exp(-d*d)-.20*strength*math.exp(-((d-.85)/.7)**2)
        for u0,u1,v0,slope in [(.28,.50,.18,.50),(.48,.72,.34,-.60),(.29,.43,.65,-1.0),(.59,.72,.68,1.1)]:
            if u0<u<u1:
                fade=math.sin(math.pi*(u-u0)/(u1-u0))**2
                dist=(v-(v0+slope*(u-u0)))/.009
                folds+=.06*fade*math.exp(-dist*dist)-.02*fade*math.exp(-((dist-1.1)/.8)**2)
                upper=max(0,min(1,(.82-v)/.24));upper=upper*upper*(3-2*upper)
                shirt_folds+=upper*(.022*fade*math.exp(-(dist*.65)**2)-.007*fade*math.exp(-(((dist-1.1)*.65)/.8)**2))
        seam=sum(.025*math.exp(-((v-h)/.0016)**2) for h in [.035,.043,.957,.965])
        stitching=.015 if int(u*size)%11<5 and (abs(v-.039)<.001 or abs(v-.961)<.001) else 0
        weave=.005*math.sin(px*math.pi/2)*math.sin(py*math.pi/2)
        gray=round(255*max(.70,min(1,.985-folds-seam-stitching+weave)))
        pixels.extend((gray,gray,gray,255))
        shirt_seam=sum(.014*math.exp(-((v-h)/.0018)**2)for h in [.035,.043])
        shirt_stitch=.007 if int(u*size)%11<5 and abs(v-.039)<.001 else 0
        shirt_gray=round(255*max(.86,min(1,.985-shirt_folds-shirt_seam-shirt_stitch+weave*.4)))
        shoulder=max(0,min(1,(v-.65)/.35))
        sleeve_pixels.extend((round(210*shirt_gray/255),round(28*shirt_gray/255),round(40*shirt_gray/255),255))
        side_distance=min(abs(u-panel_center),abs(u-(1-panel_center)))
        sample_x=abs(u-.5)*.70
        shirt_mask=max(0,min(1,(sample_x-(panel_x-width*.70))/.0015))*max(0,min(1,(outer_x-sample_x)/.0015))
        pants_mask=max(0,min(1,(.105-abs(u-.5))/.002))
        for output,base,mask in [(shirt_pixels,(210,28,40),shirt_mask),(pants_pixels,(24,58,43),pants_mask)]:
            tone=shirt_gray if output is shirt_pixels else gray
            color=[round((base[k]*(1-mask)+238*mask)*tone/255) for k in range(3)]
            output.extend((*color,255))
def chunk(kind,data):
    return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
def add_texture(name,pixels):
    png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',size,size,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(pixels,9))+chunk(b'IEND',b'')
    (OUT/(name+'.png')).write_bytes(png)
    while len(binary)%4:binary.append(0)
    view=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':len(binary),'byteLength':len(png)})
    binary.extend(png)
    image=len(doc['images']);doc['images'].append({'name':name,'bufferView':view,'mimeType':'image/png'})
    texture=len(doc['textures']);doc['textures'].append({'source':image,'sampler':0})
    return texture
fabric_texture=add_texture('YYC_FabricDetail',pixels)
shirt_texture=add_texture('YYC_Shirt_Anime',shirt_pixels)
sleeve_texture=add_texture('YYC_Sleeve_Anime',sleeve_pixels)
pants_texture=add_texture('YYC_Trousers_Anime',pants_pixels)
hair_texture=add_texture('YYC_Hair_Anime',hair_pixels)
doc['materials'][13]['pbrMetallicRoughness']['baseColorTexture']={'index':hair_texture}
vrm['materialProperties'][13]['textureProperties']['_MainTex']=hair_texture
vrm['materialProperties'][13]['textureProperties']['_ShadeTexture']=hair_texture
for mi,texture in [(red,shirt_texture),(white,fabric_texture),(green,pants_texture),(sleeve_red,sleeve_texture)]:
    doc['materials'][mi]['pbrMetallicRoughness']['baseColorTexture']={'index':texture}
    vrm['materialProperties'][mi]['textureProperties']={'_MainTex':texture,'_ShadeTexture':texture}
    if mi!=white:
        doc['materials'][mi]['pbrMetallicRoughness']['baseColorFactor']=[1,1,1,1]
        vrm['materialProperties'][mi]['vectorProperties']['_Color']=[1,1,1,1]
        vrm['materialProperties'][mi]['vectorProperties']['_ShadeColor']=[.7,.7,.7,1]
    vrm['materialProperties'][mi]['floatProperties']['_OutlineWidthMode']=0
    vrm['materialProperties'][mi]['floatProperties']['_OutlineWidth']=0
    vrm['materialProperties'][mi]['floatProperties'].update({'_ShadeShift':-.35,'_ShadeToony':.4})
    vrm['materialProperties'][mi]['keywordMap']={}
# Keep the complete skin, finger geometry and shoe geometry. Remove the hoodie
# and jeans primitives. Facial morph targets and all original joints stay intact.
body = doc['meshes'][1]
body['primitives'] = [p for p in body['primitives'] if p['material'] not in (10, 11)]
def read_accessor(i):
    a=doc['accessors'][i]
    view=doc['bufferViews'][a['bufferView']]
    width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
    fmt={5126:'f',5123:'H',5125:'I',5121:'B'}[a['componentType']]
    start=view.get('byteOffset',0)+a.get('byteOffset',0)
    stride=view.get('byteStride',struct.calcsize('<'+fmt*width))
    return [struct.unpack_from('<'+fmt*width,binary,start+n*stride)for n in range(a['count'])]
extra_body=[]
for p in body['primitives']:
    if p['material'] == 12:
        positions=read_accessor(p['attributes']['POSITION'])
        indices=[v[0]for v in read_accessor(p['indices'])]
        ai=p['attributes']['POSITION'];a=doc['accessors'][ai];v=doc['bufferViews'][a['bufferView']]
        for vi in set(indices):
            x,y,z=positions[vi];cx=.054 if x>0 else -.054
            x=cx+(x-cx)*1.16
            if y>.07:y=.07+(y-.07)*.42
            z*=1.05
            struct.pack_into('<3f',binary,v.get('byteOffset',0)+a.get('byteOffset',0)+vi*v.get('byteStride',12),x,y,z)
        lower=[];upper=[]
        for ti in range(0,len(indices),3):
            tri=indices[ti:ti+3]
            (lower if max(positions[k][1]for k in tri)<.032 else upper).extend(tri)
        if lower:
            q=copy.deepcopy(p);q['material']=sole;q['indices']=accessor(lower,'SCALAR',5125,34963);extra_body.append(q)
        p['indices']=accessor(upper,'SCALAR',5125,34963)
        p['material'] = white
    elif p['material'] == 9:
        # Hide skin under the uniform; the base texture also contains gloves
        # and underwear, so exposed arms/hands use a neutral skin material.
        positions=read_accessor(p['attributes']['POSITION'])
        indices=[v[0]for v in read_accessor(p['indices'])]
        keep=[];scalp_triangles=[]
        for i in range(0,len(indices),3):
            tri=indices[i:i+3]
            if all((positions[v][1]>1.39 and abs(positions[v][0])<.145) or (abs(positions[v][0])>.31 and positions[v][1]>1.28) for v in tri):
                if sum(positions[v][1]for v in tri)/3>1.585 and sum(positions[v][2]for v in tri)/3>-.018:scalp_triangles.extend(tri)
                else:keep.extend(tri)
        if scalp_triangles:
            q=copy.deepcopy(p);q['material']=scalp;q['indices']=accessor(scalp_triangles,'SCALAR',5125,34963);extra_body.append(q)
        if keep:
            p['indices']=accessor(keep,'SCALAR',5125,34963)
        else:
            p['_remove']=True
        p['material']=skin
body['primitives']=[p for p in body['primitives'] if not p.pop('_remove',False)]+extra_body
joint_ids = {doc['nodes'][node]['name']: i for i, node in enumerate(doc['skins'][1]['joints'])}


def blend(names):
    entries = [(joint_ids[name], weight) for name, weight in names if weight > 0]
    total = sum(w for _, w in entries)
    return ([i for i, _ in entries] + [0] * 4)[:4], ([w / total for _, w in entries] + [0.] * 4)[:4]


def torso_weights(x, y, z):
    if y>1.36 and abs(x)>.13:
        side='L' if x<0 else 'R'
        t=max(0,min(.85,(abs(x)-.13)/.10))
        return blend([('J_Bip_C_Chest',1-t),('J_Bip_'+side+'_UpperArm',t)])
    if y < 1.15:
        t = max(0, min(1, (y - 1.04) / .11))
        return blend([('J_Bip_C_Hips', 1-t), ('J_Bip_C_Spine', t)])
    t = max(0, min(1, (y - 1.15) / .22))
    return blend([('J_Bip_C_Spine', 1-t), ('J_Bip_C_Chest', t)])


def add_surface(name, rings, point, weights, material_for_face, closed_ends=False):
    segments = 48
    # Enough longitudinal samples for actual folds instead of painted bands.
    if name in {'YYC_Polo','YYC_L_TrackPants','YYC_R_TrackPants'}:
        dense=[]
        for a,b in zip(rings,rings[1:]):
            steps=max(1,math.ceil(abs(b[0]-a[0])/.009))
            dense.extend(tuple(a[k]+(b[k]-a[k])*j/steps for k in range(len(a))) for j in range(steps))
        rings=dense+[rings[-1]]
    pos, uv, joints, ws = [], [], [], []
    for row, ring in enumerate(rings):
        for col in range(segments):
            angle = 2 * math.pi * col / segments
            p = point(ring, angle)
            x,y,z=p
            if name=='YYC_Polo':
                lower=math.exp(-((y-1.09)/.085)**2)
                underarm=math.exp(-((y-1.32)/.06)**2)
                fold=.0035*lower*math.sin(angle*7+(y-1)*35)+.0022*underarm*math.sin(angle*9-y*26)
                x+=fold*math.cos(angle);z+=fold*math.sin(angle)
                y-=.038*max(0,-math.sin(angle))*max(0,min(1,(y-1.43)/.05))
            elif name.endswith('_TrackPants'):
                transition=max(0,min(1,(y-.91)/.12));transition=transition*transition*(3-2*transition)
                z*=1-.17*transition
                ankle=math.exp(-((y-.19)/.09)**2)
                knee=math.exp(-((y-.54)/.09)**2)
                fold=.0050*ankle*math.sin(y*105+angle*2)+.0035*knee*math.sin(y*66-angle*3)
                x+=fold*math.cos(angle);z+=fold*math.sin(angle)
            p=(x,y,z)
            pos.append(p)
            uv.append((col / segments, row / (len(rings) - 1)))
            ji, weight = weights(*p)
            joints.append(ji)
            ws.append(weight)
    triangles = {}
    for row in range(len(rings)-1):
        for col in range(segments):
            if name=='YYC_Black_Collar' and math.sin(2*math.pi*(col+.5)/segments)<-.94:continue
            a = row*segments+col
            b = row*segments+(col+1)%segments
            c = a+segments
            d = b+segments
            m = material_for_face(row, 2*math.pi*(col+.5)/segments)
            triangles.setdefault(m, []).extend([(a,b,c), (b,d,c)])
    if closed_ends:
        for row in (0, len(rings)-1):
            for col in range(1, segments-1):
                triangles.setdefault(material_for_face(0,0), []).append((row*segments,row*segments+col,row*segments+col+1))
    # Orient triangles against an outward radial vector; accumulate normals.
    normals = [[0.,0.,0.] for p in pos]
    for m, tris in triangles.items():
        for ti, (a,b,c) in enumerate(tris):
            u=[pos[b][k]-pos[a][k] for k in range(3)]
            v=[pos[c][k]-pos[a][k] for k in range(3)]
            n=[u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]]
            # All garments are double-sided; consistent normals still matter.
            ring = rings[a//segments]
            center = point(ring, 0)
            opposite = point(ring, math.pi)
            center=[(center[k]+opposite[k])/2 for k in range(3)]
            radial=[pos[a][k]-center[k] for k in range(3)]
            if sum(n[k]*radial[k] for k in range(3)) < 0:
                n=[-x for x in n]
                tris[ti]=(a,c,b)
            for i in (a,b,c):
                for k in range(3): normals[i][k]+=n[k]
    normals=[tuple(v/math.sqrt(sum(x*x for x in n)) if any(n) else 0 for v in n) for n in normals]
    attributes={'POSITION': accessor(pos,'VEC3'), 'NORMAL': accessor(normals,'VEC3'), 'TEXCOORD_0': accessor(uv,'VEC2'), 'JOINTS_0': accessor(joints,'VEC4',5123), 'WEIGHTS_0': accessor(ws,'VEC4')}
    primitives=[]
    for m, tris in triangles.items():
        primitives.append({'attributes': attributes, 'indices':accessor([i for tri in tris for i in tri],'SCALAR',5125,34963), 'material':m, 'mode':4})
    mesh=len(doc['meshes'])
    doc['meshes'].append({'name': name, 'primitives':primitives})
    node=len(doc['nodes'])
    doc['nodes'].append({'name':name,'mesh':mesh,'skin':1})
    doc['scenes'][doc.get('scene',0)]['nodes'].append(node)


# Torso in T pose, slightly loose fit. Angular white panels follow both sides.
rings=[(.990,.198,.132),(1.005,.198,.132),(1.025,.194,.130),(1.08,.188,.123),(1.15,.179,.115),(1.22,.169,.108),(1.29,.182,.109),(1.35,.199,.105),(1.40,.211,.096),(1.435,.203,.086),(1.46,.152,.070),(1.48,.064,.054)]
add_surface('YYC_Polo',rings,lambda r,a:(r[1]*math.cos(a),r[0],r[2]*math.sin(a)),torso_weights,
    lambda row,a:white if abs(math.sin(a))<(.65 if row<6 else .42) else red)
# Collar is a separate short annulus around the neckline.
add_surface('YYC_Black_Collar',[(1.4725,.086,.059),(1.474,.084,.058),(1.488,.066,.053),(1.491,.062,.051),(1.493,.059,.049)],
    lambda r,a:(r[1]*math.cos(a),r[0]-.038*max(0,-math.sin(a))*max(0,min(1,(r[0]-1.43)/.05)),r[2]*math.sin(a)),torso_weights,lambda row,a:black)

# Two small flat collar leaves give the neckline a polo-shirt silhouette.
for sign in [-1,1]:
    pos=[(sign*.012,1.450,-.060),(sign*.064,1.485,-.056),(sign*.093,1.445,-.088),(sign*.047,1.422,-.105)]
    influences=[torso_weights(*p)for p in pos]
    attributes={'POSITION':accessor(pos,'VEC3'),'NORMAL':accessor([(0,0,-1)]*4,'VEC3'),'JOINTS_0':accessor([i[0]for i in influences],'VEC4',5123),'WEIGHTS_0':accessor([i[1]for i in influences],'VEC4')}
    mesh=len(doc['meshes']);doc['meshes'].append({'name':'YYC_Polo_CollarLeaf','primitives':[{'attributes':attributes,'indices':accessor([0,1,2,0,2,3],'SCALAR',5125,34963),'material':black}]})
    node=len(doc['nodes']);doc['nodes'].append({'name':'YYC_Polo_CollarLeaf','mesh':mesh,'skin':1});doc['scenes'][doc.get('scene',0)]['nodes'].append(node)

for side,sign in [('L',-1),('R',1)]:
    bone='J_Bip_'+side+'_UpperArm'
    def armweights(x,y,z,sign=sign,bone=bone):
        return blend([(bone,1)])
    add_surface('YYC_'+side+'_ShortSleeve',[(.14,.073,.078),(.205,.073,.077),(.255,.069,.073),(.303,.064,.069),(.314,.065,.070)],
        lambda r,a,s=sign:(s*r[0],1.414+r[1]*math.cos(a),r[2]*math.sin(a)),armweights,lambda row,a:sleeve_red)
    upper='J_Bip_'+side+'_UpperLeg'
    lower='J_Bip_'+side+'_LowerLeg'
    def legweights(x,y,z,upper=upper,lower=lower):
        if y>1.0:
            t=max(0,min(1,(y-1.0)/.08))
            return blend([(upper,1-t),('J_Bip_C_Hips',t)])
        t=max(0,min(1,(.66-y)/.14))
        return blend([(upper,1-t),(lower,t)])
    leg_rings=[(1.085,.084,.084,.098),(1.02,.088,.087,.104),(.94,.096,.092,.110),(.86,.096,.084,.105),(.76,.094,.078,.100),(.66,.091,.077,.095),(.57,.089,.075,.094),(.51,.087,.075,.095),(.46,.085,.074,.090),(.39,.078,.073,.087),(.31,.073,.071,.085),(.26,.068,.070,.088),(.23,.065,.071,.085),(.20,.062,.066,.081),(.175,.059,.070,.087),(.15,.057,.066,.084),(.125,.056,.062,.079),(.105,.055,.063,.078)]
    # A gentle A stance: upper thighs closer, lower legs following straight
    # lines toward slightly wider ankles, rather than bulging at the knees.
    tailored=[]
    for y,center,width,depth in leg_rings:
        t=max(0,min(1,(.94-y)/.835));center=.080+.016*t
        limit=center+.008 if y>.94 else center-(.012+.020*t)/2
        tailored.append((y,center,min(width,limit),depth))
    leg_rings=tailored
    add_surface('YYC_'+side+'_TrackPants',leg_rings,
        lambda r,a,s=sign:(s*(r[1]+(r[2]if r[0]>.9 else min(r[2],r[1]-.008))*math.cos(a)),r[0],.007+r[3]*math.sin(a)),legweights,
        lambda row,a:white if math.cos(a)>.91 else green)

# A continuous pelvis cover prevents the independent trouser legs leaving an
# open seam at the groin when either leg moves.
def pelvis_surface(r,a):
    t=max(0,min(1,(r[0]-.935)/.105));t=t*t*(3-2*t)
    depth=r[2]*(1-.34*(1-t)*abs(math.sin(a))**8)
    return (r[1]*math.cos(a),r[0],.007+depth*math.sin(a))
add_surface('YYC_TrackPants_Pelvis',[(.935,.153,.105),(.98,.163,.105),(1.02,.163,.103),(1.085,.162,.099)],
    pelvis_surface,lambda x,y,z:blend([('J_Bip_C_Hips',1)]),lambda row,a:green)

# Preserve the base's license and author rather than claiming its face is new.
detail_path=ROOT/'tools/avatar/build_detail_geometry.py'
exec(compile(detail_path.read_text(),str(detail_path),'exec'),globals())
vrm['meta']['title']='YYC Info Day — Sports Uniform'
vrm['meta']['version']='0.1.0'
vrm['meta']['author']='VRoid Project (base); YYC uniform adaptation'
vrm['meta']['reference']='School Sports Uniform Character Turnaround; see models/yyc-info-day/README.md'
vrm['exporterVersion']='YYC School Avatar Builder 0.1'
doc['asset']['generator']='YYC School Avatar Builder; VRoid Project base'

# Brown/red texture multiplication is deliberately neutralised for this design:
# black hair and black irises, preserving the separate white eye highlights.
for mi, tint in [(2,[.008,.008,.008,1]),(13,[1,1,1,1])]:
    doc['materials'][mi]['pbrMetallicRoughness']['baseColorFactor']=tint
    vrm['materialProperties'][mi]['vectorProperties']['_Color']=tint
    vrm['materialProperties'][mi]['vectorProperties']['_ShadeColor']=tint

# A subtle friendly face adjustment applied consistently to every expression.
def friendly_face(p):
    x,y,z=p
    jaw=max(0,min(1,(1.58-y)/.07))
    x*=1+.04*jaw;y+=.004*jaw
    eye=math.exp(-((abs(x)-.041)/.040)**4-((y-1.604)/.032)**4)
    y+=.08*(y-1.604)*eye
    smile=.0028*(x/.023)**2*math.exp(-((y-1.547)/.012)**2-(x/.032)**4)
    return [x,y+smile,z]
seen_face=set()
for primitive in doc['meshes'][0]['primitives']:
    ai=primitive['attributes']['POSITION']
    if ai in seen_face:continue
    seen_face.add(ai);values=read_accessor(ai);changed=[friendly_face(p)for p in values]
    a=doc['accessors'][ai];v=doc['bufferViews'][a['bufferView']]
    for i,p in enumerate(changed):struct.pack_into('<3f',binary,v.get('byteOffset',0)+a.get('byteOffset',0)+i*v.get('byteStride',12),*p)
    for target in primitive.get('targets',[]):
        ti=target.get('POSITION')
        if ti is None or ti in seen_face:continue
        seen_face.add(ti);ta=doc['accessors'][ti];tv=doc['bufferViews'][ta['bufferView']]
        for i,delta in enumerate(read_accessor(ti)):
            new=friendly_face([values[i][k]+delta[k]for k in range(3)])
            struct.pack_into('<3f',binary,tv.get('byteOffset',0)+ta.get('byteOffset',0)+i*tv.get('byteStride',12),*[new[k]-changed[i][k]for k in range(3)])

# A slightly larger head and shorter legs match the approved youthful anime
# proportions. Apply the same spatial warp to geometry, joints and bind poses.
def stance_shift(y):
    # Move the rig and footwear with the new trouser stance. The old constant
    # leg spread amplified the knee bow and left the feet close together.
    knots=[(0.,.046),(.127,.046),(.583,.026),(.90,-.004),(.974,-.004),(1.02,0.)]
    if y>=1.02:return 0.
    y=max(0.,y)
    a,b=next((a,b)for a,b in zip(knots,knots[1:])if a[0]<=y<=b[0])
    t=(y-a[0])/(b[0]-a[0]);return a[1]+(b[1]-a[1])*t
def warp(p,cloth=False):
    x,y,z=p
    new_y=y*.97 if y<1.04 else y-.0312
    head=max(0.,min(1.,(y-1.49)/.08))
    size=1+.015*head
    spread=0. if cloth else stance_shift(y)*(1. if y<.85 else min(1,abs(x)/.055))*(1 if x>0 else -1 if x<0 else 0)
    return [x*(.98+.02*head)+spread,1.49+(new_y-1.49)*size if head else new_y,z*size]
seen=set()
for mesh in doc['meshes']:
    for primitive in mesh['primitives']:
        ai=primitive['attributes']['POSITION']
        if ai in seen:continue
        seen.add(ai)
        positions=read_accessor(ai)
        a=doc['accessors'][ai]; view=doc['bufferViews'][a['bufferView']]
        is_trousers=mesh.get('name','')in {'YYC_L_TrackPants','YYC_R_TrackPants','YYC_TrackPants_Pelvis'}
        transformed=[warp(p,cloth=is_trousers)for p in positions]
        if mesh is body:
            js=read_accessor(primitive['attributes']['JOINTS_0']);ws=read_accessor(primitive['attributes']['WEIGHTS_0'])
            for vi,(position,indices,weights)in enumerate(zip(positions,js,ws)):
                if position[1]>.25:continue
                ji=indices[max(range(4),key=lambda k:weights[k])]
                name=doc['nodes'][doc['skins'][1]['joints'][ji]]['name']
                side=-1 if '_L_'in name else 1 if '_R_'in name else 0
                # Three expanded inner-shoe vertices cross x=0. Keep each on
                # its bound foot instead of stretching it toward the other shoe.
                if side*position[0]<0:
                    transformed[vi][0]+=2*side*stance_shift(position[1])

        for vi,p in enumerate(transformed):
            struct.pack_into('<3f',binary,view.get('byteOffset',0)+a.get('byteOffset',0)+vi*view.get('byteStride',12),*p)
        a['min']=[min(p[k]for p in transformed)for k in range(3)]
        a['max']=[max(p[k]for p in transformed)for k in range(3)]
        for target in primitive.get('targets',[]):
            ti=target.get('POSITION')
            if ti is None or ti in seen:continue
            seen.add(ti)
            target_positions=read_accessor(ti)
            ta=doc['accessors'][ti];tv=doc['bufferViews'][ta['bufferView']]
            for vi,delta in enumerate(target_positions):
                base=positions[vi];moved=warp([base[k]+delta[k]for k in range(3)],cloth=is_trousers)
                struct.pack_into('<3f',binary,tv.get('byteOffset',0)+ta.get('byteOffset',0)+vi*tv.get('byteStride',12),*[moved[k]-transformed[vi][k]for k in range(3)])
parents={child:i for i,n in enumerate(doc['nodes'])for child in n.get('children',[])}
world={}
def world_position(i):
    if i not in world:
        node=doc['nodes'][i]
        assert node.get('rotation',[0,0,0,1])==[0,0,0,1]
        local=node.get('translation',[0,0,0]);parent=world_position(parents[i])if i in parents else[0,0,0]
        world[i]=[local[k]+parent[k]for k in range(3)]
    return world[i]
for ni in range(len(doc['nodes'])):world_position(ni)
for ni,node in enumerate(doc['nodes']):
    p=warp(world[ni]);parent=warp(world[parents[ni]])if ni in parents else[0,0,0]
    node['translation']=[p[k]-parent[k]for k in range(3)]
for s in doc['skins']:
    a=doc['accessors'][s['inverseBindMatrices']];v=doc['bufferViews'][a['bufferView']]
    for ji,ni in enumerate(s['joints']):
        p=warp(world[ni]);matrix=[1,0,0,0,0,1,0,0,0,0,1,0,-p[0],-p[1],-p[2],1]
        struct.pack_into('<16f',binary,v.get('byteOffset',0)+a.get('byteOffset',0)+ji*64,*matrix)
doc['buffers'][0]['byteLength']=len(binary)


def write_glb(path):
    encoded=json.dumps(doc,ensure_ascii=False,separators=(',',':')).encode('utf-8')
    encoded+=b' '*((-len(encoded))%4)
    data=bytes(binary)+b'\0'*((-len(binary))%4)
    path.write_bytes(struct.pack('<4sII',b'glTF',2,12+8+len(encoded)+8+len(data))+struct.pack('<II',len(encoded),0x4E4F534A)+encoded+struct.pack('<II',len(data),0x004E4942)+data)


destination=ROOT/os.environ.get('YYC_AVATAR_VRM','public/vrm/YYC_InfoDay.vrm')
write_glb(destination)
write_glb(OUT/'YYC_InfoDay.glb')
write_glb(OUT/'YYC_InfoDay_base.glb')
(OUT/'source-license.json').write_text(json.dumps({'source':str(source.relative_to(ROOT)),'originalMeta':json.loads(raw[20:20+json_length])['extensions']['VRM']['meta'],'note':'Original face, hair, skeleton, skin, expressions and shoe geometry retained. New weighted sports uniform meshes.'},ensure_ascii=False,indent=2))
print(destination)
print('Meshes:',len(doc['meshes']),'Humanoid bones:',len(vrm['humanoid']['humanBones']),'Expressions:',len(vrm['blendShapeMaster']['blendShapeGroups']))
