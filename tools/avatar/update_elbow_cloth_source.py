"""Install the cuff shape keys, restored arm skin, and native Blender drivers.
Runs in a separate background process, preserving the user's open scene edits.
"""
import bpy,math,re,json
from pathlib import Path
from mathutils import Vector,Quaternion
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'models/yyc-info-day'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'YYC_InfoDay_v0.4.4.blend'))
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
old=[o for o in bpy.context.scene.objects if o.type=='MESH'and(o.name.startswith('YYC_Uniform_Shirt')or o.data.name.startswith('Body.baked'))]
materials={m.name:m for m in bpy.data.materials};existing=set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=str(OUT/'YYC_InfoDay.glb'));added=set(bpy.data.objects)-existing
adopt=[o for o in added if o.type=='MESH'and(o.name.startswith('YYC_Uniform_Shirt')or o.data.name.startswith('Body.baked'))]
def cuff_metadata(o):return o.get('yycElbowCloth')or o.data.get('yycElbowCloth')
assert any(o.data.name.startswith('Body.baked')for o in adopt),'Restored arm skin missing'
assert sum(bool(cuff_metadata(o))for o in adopt)==2,'Missing cuff shape keys'
for obj in old:bpy.data.objects.remove(obj,do_unlink=True)
for obj in adopt:
 obj.name=re.sub(r'\.\d{3}$','',obj.name);obj.parent=rig
 for modifier in obj.modifiers:
  if modifier.type=='ARMATURE':modifier.object=rig;modifier.use_deform_preserve_volume=False
 for i,material in enumerate(obj.data.materials):
  name=re.sub(r'\.\d{3}$','',material.name)
  if name in materials:obj.data.materials[i]=materials[name]
for obj in added-set(adopt):bpy.data.objects.remove(obj,do_unlink=True)
def variable(driver,name,path):
 var=driver.variables.new();var.name=name;var.type='SINGLE_PROP';var.targets[0].id=rig;var.targets[0].data_path=path

def property_driver(name,expression,inputs):
 rig[name]=0.;curve=rig.driver_add('["'+name+'"]');driver=curve.driver;driver.type='SCRIPTED';driver.expression=expression
 for key,path in inputs.items():variable(driver,key,path)
 return name

def dot_quaternion_expression(row,r):
 a,b,c=row;x,y,z=r
 coefficients=[a*x+b*y+c*z,a*x-b*y-c*z,-a*x+b*y-c*z,-a*x-b*y+c*z,2*(a*y+b*x),2*(a*z+c*x),2*(b*z+c*y),2*(-b*z+c*y),2*(a*z-c*x),2*(-a*y+b*x)]
 terms=['w*w','x*x','y*y','z*z','x*y','x*z','y*z','w*x','w*y','w*z']
 result='+'.join(f'({v:.10g})*{term}'for v,term in zip(coefficients,terms)if abs(v)>1e-9)
 return '('+result+')/max(1e-8,w*w+x*x+y*y+z*z)'

for obj in adopt:
 metadata=cuff_metadata(obj)
 if not metadata:continue
 side='L'if metadata['side']=='left'else'R';prefix='YYC_elbow_'+side+'_';upper=rig.data.bones['J_Bip_'+side+'_UpperArm'];lower=rig.data.bones['J_Bip_'+side+'_LowerArm'];hand=rig.data.bones['J_Bip_'+side+'_Hand'];basis=lower.matrix_local.to_quaternion();inverse=basis.inverted()
 axis=(lower.head_local-upper.head_local).normalized();rest=inverse@(hand.head_local-lower.head_local).normalized()
 def to_arm(values):return(rig.matrix_world.to_3x3().inverted()@Vector((values[0],-values[2],values[1]))).normalized()
 u=to_arm(metadata['u']);v=to_arm(metadata['v']);inputs={key:f'pose.bones["J_Bip_{side}_LowerArm"].rotation_quaternion[{index}]'for index,key in enumerate(['w','x','y','z'])}
 for label,direction in [('cos',axis),('u',u),('v',v)]:property_driver(prefix+label,dot_quaternion_expression(inverse@direction,rest),inputs)
 start=math.radians(float(metadata['startDegrees']));span=math.radians(float(metadata['fullDegrees'])-float(metadata['startDegrees']))
 property_driver(prefix+'t',f'min(1,max(0,(acos(max(-1,min(1,c)))-{start})/{span}))',{'c':'["'+prefix+'cos"]'})
 property_driver(prefix+'amount','t*t*(3-2*t)',{'t':'["'+prefix+'t"]'})
 property_driver(prefix+'phase','atan2(v,u)/(pi/2)',{'u':'["'+prefix+'u"]','v':'["'+prefix+'v"]'})
 weight_expressions=['a*max(0,1-fabs(p))','a*max(0,1-fabs(p-1))','a*max(0,fabs(p)-1)','a*max(0,1-fabs(p+1))']
 for i in range(4):
  key=obj.data.shape_keys.key_blocks['YYC_ElbowFold_'+str(i)];curve=key.driver_add('value');curve.driver.type='SCRIPTED';curve.driver.expression=weight_expressions[i];variable(curve.driver,'a','["'+prefix+'amount"]');variable(curve.driver,'p','["'+prefix+'phase"]')

