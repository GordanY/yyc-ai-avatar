"""Original layered short-hair geometry and tailored collar for the V3 review.
Executed in build_school_avatar.py's namespace, before the common body warp.
"""
def detail_mesh(name,positions,triangles,weight_function,mi):
    normals=[[0.,0.,0.]for _ in positions]
    for tri in triangles:
        a,b,c=[positions[k]for k in tri]
        u=[b[k]-a[k]for k in range(3)];v=[c[k]-a[k]for k in range(3)]
        normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
        for vi in tri:
            for k in range(3):normals[vi][k]+=normal[k]
    normals=[tuple(c/max(1e-12,math.sqrt(sum(x*x for x in n)))for c in n)for n in normals]
    weights=[weight_function(*p)for p in positions]
    attrs={'POSITION':accessor(positions,'VEC3'),'NORMAL':accessor(normals,'VEC3'),
           'JOINTS_0':accessor([w[0]for w in weights],'VEC4',5123),'WEIGHTS_0':accessor([w[1]for w in weights],'VEC4')}
    mesh=len(doc['meshes']);doc['meshes'].append({'name':name,'primitives':[{'attributes':attrs,'indices':accessor([i for tri in triangles for i in tri],'SCALAR',5125,34963),'material':mi}]})
    node=len(doc['nodes']);doc['nodes'].append({'name':name,'mesh':mesh,'skin':1})
    doc['scenes'][doc.get('scene',0)]['nodes'].append(node)

# Retain and reshape the original layered hair, keeping its UVs and fine strands.
for node in doc['nodes']:
    if node.get('name')=='YYC_Polo_CollarLeaf':
        node.pop('mesh',None);node.pop('skin',None)
hair_dark=material('YYC_Hair_InkBlack',(.010,.013,.019))
hair_mid=material('YYC_Hair_SoftBlack',(.016,.021,.029))
hair_light=material('YYC_Hair_CharcoalHighlight',(.023,.030,.041))
for mi in [hair_dark,hair_mid,hair_light]:
    prop=vrm['materialProperties'][mi]
    prop['floatProperties'].update({'_OutlineWidthMode':0,'_OutlineWidth':0,'_ShadeToony':.65})
    prop['keywordMap']={}
head_weight=lambda x,y,z:blend([('J_Bip_C_Head',1)])
seen_hair=set()
for pi,primitive in enumerate(doc['meshes'][2]['primitives']):
    ai=primitive['attributes']['POSITION']
    if ai in seen_hair:continue
    seen_hair.add(ai)
    vals=read_accessor(ai);a=doc['accessors'][ai];v=doc['bufferViews'][a['bufferView']]
    for vi,(x,y,z)in enumerate(vals):
        front=max(0,min(1,(-z-.035)/.065))*max(0,1-abs(x)/.14)
        if y<1.69:y=1.69+(y-1.69)*(.68-.13*front)
        crown=max(0,min(1,(y-1.665)/.08))
        x*=1.08+.035*crown
        y+=.013*crown
        z*=1.06
        struct.pack_into('<3f',binary,v.get('byteOffset',0)+a.get('byteOffset',0)+vi*v.get('byteStride',12),x,y,z)
# Adjust individual existing locks rather than adding floating crown spikes.
hair_positions=read_accessor(doc['meshes'][2]['primitives'][0]['attributes']['POSITION'])
hair_ai=doc['meshes'][2]['primitives'][0]['attributes']['POSITION']
hair_a=doc['accessors'][hair_ai];hair_view=doc['bufferViews'][hair_a['bufferView']]
done=set()
for pi,primitive in enumerate(doc['meshes'][2]['primitives']):
    indices=set(i[0]for i in read_accessor(primitive['indices']))
    top=max(hair_positions[i][1]for i in indices);bottom=min(hair_positions[i][1]for i in indices)
    for vi in indices-done:
        x,y,z=hair_positions[vi]
        t=max(0,min(1,(top-y)/max(.02,top-bottom)))
        x+=.005*math.sin(pi*2.399)*t*t
        y+=.007*math.sin(pi*1.61)*t*t
        struct.pack_into('<3f',binary,hair_view.get('byteOffset',0)+hair_a.get('byteOffset',0)+vi*hair_view.get('byteStride',12),x,y,z)
    done.update(indices)
def lock(name,path,width,mi):
    # A curved, ridged leaf volume: broad root, narrowing broken silhouette.
    pos=[];tris=[];steps=18;cross=8
    for i in range(steps+1):
        t=i/steps
        p=[(1-t)**3*path[0][k]+3*(1-t)**2*t*path[1][k]+3*(1-t)*t*t*path[2][k]+t**3*path[3][k]for k in range(3)]
        tangent=[3*(1-t)**2*(path[1][k]-path[0][k])+6*(1-t)*t*(path[2][k]-path[1][k])+3*t*t*(path[3][k]-path[2][k])for k in range(3)]
        radial=[p[0],(p[1]-1.65)*.7,p[2]-.006]
        normal_len=math.sqrt(sum(v*v for v in radial));normal=[v/max(normal_len,1e-9)for v in radial]
        side=[tangent[1]*normal[2]-tangent[2]*normal[1],tangent[2]*normal[0]-tangent[0]*normal[2],tangent[0]*normal[1]-tangent[1]*normal[0]]
        side_len=math.sqrt(sum(v*v for v in side));side=[v/max(side_len,1e-9)for v in side]
        w=width*(.65+.45*math.sin(math.pi*t))*(1-t**1.5)+.00025
        depth=.004*(1-t)+.0003
        for j in range(cross):
            a=2*math.pi*j/cross
            pos.append(tuple(p[k]+side[k]*w*math.cos(a)+normal[k]*depth*math.sin(a)for k in range(3)))
    for i in range(steps):
        for j in range(cross):
            a=i*cross+j;b=i*cross+(j+1)%cross;c=a+cross;d=b+cross
            tris.extend([(a,b,c),(b,d,c)])
    detail_mesh(name,pos,tris,head_weight,mi)

