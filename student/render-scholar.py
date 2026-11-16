"""Render the owner's separately downloaded CG-Moon rig; never copy its model into the site.

Run with Blender --background --disable-autoexec <model-rig.blend> --python
student/render-scholar.py -- <output-directory> [action]. Requires the original
textures/ directory beside the blend. Assemble the PNG frames into animated
WebP files using Pillow; see README.md for the exact command.
"""
import bpy
import math
import sys
from pathlib import Path
from mathutils import Quaternion, Vector

args = sys.argv[sys.argv.index('--') + 1:]
out = Path(args[0]).resolve()
only = args[1] if len(args) > 1 else None
source = Path(bpy.data.filepath).parent
arm = bpy.data.objects['rig']
mesh = bpy.data.objects['ElementClient-1cb515e8.obj']
for obj in list(bpy.data.objects):
    if obj not in [arm, mesh] and obj.type in ['MESH', 'CAMERA', 'LIGHT']:
        bpy.data.objects.remove(obj, do_unlink=True)
for image in bpy.data.images:
    if image.name.endswith('.dds'):
        image.filepath = str(source / 'textures' / image.name)
        image.reload()
for bone in arm.pose.bones:
    bone.rotation_mode = 'QUATERNION'
for side in ['l', 'r']:
    arm.pose.bones['c_hand_ik.' + side]['ik_fk_switch'] = 1.0
bpy.context.view_layer.update()


def rotate(name, axis, degrees, compose=False):
    bone = arm.pose.bones[name]
    rest = bone.bone.matrix_local.to_quaternion()
    offset = rest.inverted() @ Quaternion(axis, math.radians(degrees)) @ rest
    bone.rotation_quaternion = bone.rotation_quaternion @ offset if compose else offset


scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.render.resolution_x = 480
scene.render.resolution_y = 720
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.7, .75, .8, 1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .6
bpy.ops.object.camera_add(location=(0, -5, 1.05))
camera = bpy.context.object
camera.rotation_euler = (Vector((0, 0, 1.02)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 2.12
scene.camera = camera
for location, power, size in [((-3, -4, 5), 350, 4), ((3, -2, 3), 180, 3), ((0, 2, 4), 250, 3)]:
    bpy.ops.object.light_add(type='AREA', location=location)
    light = bpy.context.object
    light.data.energy = power
    light.data.shape = 'DISK'
    light.data.size = size
    light.rotation_euler = (Vector((0, 0, 1)) - light.location).to_track_quat('-Z', 'Y').to_euler()
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'

DURATIONS = {'idle': 4.0, 'nod': 2.4, 'wave': 3.8, 'explain': 3.6, 'emphasis': 2.8}
FPS = 15
for action, duration in DURATIONS.items():
    if only and action != only:
        continue
    folder = out / action
    folder.mkdir(parents=True, exist_ok=True)
    count = round(duration * FPS)
    for frame in range(count):
        time = frame / FPS
        # Every gesture begins and ends in the same relaxed pose.
        weight = min(1, time / .45, max(0, (duration - time) / .55)) if action != 'idle' else 0
        weight = weight * weight * (3 - 2 * weight)
        for bone in arm.pose.bones:
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
        bpy.context.view_layer.update()
        scene.render.filepath = str(folder / f'{frame:04d}.png')
        bpy.ops.render.render(write_still=True)
    print(f'RENDERED {action}: {count} frames', flush=True)
