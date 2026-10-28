"""Fit a continuous shirt in relaxed pose, then inverse-skin to T pose."""
import json, struct, math
import bmesh
import sys
if str(ROOT/"tools/avatar")not in sys.path:sys.path.insert(0,str(ROOT/"tools/avatar"))
from cloth_profiles import ClothProfile,TORSO_RINGS,SLEEVE_RINGS,TORSO_PROFILE
from mathutils.kdtree import KDTree
from mathutils import Vector, Matrix, Quaternion

raw=(ROOT/'public/vrm/AvatarSample_D.vrm').read_bytes();length=struct.unpack_from('<I',raw,12)[0]
source_doc=json.loads(raw[20:20+length]);blob=raw[28+length:]
def read(i):
    a=source_doc['accessors'][i];v=source_doc['bufferViews'][a['bufferView']]
    n={'SCALAR':1,'VEC3':3,'VEC4':4}[a['type']];fmt={5126:'f',5123:'H',5121:'B'}[a['componentType']]
    stride=v.get('byteStride',struct.calcsize('<'+fmt*n));start=v.get('byteOffset',0)+a.get('byteOffset',0)
    return [struct.unpack_from('<'+fmt*n,blob,start+k*stride)for k in range(a['count'])]
def stance_shift(y):
    # Move the rig and footwear with the new trouser stance. The old constant
    # leg spread amplified the knee bow and left the feet close together.
    knots=[(0.,.046),(.127,.046),(.583,.026),(.90,-.004),(.974,-.004),(1.02,0.)]
    if y>=1.02:return 0.
    y=max(0.,y)
    a,b=next((a,b)for a,b in zip(knots,knots[1:])if a[0]<=y<=b[0])
    t=(y-a[0])/(b[0]-a[0]);return a[1]+(b[1]-a[1])*t
def warp_source(p,cloth=False):
    x,y,z=p;new_y=y*.97 if y<1.04 else y-.0312;head=max(0.,min(1.,(y-1.49)/.08));size=1+.015*head
    spread=0. if cloth else stance_shift(y)*(1. if y<.85 else min(1,abs(x)/.055))*(1 if x>0 else -1 if x<0 else 0)
    return [x*(.98+.02*head)+spread,1.49+(new_y-1.49)*size if head else new_y,z*size]
attributes=source_doc['meshes'][1]['primitives'][0]['attributes']
source_positions=read(attributes['POSITION']);source_joints=read(attributes['JOINTS_0']);source_weights=read(attributes['WEIGHTS_0'])
bone_names=[source_doc['nodes'][i]['name']for i in source_doc['skins'][1]['joints']]
materials=[next(m for m in bpy.data.materials if m.name==n)for n in ['YYC_Sports_Red','YYC_Sports_White','YYC_Track_DeepGreen','YYC_Sleeve_Red']]
def pose_arms(enabled):
    for side,angle in [('L',-75),('R',75)]:
        bone=rig.pose.bones['J_Bip_'+side+'_UpperArm'];basis=bone.bone.matrix_local.to_quaternion();bone.rotation_mode='QUATERNION'
        bone.rotation_quaternion=basis.inverted()@Quaternion((0,1,0),math.radians(angle))@basis if enabled else Quaternion()
    bpy.context.view_layer.update()
def skin_transforms():
    return [rig.matrix_world@rig.pose.bones[n].matrix@rig.data.bones[n].matrix_local.inverted()@rig.matrix_world.inverted()for n in bone_names]
def mix_matrix(indices,weights,transforms):
    result=Matrix.Identity(4)*0
    for i,w in zip(indices,weights):result+=transforms[i]*w
    return result
def loft(name,rings,point):
    dense=ClothProfile(rings).dense(.005);cols=96
    pos=[point(r,2*math.pi*j/cols)for r in dense for j in range(cols)];faces=[]
    for i in range(len(dense)-1):
        for j in range(cols):
            a=i*cols+j;b=i*cols+(j+1)%cols;faces.append((a,b,b+cols,a+cols))
    faces.extend([tuple(reversed(range(cols))),tuple((len(dense)-1)*cols+j for j in range(cols))])
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(pos,[],faces);mesh.update();obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj)
    for m in materials:mesh.materials.append(m)
    return obj
