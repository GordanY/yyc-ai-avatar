"""Package only the requested avatar assets, never application credentials."""
from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'models/yyc-info-day'
path=OUT/'YYC_InfoDay_Amica_PC.zip'
files=[ROOT/'public/vrm/YYC_InfoDay.vrm',OUT/'YYC_InfoDay.blend',OUT/'README.md',OUT/'source-license.json',OUT/'validation.json']
files+=sorted(OUT.glob('YYC_*.png'))+sorted(OUT.glob('preview-*.png'))
files += [p for p in [OUT/'upper-body-validation.json',OUT/'preview-upper-body-motion.mp4'] if p.exists()]
files+=sorted((ROOT/'public/animations/yyc').glob('*.vrma'))
with ZipFile(path,'w',ZIP_DEFLATED,compresslevel=6)as archive:
    for file in files:
        if file.suffix=='.vrma':name='animations/'+file.name
        elif file.suffix=='.vrm':name=file.name
        else:name=file.name
        archive.write(file,'YYC_InfoDay/'+name)
print(path)
print('Files:',len(files),'Bytes:',path.stat().st_size)
