"""Build true armholes and independent capped sleeves, with ordinary VRM skinning.
Avoid union-remeshing lowered sleeves into the torso: that creates underarm webs.
Run in background Blender; only exports shirt geometry into the staging folder.
"""
import bpy,bmesh,math,json,struct,os,sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools/avatar'))
from cloth_profiles import ClothProfile,TORSO_RINGS
OUT=ROOT/os.environ.get('YYC_AVATAR_OUT','working/articulated-shirt-fit');OUT.mkdir(parents=True,exist_ok=True)
source=ROOT/'working/gesture-cloth-baseline/YYC_InfoDay.vrm'
raw=source.read_bytes();n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);bone_names=[doc['nodes'][i]['name']for i in doc['skins'][1]['joints']]
for obj in list(bpy.data.objects):bpy.data.objects.remove(obj,do_unlink=True)
bpy.ops.import_scene.gltf(filepath=str(source))
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
for bone in rig.pose.bones:bone.rotation_mode='QUATERNION';bone.rotation_quaternion=(1,0,0,0)
bpy.context.view_layer.update()
materials=[bpy.data.materials[n]for n in ['YYC_Sports_Red','YYC_Sleeve_Red']]
def smooth(x):
 x=max(0.,min(1.,x));return x*x*(3-2*x)
def warp_y(y):return y*.97 if y<1.04 else y-.0312
def loft(name,rings,point,cols=128):
 dense=ClothProfile(rings).dense(.0025);p=[point(r,2*math.pi*j/cols)for r in dense for j in range(cols)];f=[]
 for row in range(len(dense)-1):
  for j in range(cols):
   a=row*cols+j;b=row*cols+(j+1)%cols;f.append((a,b,b+cols,a+cols))
 f.extend([tuple(reversed(range(cols))),tuple((len(dense)-1)*cols+j for j in range(cols))])
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(p,[],f);mesh.update();obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj);return obj
roots={}
for side in ['L','R']:
 start=rig.matrix_world@rig.pose.bones['J_Bip_'+side+'_UpperArm'].head;end=rig.matrix_world@rig.pose.bones['J_Bip_'+side+'_LowerArm'].head
 roots[side]=(start,(end-start).normalized())
def torso(r,a):
 y,rx,rz=r;x=rx*math.cos(a);z=rz*math.sin(a);fold=.0032*math.exp(-((y-1.09)/.085)**2)*math.sin(a*7+(y-1)*35)
 fold+=.0014*math.exp(-((y-(1.21-.42*abs(x)))/.013)**2)*abs(math.sin(a))**5
 fold-=.0008*math.exp(-((y-(1.22-.42*abs(x)))/.010)**2)*abs(math.sin(a))**5
 return((x+fold*math.cos(a))*.98,-(z+fold*math.sin(a)),warp_y(y))
body=loft('YYC_Articulated_Torso',TORSO_RINGS,torso)
bpy.context.view_layer.objects.active=body
for side,(start,direction)in roots.items():
 bpy.ops.mesh.primitive_uv_sphere_add(segments=64,ring_count=32,radius=.0585,location=start);cutter=bpy.context.object;cutter.name='Temporary_armhole_'+side
 bpy.context.view_layer.objects.active=body;modifier=body.modifiers.new('True armhole '+side,'BOOLEAN');modifier.operation='DIFFERENCE';modifier.solver='EXACT';modifier.object=cutter;bpy.ops.object.modifier_apply(modifier=modifier.name);bpy.data.objects.remove(cutter,do_unlink=True)
bm=bmesh.new();bm.from_mesh(body.data)
for sign in [-1,1]:bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.000001,plane_co=(0,0,1.394),plane_no=(-sign*.711,0,1),clear_inner=False,clear_outer=False)
remove=[]
for face in bm.faces:
 c=face.calc_center_median();aperture=(c.x/.064)**2+(c.y/.055)**2
 cavity=any((c-center).length<.0587 and face.normal.dot(c-center)<0 for center,direction in roots.values())
 if cavity or(c.z>1.395 and aperture<1.10 and face.normal.z>.35)or(c.y>.036 and abs(c.x)<.050 and c.z>1.394+.711*abs(c.x)+.000001)or(c.z<.934 and face.normal.z<-.5):remove.append(face)