def relaxed_shirt():
    for o in list(bpy.context.scene.objects):
        if o.name in ['YYC_Polo','YYC_L_ShortSleeve','YYC_R_ShortSleeve']:bpy.data.objects.remove(o,do_unlink=True)
    rings=TORSO_RINGS
    def torso(r,a):
        y,rx,rz=r;x=rx*math.cos(a);z=rz*math.sin(a)
        fold=.0032*math.exp(-((y-1.09)/.085)**2)*math.sin(a*7+(y-1)*35);
        fold+=.0014*math.exp(-((y-(1.21-.42*abs(x)))/.013)**2)*abs(math.sin(a))**5
        fold-=.0008*math.exp(-((y-(1.22-.42*abs(x)))/.010)**2)*abs(math.sin(a))**5
        x+=fold*math.cos(a);z+=fold*math.sin(a)
        x,y,z=warp_source((x,y,z),cloth=True);return(x,-z,y)
    pieces=[loft('YYC_Relaxed_Torso',rings,torso)]
    for side in ['L','R']:
        start=rig.matrix_world@rig.pose.bones['J_Bip_'+side+'_UpperArm'].head;end=rig.matrix_world@rig.pose.bones['J_Bip_'+side+'_LowerArm'].head
        direction=(end-start).normalized();depth=Vector((0,1,0));across=direction.cross(depth).normalized()
        rings=SLEEVE_RINGS
        def sleeve(r,a,start=start,direction=direction,depth=depth,across=across):return start+direction*r[0]+across*(r[1]*math.cos(a))+depth*(r[2]*math.sin(a))
        pieces.append(loft('YYC_Relaxed_Sleeve_'+side,rings,sleeve))
    return pieces

