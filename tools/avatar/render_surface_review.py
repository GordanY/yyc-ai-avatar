"""Diagnostic renders only. Never saves/modifies the editable source file."""
import bpy,math,os
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parents[2]
out=root/'output/playwright/upper-body'/os.environ.get('YYC_REVIEW_STAGE','before');out.mkdir(parents=True,exist_ok=True)
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24
scene.render.resolution_x=900;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.view_settings.view_transform='Standard'
for obj in list(scene.objects):
    if obj.type=='LIGHT':bpy.data.objects.remove(obj,do_unlink=True)
    elif obj.type=='MESH' and obj.name.lower()in {'plane','preview_floor'}:obj.hide_render=True
world=bpy.data.worlds.new('Review World');world.use_nodes=True;world.node_tree.nodes['Background'].inputs['Color'].default_value=(.35,.35,.35,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.65;scene.world=world
for loc,power,size in [((-1.5,2.5,2.4),120,1.4),((1.6,1.2,1.8),30,2.2)]:
    bpy.ops.object.light_add(type='AREA',location=loc);light=bpy.context.object;light.data.energy=power;light.data.shape='DISK';light.data.size=size;light.rotation_euler=(Vector((0,0,1.3))-light.location).to_track_quat('-Z','Y').to_euler()
cam=scene.camera;cam.data.type='ORTHO';cam.data.ortho_scale=.70
clay=bpy.data.materials.new('Diagnostic Clay');clay.use_nodes=True;bsdf=clay.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(.45,.45,.45,1);bsdf.inputs['Roughness'].default_value=.9
normal=bpy.data.materials.new('Diagnostic Normal');normal.use_nodes=True;n=normal.node_tree.nodes;n.clear();geo=n.new('ShaderNodeNewGeometry');remap=n.new('ShaderNodeVectorMath');remap.operation='MULTIPLY_ADD';remap.inputs[1].default_value=(.5,.5,.5);remap.inputs[2].default_value=(.5,.5,.5);em=n.new('ShaderNodeEmission');output=n.new('ShaderNodeOutputMaterial');links=normal.node_tree.links;links.new(geo.outputs['Normal'],remap.inputs[0]);links.new(remap.outputs['Vector'],em.inputs['Color']);links.new(em.outputs[0],output.inputs['Surface'])
wire=clay.copy();wire.name='Diagnostic Actual Topology';nodes=wire.node_tree.nodes;links=wire.node_tree.links;edge=nodes.new('ShaderNodeWireframe');edge.use_pixel_size=True;edge.inputs['Size'].default_value=.35;mix=nodes.new('ShaderNodeMixRGB');mix.inputs[1].default_value=(.6,.6,.6,1);mix.inputs[2].default_value=(.045,.045,.045,1);links.new(edge.outputs['Fac'],mix.inputs[0]);links.new(mix.outputs[0],nodes.get('Principled BSDF').inputs['Base Color'])
for mode,material in [('textured',None),('clay',clay),('normal',normal),('wire',wire)]:
    scene.view_layers[0].material_override=material
    for view,loc in [('front',(0,2.5,1.34)),('side',(2.5,0,1.34)),('three-quarter',(1.7,2,1.34))]:
        cam.location=loc;cam.rotation_euler=(Vector((0,0,1.30))-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(out/(mode+'-'+view+'.png'));bpy.ops.render.render(write_still=True)
print('Surface review complete:',out)
