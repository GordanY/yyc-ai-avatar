"""Replace only the shirt in the existing editable scene; retain the whole rig,
materials, reference cameras, expressions, and model design. Background only."""
import bpy, re, math
from mathutils import Quaternion
from pathlib import Path
root=Path(__file__).resolve().parents[2]
out=root/'models/yyc-info-day'
bpy.ops.wm.open_mainfile(filepath=str(out/'YYC_InfoDay_v0.4.3.blend'))
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
old_shirts=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith('YYC_Uniform_Shirt')]
materials={m.name:m for m in bpy.data.materials}
existing=set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=str(out/'YYC_InfoDay.glb'))
added=set(bpy.data.objects)-existing
shirts=[o for o in added if o.type=='MESH' and o.name.startswith('YYC_Uniform_Shirt')]
assert shirts, 'No articulated shirt in GLB'
for old in old_shirts:bpy.data.objects.remove(old,do_unlink=True)
for obj in shirts:
    obj.name='YYC_Uniform_Shirt'
    obj.parent=rig
    for modifier in obj.modifiers:
        if modifier.type=='ARMATURE':modifier.object=rig;modifier.use_deform_preserve_volume=False
    for i,m in enumerate(obj.data.materials):
        name=re.sub(r'\.\d{3}$','',m.name)
        if name in materials:obj.data.materials[i]=materials[name]
for obj in added-set(shirts):bpy.data.objects.remove(obj,do_unlink=True)
# Match the running presenter's relaxed arms, forward elbows and graded curls.
# glTF Y-up axes become Blender (X, Z, -Y); convert before the bone rest basis.
def normalized_pose(name,x=0,y=0,z=0):
    bone=rig.pose.bones.get(name)
    if not bone:return
    q=Quaternion((1,0,0),math.radians(x))@Quaternion((0,0,1),math.radians(y))@Quaternion((0,-1,0),math.radians(z))
    basis=bone.bone.matrix_local.to_quaternion();bone.rotation_mode='QUATERNION';bone.rotation_quaternion=basis.inverted()@q@basis
for side,sign in [('L',1),('R',-1)]:
    normalized_pose('J_Bip_'+side+'_UpperArm',z=sign*76.7)
    normalized_pose('J_Bip_'+side+'_LowerArm',x=sign*8,y=-sign*14,z=sign*6)
    normalized_pose('J_Bip_'+side+'_Hand',y=sign*2,z=sign*2)
    for index,finger in enumerate(['Index','Middle','Ring','Little']):
        for segment,curl in enumerate([16+index*3,20+index*4,10+index*2],1):normalized_pose('J_Bip_'+side+'_'+finger+str(segment),z=sign*curl)
    for segment,curl in enumerate([5,12,8],1):normalized_pose('J_Bip_'+side+'_Thumb'+str(segment),y=sign*7,z=sign*curl)
bpy.context.view_layer.update()
for blocks in [bpy.data.meshes,bpy.data.armatures,bpy.data.materials,bpy.data.images]:
    for block in list(blocks):
        if block.users==0:blocks.remove(block)
for image in bpy.data.images:
    if image.source=='FILE':
        try:image.pack()
        except RuntimeError:pass
scene=bpy.context.scene
scene.render.resolution_x=900;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
scene.cycles.samples=16
bpy.ops.wm.save_as_mainfile(filepath=str(out/'YYC_InfoDay_v0.4.4.blend'))
scene.render.filepath=str(out/'preview-gesture-cloth-front.png')
bpy.ops.render.render(write_still=True)
print('UPDATED_SOURCE',out/'YYC_InfoDay_v0.4.4.blend','SHIRTS',[(o.name,len(o.data.vertices))for o in shirts])
