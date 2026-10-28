"""Keep the editable source visibly framed without hiding its child meshes."""
import bpy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
for obj in bpy.context.scene.objects:
    if obj.type in {'ARMATURE','MESH'}:obj.hide_set(False)
for area in bpy.context.screen.areas:
    if area.width>1000 and area.type in {'CONSOLE','VIEW_3D'}:
        area.type='VIEW_3D';space=area.spaces.active
        space.use_local_camera=False
        space.region_3d.view_perspective='CAMERA'
        space.region_3d.view_camera_zoom=0
        space.region_3d.view_camera_offset=(0,0)
        space.overlay.show_overlays=False
        space.shading.type='MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'models/yyc-info-day/YYC_InfoDay.blend'))