# Short overlapping crown locks follow the approved tousled silhouette.
# Their roots sit inside the existing hair shell; tips add only 8-16 mm.
for i,(sign,zoff)in enumerate([(-1,-.015),(1,-.012),(-1,.025),(1,.030),(-1,.060),(1,.058)]):
    x=sign*(.018+.011*(i//2));y=1.759-.006*(i//2)
    lock('YYC_Crown_Lock_'+str(i),[(x,y,zoff),(x+sign*.010,y+.015,zoff-.008),(x+sign*.030,y+.022,zoff-.011),(x+sign*.040,y+.010,zoff-.014)],.010 if i<2 else .012,hair_mid if i%2 else hair_dark)

# One continuous folded polo collar. The open front ends form the two
# outward points and meet the V neckline, like the agreed 2D design.
for node in doc['nodes']:
    if node.get('name')=='YYC_Black_Collar':node.pop('mesh',None);node.pop('skin',None)
p=[];tri=[];segments=160;cross=24;cols=cross+1
for i in range(segments+1):
    a=-math.pi/4+(3*math.pi/2)*i/segments
    ca,sa=math.cos(a),math.sin(a);front=max(0,-sa)/math.sqrt(.5);flare=front**3
    inner=(.059*ca,1.492-.012*front,.049*sa)
    outer=((.084+.0335*flare)*ca,1.474-.036*flare,(.060+.024*flare)*sa)
    # Lower collar edge follows the real shirt surface, not the former
    # vertically compressed front-neck loft.
    if sa<0:
        _,rx,rz=TORSO_PROFILE.at(outer[1])
        if abs(outer[0])<rx:
            depth=rz*math.sqrt(max(0,1-(outer[0]/rx)**2))+.0015
            outer=(outer[0],outer[1],min(outer[2],-depth))
    side=1 if ca>=0 else -1
    for j in range(cols):
        t=j/cross;fold=1-abs(2*t-1)
        x=inner[0]*(1-t)+outer[0]*t-side*.028*flare*fold
        y=inner[1]*(1-t)+outer[1]*t-.008*flare*fold
        z=inner[2]*(1-t)+outer[2]*t-.001*flare*fold
        # Conform the folded fabric to the unclamped clavicle surface. Its
        # front silhouette stays fixed; clearance prevents red cloth clipping
        # through the collar after removing the former neck compression.
        if y<=1.48:
            _,rx,rz=TORSO_PROFILE.at(y)
            if abs(z)>=.012 and abs(x)<rx:
                surface=rz*math.sqrt(max(0,1-(x/rx)**2))+.0016
                z=min(z,-surface)if z<0 else max(z,surface)
            elif abs(z)<rz:
                surface=rx*math.sqrt(max(0,1-(z/rz)**2))+.0016
                x=max(x,surface)if x>=0 else min(x,-surface)
        radial=math.hypot(x,z)
        if radial:x+=.001*x/radial;z+=.001*z/radial
        p.append((x,y,z))
for i in range(segments):
    for j in range(cross):
        a=i*cols+j;b=a+1;c=a+cols;tri.extend([(a,c,b),(b,c,c+1)])
count=len(p);front_surface=list(p)
p += [(x*.994,y-.0007,z*.994)for x,y,z in front_surface]
tri += [(a+count,c+count,b+count)for a,b,c in list(tri)]
boundary=list(range(cols))+[i*cols+cross for i in range(1,segments+1)]+[segments*cols+j for j in range(cross-1,-1,-1)]+[i*cols for i in range(segments-1,0,-1)]
for a,b in zip(boundary,boundary[1:]+boundary[:1]):tri.extend([(a,b,a+count),(b,b+count,a+count)])
detail_mesh('YYC_Folded_Polo_Collar',p,tri,torso_weights,black)

# Raised crossing shoelaces make the white footwear read as trainers.
lace=material('YYC_Sneaker_Laces',(.58,.61,.65))
for side,sign in [('L',-1),('R',1)]:
    foot_weight=lambda x,y,z,side=side:blend([('J_Bip_'+side+'_Foot',1)])
    for j,(z,y)in enumerate([(-.034,.106),(-.052,.095),(-.070,.087),(-.088,.079)]):
        for diagonal in [-1,1]:
            p=[];tris=[];n=12;cols=6
            for i in range(n+1):
                t=i/n;x=sign*.054+(t-.5)*.050
                zz=z+diagonal*(t-.5)*.011
                yy=y+.003*math.sin(math.pi*t)
                for k in range(cols):
                    a=2*math.pi*k/cols
                    p.append((x,yy+.0014*math.cos(a),zz+.0014*math.sin(a)))
            for i in range(n):
                for k in range(cols):
                    a=i*cols+k;b=i*cols+(k+1)%cols;c=a+cols;tris.extend([(a,b,c),(b,c+1 if k<cols-1 else i*cols+cols,c)])
            detail_mesh('YYC_Lace_%s_%s_%s'%(side,j,diagonal),p,tris,foot_weight,lace)