bmesh.ops.delete(bm,geom=remove,context='FACES');bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(body.data);bm.free()
objects=[(body,None)]
# A spherical sleeve head stays over its shoulder opening through rotation.
# The cuff ends above the elbow, including when the forearm is fully flexed.
r=.061
sleeve_rings=[(-.0605,.0078,.0078),(-.058,.0188,.0188),(-.052,.0319,.0319),(-.044,.0422,.0422),(-.032,.0520,.0520),(-.018,.0583,.0583),(0,.061,.061),(.025,.060,.058),(.070,.058,.054),(.120,.056,.052),(.154,.055,.051),(.160,.0553,.0512),(.165,.0556,.0514),(.170,.0557,.0515)]
for side,(start,direction)in roots.items():
 depth=Vector((0,1,0));across=direction.cross(depth).normalized()
 obj=loft('YYC_Articulated_Sleeve_'+side,sleeve_rings,lambda row,a:start+direction*row[0]+across*(row[1]*math.cos(a))+depth*(row[2]*math.sin(a)))
 bm=bmesh.new();bm.from_mesh(obj.data);end_faces=[f for f in bm.faces if (f.calc_center_median()-start).dot(direction)>.169 and len(f.verts)>10];bmesh.ops.delete(bm,geom=end_faces,context='FACES');bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free();objects.append((obj,side))
positions=[];normals=[];uv=[];joints=[];weights=[];primitives={m.name:[]for m in materials}
for obj,side in objects:
 bpy.context.view_layer.objects.active=obj
 modifier=obj.modifiers.new('Smooth PC cloth topology','SUBSURF');modifier.levels=1;modifier.render_levels=1;bpy.ops.object.modifier_apply(modifier=modifier.name)
 for polygon in obj.data.polygons:polygon.use_smooth=True
 obj.data.update();obj.data.calc_loop_triangles();offset=len(positions)
 for vertex in obj.data.vertices:
  p=obj.matrix_world@vertex.co;n=(obj.matrix_world.to_3x3().inverted().transposed()@vertex.normal).normalized()
  if side:
   influence={bone_names.index('J_Bip_'+side+'_UpperArm'):1.}
  else:
   chest=max(0,min(1,(p.z-1.08)/.22));hip=max(0,min(1,(1.06-p.z)/.10));near_side='R'if p.x>0 else'L';center=roots[near_side][0];clavicle=smooth((.105-(p-center).length)/.045);shoulder='J_Bip_'+near_side+'_Shoulder'
   influence={bone_names.index('J_Bip_C_Chest'):(1-clavicle)*chest,bone_names.index('J_Bip_C_Spine'):(1-clavicle)*(1-chest)*(1-hip),bone_names.index('J_Bip_C_Hips'):(1-clavicle)*(1-chest)*hip}
   if shoulder in bone_names:influence[bone_names.index(shoulder)]=clavicle
   else:influence[bone_names.index('J_Bip_C_Chest')]+=clavicle
   # Align shading at the small overlapping shoulder-cap seam.
   distance=(p-center).length
   if distance<.071:n=n.lerp((p-center).normalized(),.8*smooth((.071-distance)/.014)).normalized()
  items=sorted([(j,w)for j,w in influence.items()if w>0],key=lambda x:x[1],reverse=True)[:4];total=sum(w for j,w in items);indices=[j for j,w in items];values=[w/total for j,w in items]
  indices+=(4-len(indices))*[0];values+=(4-len(values))*[0.]
  positions.append([p.x,p.z,-p.y]);normals.append([n.x,n.z,-n.y]);uv.append([p.x/.70+.5,1-max(0,min(1,(p.z-.93)/.52))]);joints.append(indices);weights.append(values)
 material=materials[1 if side else 0].name
 for triangle in obj.data.loop_triangles:primitives[material].extend(offset+i for i in triangle.vertices)
geometry={'name':'YYC_Uniform_Shirt','positions':positions,'normals':normals,'uv':uv,'joints':joints,'weights':weights,'primitives':primitives,'replaces':['YYC_Uniform_Shirt','YYC_Polo','YYC_L_ShortSleeve','YYC_R_ShortSleeve']}
(OUT/'uniform-geometry.json').write_text(json.dumps([geometry],separators=(',',':')))
print('ARTICULATED_SHIRT',len(positions),'vertices',sum(map(len,primitives.values()))//3,'triangles')