all_geometry=[]
for name,object_names in [('YYC_Uniform_Shirt',['YYC_Polo','YYC_L_ShortSleeve','YYC_R_ShortSleeve']),('YYC_Uniform_Trousers',['YYC_L_TrackPants','YYC_R_TrackPants','YYC_TrackPants_Pelvis'])]:
    is_shirt=name.endswith('Shirt');pose_arms(is_shirt);transforms=skin_transforms()
    arm_axes={}
    if is_shirt:
        for side in ['L','R']:
            start=rig.matrix_world@rig.pose.bones['J_Bip_'+side+'_UpperArm'].head
            end=rig.matrix_world@rig.pose.bones['J_Bip_'+side+'_LowerArm'].head
            arm_axes[side]=(start,(end-start).normalized())
    objects=relaxed_shirt()if is_shirt else[o for o in bpy.context.scene.objects if o.name in object_names]
    tree=KDTree(len(source_positions))
    for i,p in enumerate(source_positions):
        x,y,z=warp_source(p);v=Vector((x,-z,y))
        if is_shirt:v=mix_matrix(source_joints[i],source_weights[i],transforms)@v
        tree.insert(v,i)
    tree.balance();bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
        for modifier in list(obj.modifiers):obj.modifiers.remove(modifier)
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();obj=bpy.context.object;obj.name=name
    bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00005)
    bmesh.ops.holes_fill(bm,edges=[e for e in bm.edges if e.is_boundary],sides=0);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
    modifier=obj.modifiers.new('Continuous tailored fabric','REMESH');modifier.mode='VOXEL';modifier.voxel_size=.0020;modifier.use_smooth_shade=True;bpy.ops.object.modifier_apply(modifier=modifier.name)
    modifier=obj.modifiers.new('Soft cloth surface','SMOOTH');modifier.factor=.55;modifier.iterations=5;bpy.ops.object.modifier_apply(modifier=modifier.name)
    if is_shirt:
        group=obj.vertex_groups.new(name='Shoulder surface relaxation')
        for v in obj.data.vertices:
            p=obj.matrix_world@v.co
            vertical=max(0,min(1,(p.z-1.25)/.06))*max(0,min(1,(1.45-p.z)/.05))
            lateral=max(0,min(1,(abs(p.x)-.10)/.045))
            weight=vertical*lateral
            if weight:group.add([v.index],weight,'REPLACE')
        modifier=obj.modifiers.new('Smooth armhole curvature','SMOOTH');modifier.factor=.35;modifier.iterations=10;modifier.vertex_group=group.name;bpy.ops.object.modifier_apply(modifier=modifier.name)
    modifier=obj.modifiers.new('PC topology','DECIMATE');modifier.ratio=.65;bpy.ops.object.modifier_apply(modifier=modifier.name)
    if is_shirt:
        # Open the neckline after the closed-volume union: remove the temporary
        # neck cap, then cut a shallow V like the approved polo design.
        bm=bmesh.new();bm.from_mesh(obj.data)
        # Intersect the mesh with both V planes before removing the opening,
        # so its border follows real edges instead of a triangle-centre cut.
        for sign in [-1,1]:
            bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
                dist=.000001,plane_co=(0,0,1.394),plane_no=(-sign*.711,0,1),
                clear_inner=False,clear_outer=False)
        # Remove the hidden flat end plates from the sleeves. Keep the narrow
        # turned-over cuff rim, not a solid red disk intersecting the arm.
        cuff_faces=[]
        for face in bm.faces:
            c=face.calc_center_median()
            for start,direction in arm_axes.values():
                along=(c-start).dot(direction);radial=(c-start-direction*along).length
                if .185<along<.205 and c.z>1.12 and radial<.047 and face.normal.dot(direction)>.55:
                    cuff_faces.append(face);break
        if cuff_faces:bmesh.ops.delete(bm,geom=cuff_faces,context='FACES')
        remove=[]
        for face in bm.faces:
            c=face.calc_center_median()
            aperture=(c.x/.064)**2+(c.y/.055)**2
            cap=c.z>1.395 and aperture<1.10 and face.normal.z>.35
            notch=c.y>.036 and abs(c.x)<.050 and c.z>1.394+.711*abs(c.x)+.000001
            if cap or notch:remove.append(face)
        bmesh.ops.delete(bm,geom=remove,context='FACES')
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free();obj.data.update()
    fit_normals=[v.normal.copy()for v in obj.data.vertices]
    obj.vertex_groups.clear();groups=[obj.vertex_groups.new(name=n)for n in bone_names];positions=[];fit_positions=[];joints=[];weights=[]
    for vertex in obj.data.vertices:
        p=obj.matrix_world@vertex.co;fit_positions.append([p.x,p.z,-p.y]);influences={}
        for _,i,distance in tree.find_n(p,4):
            factor=1/max(distance,.0001)**3
            for ji,w in zip(source_joints[i],source_weights[i]):
                if w>0:influences[ji]=influences.get(ji,0)+w*factor
        if is_shirt:
            side='L' if p.x<0 else 'R'
            start,direction=arm_axes[side];along=(p-start).dot(direction);radial=(p-(start+direction*along)).length
            height=max(0,min(1,(p.z-1.08)/.06));height=height*height*(3-2*height)
            arm=max(0,min(1,(.112-radial)/.045))*max(0,min(1,(along+.025)/.075))*height
            # The torso and sleeve are close at the armpit. Proximity to the
            # arm axis alone incorrectly drags side panels with the upper arm.
            raw_height=p.z/.97 if p.z<1.0088 else p.z+.0312
            radius=TORSO_PROFILE.at(raw_height)[1]*.98
            gate=max(0,min(1,(abs(p.x)-radius+.002)/.030));gate=gate*gate*(3-2*gate)
            shoulder=max(0,min(1,(p.z-1.34)/.065));shoulder=shoulder*shoulder*(3-2*shoulder)
            arm*=gate*(1-shoulder)+shoulder
            chest=max(0,min(1,(p.z-1.08)/.22));hip=max(0,min(1,(1.06-p.z)/.10))
            influences={bone_names.index('J_Bip_'+side+'_UpperArm'):arm,
                        bone_names.index('J_Bip_C_Chest'):(1-arm)*chest,
                        bone_names.index('J_Bip_C_Spine'):(1-arm)*(1-chest)*(1-hip),
                        bone_names.index('J_Bip_C_Hips'):(1-arm)*(1-chest)*hip}
        else:
            # Nearest-body transfer crosses the narrow gap between the legs.
            # Use a smooth, side-local leg chain instead of unrelated neighbours.
            side='L' if p.x<0 else 'R'
            def smoothstep(a,b,value):
                t=max(0.,min(1.,(value-a)/(b-a)))
                return t*t*(3-2*t)
            hip=smoothstep(.86,1.025,p.z)
            thigh=smoothstep(.50,.64,p.z)
            influences={bone_names.index('J_Bip_C_Hips'):hip,
                        bone_names.index('J_Bip_'+side+'_UpperLeg'):(1-hip)*thigh,
                        bone_names.index('J_Bip_'+side+'_LowerLeg'):(1-hip)*(1-thigh)}
        influences=sorted(((i,w)for i,w in influences.items()if w>0),key=lambda x:x[1],reverse=True)[:4];total=sum(w for _,w in influences);ji=[i for i,w in influences];ws=[w/total for i,w in influences]
        for i,w in zip(ji,ws):groups[i].add([vertex.index],w,'REPLACE')
        ji=(ji+[0]*4)[:4];ws=(ws+[0.]*4)[:4];joints.append(ji);weights.append(ws)
        if is_shirt:p=mix_matrix(ji,ws,transforms).inverted()@p;vertex.co=obj.matrix_world.inverted()@p
        positions.append([p.x,p.z,-p.y])
    pose_arms(False);obj.data.materials.clear()
    for m in materials:obj.data.materials.append(m)
    for poly in obj.data.polygons:
        poly.use_smooth=True;poly.material_index=0 if is_shirt else 2
        if is_shirt:
            arm=sum(sum(w for ji,w in zip(joints[vi],weights[vi])if bone_names[ji].endswith('_UpperArm'))for vi in poly.vertices)/len(poly.vertices)
            if arm>.55:poly.material_index=3
        # Sleeve fabric shares the exact red/fold palette, with no white panels.
        # Classify by corrected arm weights so torso and hem cannot acquire it.
    if obj.data.has_custom_normals:obj.data.normals_split_custom_set([(0.,0.,0.)]*len(obj.data.loops))
    obj.data.update();obj.data.calc_loop_triangles();uv=obj.data.uv_layers.new(name='Anime_Fabric_UV');obj.data.uv_layers.active=uv;uv.active_render=True
    for poly in obj.data.polygons:
        coords=[]
        for li in poly.loop_indices:
            vi=obj.data.loops[li].vertex_index;x,y,z=fit_positions[vi]
            if is_shirt:
                u=x/.70+.5;v=max(0,min(1,(y-.93)/.52))
            else:
                raw_y=y/.97;center=(.080+.016*max(0,min(1,(.94-raw_y)/.835)))*.98*(1 if x>0 else -1)
                u=math.atan2(z-.007,x-center)/(2*math.pi)+.5
                if x<0:u=(u+.5)%1
                v=(y-.085)/.90
            coords.append([li,u,v])
        if not is_shirt and max(c[1]for c in coords)-min(c[1]for c in coords)>.5:
            for c in coords:
                if c[1]<.5:c[1]+=1
        for li,u,v in coords:uv.data[li].uv=(u,1-v)
    if is_shirt:
        # Preserve smooth fitted-pose normals across the inverse-skin weight ramp.
        # Recomputing rest-mesh normals here produces a false crease on sleeves.
        rest_normals=[]
        for vi,n in enumerate(fit_normals):
            transform=mix_matrix(joints[vi],weights[vi],transforms).to_3x3()
            rest_normals.append((transform.inverted()@n).normalized())
    final_pos=[];final_norm=[];final_uv=[];final_joint=[];final_weight=[];primitives={}
    for triangle in obj.data.loop_triangles:
        material=obj.data.materials[triangle.material_index].name
        for vi,li in zip(triangle.vertices,triangle.loops):
            primitives.setdefault(material,[]).append(len(final_pos));final_pos.append(positions[vi]);final_uv.append(list(uv.data[li].uv));final_joint.append(joints[vi]);final_weight.append(weights[vi])
            n=(obj.matrix_world.to_3x3().inverted().transposed()@(rest_normals[vi]if is_shirt else obj.data.vertices[vi].normal)).normalized();final_norm.append([n.x,n.z,-n.y])
    all_geometry.append({'name':name,'positions':final_pos,'normals':final_norm,'uv':final_uv,'joints':final_joint,'weights':final_weight,'primitives':primitives,'replaces':object_names})
    modifier=obj.modifiers.new('Humanoid skin','ARMATURE');modifier.object=rig;obj.parent=rig
(OUT/'uniform-geometry.json').write_text(json.dumps(all_geometry,separators=(',',':')))
