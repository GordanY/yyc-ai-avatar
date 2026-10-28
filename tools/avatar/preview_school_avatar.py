"""Blender 5.x: editable rig source and a full-body preview render.
The exported VRM remains authoritative for VRM-specific metadata.
"""
import bpy
import math
import os
from mathutils import Vector, Quaternion
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/os.environ.get('YYC_AVATAR_OUT','models/yyc-info-day')
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj,do_unlink=True)
for blocks in [bpy.data.meshes,bpy.data.armatures,bpy.data.materials,bpy.data.images]:
    for block in list(blocks):
        if block.users==0:blocks.remove(block)
base_file=OUT/'YYC_InfoDay_base.glb'
bpy.ops.import_scene.gltf(filepath=str(base_file if base_file.exists()else OUT/'YYC_InfoDay.glb'))
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
rig.hide_set(False)
print('RIG',rig.name,'BONES',len(rig.data.bones))
smooth_path=ROOT/'tools/avatar/smooth_uniform.py'
exec(compile(smooth_path.read_text(),str(smooth_path),'exec'),globals())
for side,angle in [('L',-75),('R',75)]:
    bone=rig.pose.bones.get('J_Bip_'+side+'_UpperArm')
    if bone:
        basis=bone.bone.matrix_local.to_quaternion()
        bone.rotation_mode='QUATERNION'
        bone.rotation_quaternion=basis.inverted() @ Quaternion((0,1,0),math.radians(angle)) @ basis
for side,sign in [('L',-1),('R',1)]:
    bone=rig.pose.bones.get('J_Bip_'+side+'_LowerArm')
    if bone:
        basis=bone.bone.matrix_local.to_quaternion();bone.rotation_mode='QUATERNION'
        bone.rotation_quaternion=basis.inverted()@Quaternion((1,0,0),math.radians(sign*18))@basis
    for finger in ['Index','Middle','Ring','Little']:
        for segment,angle in [(1,12),(2,16),(3,10)]:
            bone=rig.pose.bones.get('J_Bip_'+side+'_'+finger+str(segment))
            if bone:
                basis=bone.bone.matrix_local.to_quaternion();bone.rotation_mode='QUATERNION'
                bone.rotation_quaternion=basis.inverted()@Quaternion((0,1,0),math.radians(sign*angle))@basis
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=24
scene.cycles.device='CPU'
scene.render.resolution_x=900
scene.render.resolution_y=1100
scene.render.resolution_percentage=100
scene.world.color=(.65,.65,.65)
scene.view_settings.view_transform='Standard'
bpy.ops.object.camera_add(location=(0,3.5,1.05))
camera=bpy.context.object
camera.rotation_euler=(Vector((0,0,.93))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO'
camera.data.ortho_scale=2.05
scene.camera=camera
for loc,power,size in [((1,2,3),100,4),((-2,1,2),60,3),((0,-2,2),80,2)]:
    bpy.ops.object.light_add(type='AREA',location=loc)
    light=bpy.context.object
    light.data.energy=power
    light.data.shape='DISK'
    light.data.size=size
    light.rotation_euler=(Vector((0,0,1))-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.004))
floor=bpy.context.object
mat=bpy.data.materials.new('Preview_Floor')
mat.diffuse_color=(.84,.86,.89,1)
floor.data.materials.append(mat)
# Give the preserved shape keys their expression names in the editable source.
import json, struct
data=(OUT/'YYC_InfoDay.glb').read_bytes()
doc=json.loads(data[20:20+struct.unpack_from('<I',data,12)[0]])
face=next(o for o in scene.objects if o.type=='MESH' and o.data.shape_keys)
for group in doc['extensions']['VRM']['blendShapeMaster']['blendShapeGroups']:
    for binding in group.get('binds',[]):
        key=face.data.shape_keys.key_blocks.get('target_'+str(binding['index']))
        if key: key.name=group.get('presetName') or group['name']
# Source contains the real armature, weights, shape keys and embedded textures.
for image in bpy.data.images:
    if image.source=='FILE':
        try: image.pack()
        except RuntimeError: pass
for area in (bpy.context.screen.areas if bpy.context.screen else []):
    if area.width>1000 and area.type in {'CONSOLE','VIEW_3D'}:
        area.type='VIEW_3D'
        area.spaces.active.region_3d.view_perspective='CAMERA'
        area.spaces.active.region_3d.view_camera_zoom=0
        area.spaces.active.region_3d.view_camera_offset=(0,0)
        area.spaces.active.use_local_camera=False
        area.spaces.active.overlay.show_overlays=False
        area.spaces.active.shading.type='MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'YYC_InfoDay.blend'))
scene.render.filepath=str(OUT/'preview-front.png')
bpy.ops.render.render(write_still=True)
# Orthographic model views expose silhouette/geometry problems on every side.
for view,location in [('side',(3.5,0,.96)),('back',(0,-3.5,.96))]:
    camera.location=location
    camera.rotation_euler=(Vector((0,0,.91))-camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(OUT/('preview-'+view+'.png'))
    bpy.ops.render.render(write_still=True)
camera.location=(0,3.5,1.05)
camera.rotation_euler=(Vector((0,0,.93))-camera.location).to_track_quat('-Z','Y').to_euler()
saved_pose={n:rig.pose.bones[n].rotation_quaternion.copy()for n in ['J_Bip_R_UpperArm','J_Bip_R_LowerArm']}
for name,angle in [('J_Bip_R_UpperArm',60),('J_Bip_R_LowerArm',-115)]:
    bone=rig.pose.bones[name];basis=bone.bone.matrix_local.to_quaternion()
    bone.rotation_quaternion=basis.inverted()@Quaternion((0,1,0),math.radians(angle))@basis
scene.render.filepath=str(OUT/'preview-wave.png');bpy.ops.render.render(write_still=True)
for name,value in saved_pose.items():rig.pose.bones[name].rotation_quaternion=value
print('MORPHS',[(o.name,list(o.data.shape_keys.key_blocks.keys())[:8])for o in scene.objects if o.type=='MESH' and o.data.shape_keys])
# Separate real-mesh expression renders, rather than a generated illustration.
scene.render.resolution_x=512;scene.render.resolution_y=512
scene.cycles.samples=16
camera.location=(0,2.6,1.60)
camera.rotation_euler=(Vector((0,0,1.60))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.ortho_scale=.46
for label,key_name in [('neutral',None),('mouth','a'),('blink','blink')]:
    for key in face.data.shape_keys.key_blocks:
        if key.name!='Basis':key.value=0
    if key_name:
        key=face.data.shape_keys.key_blocks.get(key_name)
        if key is None:raise RuntimeError('Missing expression '+key_name)
        key.value=1
    scene.render.filepath=str(OUT/('preview-face-'+label+'.png'))
    bpy.ops.render.render(write_still=True)
# Restore the visible viewport to the full body and neutral expression.
for key in face.data.shape_keys.key_blocks:
    if key.name!='Basis':key.value=0
camera.location=(0,3.5,1.05)
camera.rotation_euler=(Vector((0,0,.93))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.ortho_scale=2.05
scene.render.resolution_x=900;scene.render.resolution_y=1100