for blocks in[bpy.data.meshes,bpy.data.armatures,bpy.data.materials,bpy.data.images]:
 for block in list(blocks):
  if block.users==0:blocks.remove(block)
for image in bpy.data.images:
 if image.source=='FILE':
  try:image.pack()
  except RuntimeError:pass
bpy.context.view_layer.update();scene=bpy.context.scene;scene.frame_set(scene.frame_current);bpy.context.view_layer.update()
report={'version':'0.4.5','cuffs':[{ 'name':o.name,'shapeKeys':list(o.data.shape_keys.key_blocks.keys()),'idleWeights':[o.data.shape_keys.key_blocks['YYC_ElbowFold_'+str(i)].value for i in range(4)]}for o in adopt if cuff_metadata(o)]}
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'YYC_InfoDay_v0.4.5.blend'))
# Verify the saved drivers on the same full wave, then restore the default pose.
saved={b.name:b.rotation_quaternion.copy()for b in rig.pose.bones}
def pose(name,x=0,y=0,z=0):
 b=rig.pose.bones[name];basis=b.bone.matrix_local.to_quaternion();q=Quaternion((1,0,0),math.radians(x))@Quaternion((0,0,1),math.radians(y))@Quaternion((0,-1,0),math.radians(z));b.rotation_mode='QUATERNION';b.rotation_quaternion=basis.inverted()@q@basis
pose('J_Bip_R_UpperArm',x=10,z=-55);pose('J_Bip_R_LowerArm',y=-25,z=145);pose('J_Bip_R_Hand',x=90)
bpy.context.view_layer.update();scene.frame_set(scene.frame_current+1);bpy.context.view_layer.update()
report['waveWeights']={o.name:[o.data.shape_keys.key_blocks['YYC_ElbowFold_'+str(i)].value for i in range(4)]for o in adopt if cuff_metadata(o)}
report['driversSimple']=all(fc.driver.is_simple_expression for o in adopt if cuff_metadata(o)for fc in o.data.shape_keys.animation_data.drivers)
report['driversValid']=all(fc.driver.is_valid for o in adopt if cuff_metadata(o)for fc in o.data.shape_keys.animation_data.drivers)
assert report['driversValid'],'Invalid Blender cuff drivers'
assert max(sum(values)for name,values in report['waveWeights'].items()if name.endswith('R'))>.9,'Wave driver did not activate'
scene.render.resolution_x=900;scene.render.resolution_y=1100;scene.render.resolution_percentage=100;scene.cycles.samples=12;scene.render.filepath=str(OUT/'preview-elbow-cloth-wave.png');bpy.ops.render.render(write_still=True)
for name,value in saved.items():rig.pose.bones[name].rotation_quaternion=value
bpy.context.view_layer.update();scene.frame_set(scene.frame_current+1);bpy.context.view_layer.update();bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'YYC_InfoDay_v0.4.5.blend'))
(OUT/'elbow-cloth-source-validation.json').write_text(json.dumps(report,indent=2));print('ELBOW_CLOTH_SOURCE',json.dumps(report))
