"""Read-only saved-source check, with Blender auto-execution disabled."""
import bpy,math,json
from pathlib import Path
from mathutils import Quaternion
ROOT=Path(__file__).resolve().parents[2]
bpy.context.preferences.filepaths.use_scripts_auto_execute=False
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'models/yyc-info-day/YYC_InfoDay_v0.4.5.blend'))
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
for name,x,y,z in [('J_Bip_R_UpperArm',10,0,-55),('J_Bip_R_LowerArm',0,-25,145),('J_Bip_R_Hand',90,0,0)]:
 bone=rig.pose.bones[name];basis=bone.bone.matrix_local.to_quaternion();q=Quaternion((1,0,0),math.radians(x))@Quaternion((0,0,1),math.radians(y))@Quaternion((0,-1,0),math.radians(z));bone.rotation_quaternion=basis.inverted()@q@basis
bpy.context.view_layer.update();bpy.context.scene.frame_set(bpy.context.scene.frame_current+1);bpy.context.view_layer.update()
cuffs=[o for o in bpy.context.scene.objects if o.type=='MESH'and o.data.shape_keys and'YYC_ElbowFold_0'in o.data.shape_keys.key_blocks]
right=next(o for o in cuffs if o.name.endswith('R'));weights=[right.data.shape_keys.key_blocks['YYC_ElbowFold_'+str(i)].value for i in range(4)]
assert sum(weights)>.99,weights
assert all(fc.driver.is_valid and fc.driver.is_simple_expression for o in cuffs for fc in o.data.shape_keys.animation_data.drivers)
result={'autoExecutionEnabled':bpy.context.preferences.filepaths.use_scripts_auto_execute,'savedSourceReloaded':True,'rightWaveWeights':weights,'validSimpleDrivers':True}
(ROOT/'output/playwright/elbow-cloth/saved-source-reload.json').write_text(json.dumps(result,indent=2));print('SOURCE_RELOAD_CHECK',json.dumps(result))
