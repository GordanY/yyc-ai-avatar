"""Bake the separately downloaded CG-Moon rig into a local viewer intermediate.

blender --background --factory-startup --disable-autoexec <model-rig.blend>
  --python student/export-scholar.py -- output/scholar-review/scholar.glb
The GLB is an ignored build intermediate. Publish only its application pack.
"""
import bpy
import math
import sys
from pathlib import Path
from mathutils import Quaternion

out = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
out.parent.mkdir(parents=True, exist_ok=True)
source = Path(bpy.data.filepath).parent
rig = bpy.data.objects['rig']
mesh = bpy.data.objects['ElementClient-1cb515e8.obj']
for image in bpy.data.images:
    if image.name.endswith('.dds'):
        image.filepath = str(source / 'textures' / image.name)
        image.reload()
        # Load DDS pixels before changing the output format/path.
        pixels = image.pixels[:]
        image.file_format = 'PNG'
        image.filepath_raw = str(out.parent / 'scholar-texture.png')
        image.save()
for bone in rig.pose.bones:
    bone.rotation_mode = 'QUATERNION'
for side in ['l', 'r']:
    rig.pose.bones['c_hand_ik.' + side]['ik_fk_switch'] = 1.0
bpy.context.view_layer.update()

# Keep the source hierarchy: the glTF exporter bakes its evaluated constraints.
# Re-parent the mesh without changing its world transform for skin association.
world = mesh.matrix_world.copy()
mesh.parent = rig
mesh.matrix_world = world
rig.animation_data_clear()


def rotate(name, axis, degrees, compose=False):
    bone = rig.pose.bones[name]
    rest = bone.bone.matrix_local.to_quaternion()
    offset = rest.inverted() @ Quaternion(axis, math.radians(degrees)) @ rest
    bone.rotation_quaternion = bone.rotation_quaternion @ offset if compose else offset


def pose(action, time, duration):
    weight = min(1, time / .45, max(0, (duration - time) / .55)) if action != 'idle' else 0
    weight = weight * weight * (3 - 2 * weight)
    for bone in rig.pose.bones:
        bone.rotation_quaternion = Quaternion()
    for side, sign in [('l', 1), ('r', -1)]:
        rotate('c_arm_fk.' + side, (0, 1, 0), sign * 18)
    rotate('c_spine_02.x', (1, 0, 0), .3 * math.sin(time / duration * math.tau))
    rotate('c_head.x', (0, 0, 1), .25 * math.sin(time / duration * math.tau))
    if action == 'nod':
        rotate('c_head.x', (1, 0, 0), 7 * math.sin(time * 3.5) * weight)
    if action == 'wave':
        rotate('c_arm_fk.r', (0, 1, 0), -18 + 40 * weight)
        rotate('c_forearm_fk.r', (1, 0, 0), -140 * weight)
        rotate('c_forearm_fk.r', (0, 1, 0), 20 * weight, compose=True)
        rotate('c_hand_fk.r', (0, 0, 1), 14 * math.sin(max(0, time - .45) * 9) * weight)
    if action in ['explain', 'emphasis']:
        rotate('c_arm_fk.r', (0, 1, 0), -18 + 8 * weight)
        rotate('c_forearm_fk.r', (1, 0, 0), -100 * weight)
        rotate('c_forearm_fk.r', (0, 1, 0), 20 * weight, compose=True)
        rotate('c_hand_fk.r', (0, 0, 1), -60 * weight)
        if action == 'emphasis':
            rotate('c_head.x', (1, 0, 0), 3 * math.sin(time * 7) * weight)
            rotate('c_hand_fk.r', (1, 0, 0), 8 * math.sin(time * 8) * weight, compose=True)


scene = bpy.context.scene
scene.render.fps = 15
rig.animation_data_create()
controls = ['c_arm_fk.l', 'c_arm_fk.r', 'c_forearm_fk.r', 'c_hand_fk.r', 'c_head.x', 'c_spine_02.x']
for name, duration in {'idle': 4, 'nod': 2.4, 'wave': 3.8, 'explain': 3.6, 'emphasis': 2.8}.items():
    action = bpy.data.actions.new(name)
    rig.animation_data.action = action
    for frame in range(round(duration * 15) + 1):
        scene.frame_set(frame + 1)
        pose(name, frame / 15, duration)
        for name_control in controls:
            rig.pose.bones[name_control].keyframe_insert('rotation_quaternion', frame=frame + 1, group=name_control)
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 1, action)
    track.mute = True
    rig.animation_data.action = None
    print('BAKED', name, flush=True)
for track in rig.animation_data.nla_tracks:
    track.mute = False
scene.frame_start = 1
scene.frame_end = 61
scene.frame_set(1)
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
mesh.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(filepath=str(out), export_format='GLB', use_selection=True,
    export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True,
    export_frame_range=False, export_def_bones=True, export_image_format='AUTO')
print('EXPORTED', out, flush=True)
