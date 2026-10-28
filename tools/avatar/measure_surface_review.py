"""Measure actual posed shirt profiles and boundaries without texture shading."""
import bpy,os,json,math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
root=Path(__file__).resolve().parents[2];stage=os.environ.get('YYC_REVIEW_STAGE','before');out=root/'output/playwright/upper-body'/stage;out.mkdir(parents=True,exist_ok=True)
obj=next(o for o in bpy.context.scene.objects if o.type=='MESH'and o.name=='YYC_Uniform_Shirt')
evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh();verts=[evaluated.matrix_world@v.co for v in mesh.vertices];tree=BVHTree.FromPolygons(verts,[list(p.vertices)for p in mesh.polygons])
profiles=[]
for x in [0.,.05,.10,.14]:
    points=[]
    for i in range(65):
        height=1.24+.0025*i;hit,normal,index,distance=tree.ray_cast(Vector((x,2,height)),Vector((0,-1,0)))
        if hit:points.append({'height':height,'depth':hit.y})
    slopes=[]
    for a,b,c in zip(points,points[1:],points[2:]):
        if c['height']-a['height']<.0051:slopes.append((b['height'],math.atan2(c['depth']-a['depth'],c['height']-a['height'])))
    changes=[abs(b[1]-a[1])*180/math.pi for a,b in zip(slopes,slopes[1:])if 1.32<a[0]<1.385 and b[0]-a[0]<.0026]
    profiles.append({'x':x,'maxUpperChestTangentStepDegrees':max(changes,default=0),'samples':points})
edges={}
for p in mesh.polygons:
    for a,b in zip(p.vertices,list(p.vertices[1:])+[p.vertices[0]]):
        key=tuple(sorted((a,b)));edges[key]=edges.get(key,0)+1
boundaries=[(a,b)for(a,b),count in edges.items()if count==1]
report={'stage':stage,'vertexCount':len(mesh.vertices),'polygonCount':len(mesh.polygons),'boundaryEdges':len(boundaries),'profiles':profiles,'note':'Profile tangents use ray intersections with posed geometry, independently of colour or custom shading normals.'}
(out/'surface-measurements.json').write_text(json.dumps(report,indent=2));print(json.dumps({**{k:v for k,v in report.items()if k!='profiles'},'profileTangentSteps':[{k:v for k,v in p.items()if k!='samples'}for p in profiles]},indent=2));evaluated.to_mesh_clear()
