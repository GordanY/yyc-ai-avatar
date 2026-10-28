#!/usr/bin/env python3
from pathlib import Path
import json, hashlib
root=Path(__file__).resolve().parent.parent
kb=json.loads((root/'school_knowledge.json').read_text())
pages=[json.loads(l) for l in (root/'source_pages.jsonl').read_text().splitlines()]
chunks=[json.loads(l) for l in (root/'retrieval_chunks.jsonl').read_text().splitlines()]
by_page={p['page_id']:p for p in pages}; assert len(by_page)==len(pages)==448
by_source={s['id']:s for s in kb['sources']}
facts=[f for t in kb['topics'] for f in t['facts']]
assert len(facts)==kb['fact_count']==228
assert len(kb['topics'])==kb['topic_count']==47
for obj in facts+kb['source_issues']:
 for e in obj['evidence']:
  assert e['source_id'] in by_source
  for n in e['pdf_pages']:assert f"{e['source_id']}:p{n:03}" in by_page
for c in chunks:
 p=by_page[c['page_id']]
 body=p['text'] if c['representation']=='preferred' else p['ocr_text']
 assert body[c['text_start_character']:c['text_end_character']]==c['text']
 assert c['pdf_page']==p['pdf_page'] and c['source_id']==p['source_id']
# Ensure overlapping retrieval chunks reconstruct every preferred text with no gaps.
for p in pages:
 cs=sorted([c for c in chunks if c['page_id']==p['page_id'] and c['representation']=='preferred'],key=lambda c:c['text_start_character'])
 if not p['text'].strip():continue
 assert cs and cs[0]['text_start_character']==0
 end=0
 for c in cs:
  assert c['text_start_character']<=end
  end=max(end,c['text_end_character'])
 assert end==len(p['text'])
for p in root.glob('*.json'):json.loads(p.read_text())
if (root/'manifest.json').exists():
 manifest=json.loads((root/'manifest.json').read_text())
 for f in manifest['files']:
  path=root/f['path'];assert path.stat().st_size==f['bytes']
  assert hashlib.file_digest(path.open('rb'),'sha256').hexdigest()==f['sha256']
print(json.dumps({'status':'passed','topics':len(kb['topics']),'facts':len(facts),'source_pages':len(pages),'chunks':len(chunks),'checks':['JSON parsing','unique page IDs','all fact and issue references','exact chunk text slices','gap-free preferred-text chunk coverage','manifest checksums when present']},indent=2))
