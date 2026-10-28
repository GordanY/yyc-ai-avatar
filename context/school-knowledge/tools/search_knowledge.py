#!/usr/bin/env python3
"""Local, dependency-free keyword retrieval; returns source-linked JSON, no network calls."""
from pathlib import Path
import argparse, json, re, math
root=Path(__file__).resolve().parent.parent
ap=argparse.ArgumentParser(description=__doc__)
ap.add_argument('query',nargs='?',default='')
ap.add_argument('--topic',help='Filter by topic id, e.g. scholarships, english, animation')
ap.add_argument('--source',choices=['P2026','A1','A2'])
ap.add_argument('--page',type=int,help='Physical PDF page; combine with --source')
ap.add_argument('--limit',type=int,default=6)
ap.add_argument('--raw',action='store_true',help='Search extracted source chunks instead of summary facts')
a=ap.parse_args()
kb=json.loads((root/'school_knowledge.json').read_text())
q=a.query.casefold();terms=re.findall(r'[a-z0-9]+|[\u3400-\u9fff]+',q)
# Split long Chinese queries into overlapping bigrams while preserving the exact phrase.
for phrase in list(terms):
 if re.fullmatch(r'[\u3400-\u9fff]{3,}',phrase):terms.extend(phrase[i:i+2] for i in range(len(phrase)-1))
terms=list(dict.fromkeys(terms))
rows=[]
if a.raw:
 with (root/'retrieval_chunks.jsonl').open() as f:
  for line in f:
   d=json.loads(line)
   if a.topic and a.topic not in d['topic_ids']:continue
   if a.source and d['source_id']!=a.source:continue
   if a.page and d['pdf_page']!=a.page:continue
   hay=d['text'].casefold();meta=(d['topic_title_zh']+' '+d['topic_title_en']).casefold()
   score=sum((1+math.log1p(hay.count(t)) if t in hay else 0)+(.3 if t in meta else 0) for t in terms)
   if d['representation']=='ocr_supplement':score*=.97
   if score or not terms:rows.append((score,d))
else:
 for t in kb['topics']:
  if a.topic and a.topic!=t['id']:continue
  meta=' '.join([t['title_zh'],t['title_en']]+t['keywords']).casefold()
  for f in t['facts']:
   if a.source and not any(e['source_id']==a.source for e in f['evidence']):continue
   if a.page and not any(a.page in e['pdf_pages'] and (not a.source or a.source==e['source_id']) for e in f['evidence']):continue
   hay=f['text_zh'].casefold()
   score=sum((2+math.log1p(hay.count(w)) if w in hay else 0)+(1 if w in meta else 0) for w in terms)
   if score or not terms:rows.append((score,{'topic_id':t['id'],'topic_title_zh':t['title_zh'],**f}))
rows.sort(key=lambda x:x[0],reverse=True)
print(json.dumps({'query':a.query,'mode':'source_chunks' if a.raw else 'summary_facts','note':'Keyword search only; review source issues and exact PDF tables when precision matters.','results':[{'score':round(s,3),**d} for s,d in rows[:max(1,min(a.limit,50))]]},ensure_ascii=False,indent=2))
