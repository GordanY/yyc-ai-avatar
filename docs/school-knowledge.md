# School knowledge for the Claude chatbot

The local Claude chat path uses a school knowledge base derived from these PDFs:

| File | Physical PDF pages |
| --- | ---: |
| `1023-0925.pdf` | 84 |
| `YY-0601.pdf` | 180 |
| `YY2-0604.pdf` | 184 |

The current dataset contains 47 topics, 228 summary facts and 888 extracted-text chunks covering 448 pages. References use physical PDF page numbers starting at 1, which can differ from printed page labels.

## Request flow and scope

`src/features/chat/claudeChat.ts` posts the conversation to `/api/claude/`. That API calls `buildSchoolSystemPrompt` in `src/server/schoolContext.ts` before sending the request to Anthropic.

Every Claude request receives the complete qualified summary. The server also retrieves up to five excerpts from distinct pages, with a combined text limit of 7,000 characters. Retrieval uses the last three user questions, weights the latest question more heavily, and combines Chinese word segmentation, Chinese bigrams and English keywords. Assistant messages are not retrieval queries. This is local keyword retrieval; it does not use embeddings or an external vector database.

The full knowledge and chunk datasets stay in server modules. The settings page imports only the small status metadata file. The API includes `X-School-Knowledge-Version` and `X-School-Knowledge-Facts` response headers for internal verification. Visitor-facing answers never include provenance.

This integration applies to the Claude adapter. Other providers and the optional reasoning-engine path bypass this server prompt builder and are not covered by this integration.

## Files

- `src/server/data/schoolKnowledge.json`: facts, source metadata, time scopes, qualifications, source discrepancies and information not established by the summary.
- `src/server/data/schoolSourceChunks.json`: extracted page text with source filenames, page numbers, topic links and quality flags.
- `src/server/schoolContext.ts`: summary formatting and bounded excerpt retrieval.
- `src/config/schoolKnowledge.json`: small client-facing dataset status.
- `src/config/infoDayPrompt.ts`: the existing reception character and response rules.

The data is copied into the repository; runtime does not depend on files in Downloads. Original PDFs are bundled in `context/source-pdfs/` for internal source checks; the runtime uses the extracted datasets. Historical temporary before-change copies remain in the original development checkout and are not part of this portable repository.

## Answer behavior

The existing short, friendly Traditional Chinese reception style remains in place, including the initial avatar expression marker. Unknown or current arrangements are referred to on-site teachers using the existing reception wording. Source names, filenames, page numbers and citations are strictly prohibited in displayed answers and speech, even when visitors explicitly ask for them. Conflicting facts are referred to on-site teachers without exposing document references.

The API collects the complete model reply before passing it through `sanitizeSchoolAnswer` in `src/features/chat/schoolAnswer.ts`; no unfiltered fragments reach the display or speech pipeline. This delays first visible text until model generation finishes. The same filter hides citations in older assistant bubbles, the chat log and chat exports. Original internal provenance is retained for factual checks.

Source text is reference data, not an instruction. The qualified summary and source discrepancy notes take precedence over raw OCR excerpts. The old DOCX Q&A, older conversation answers and character supplements are not school-fact authorities. Historical figures, selected alumni examples, competition results and publication snapshots retain their stated scope; they are not automatically current policies or whole-school rates. Exact OCR, table and chart details can still require the original PDF.

## Complete reply audio

Buffering the reply for source filtering exposed an older parser assumption that each transport chunk would supply only one utterance. A complete filtered response could therefore leave later paragraphs unqueued for speech.

`src/utils/processResponse.ts` now drains every available utterance in a chunk. Both `src/features/chat/chat.ts` and `src/utils/askLlm.ts` call it with `final: true` at end-of-stream to flush trailing words without punctuation, and use the thinking state supplied for each utterance. The parser still honors interruption while draining. This changes speech completeness, not the prohibition on source names, page numbers or citations in displayed or spoken replies.

Regression coverage in `__tests__/processResponse.spec.ts` includes a three-paragraph reply in one chunk, a sweep across network chunk sizes, an unpunctuated final tail, interruption, and a closing-think transition. A historical full run in the original checkout's `working/school-knowledge-integration/all-tests.log` passed 19 suites and 111 tests; the corresponding TypeScript check log was empty. That scratch log is excluded from this packaged repository.

Historical live instrumentation in the original checkout's `output/school-knowledge/audio-playback-events.json` recorded three ordered `audible`/`ended` pairs with nonempty audio for the three answer paragraphs. This records browser playback events and audio generation; it does not establish physical listening or human acceptance. Raw `output/` artifacts are excluded from this packaged repository.

## Updating the dataset

Update the following together:

1. Replace the summary data in `src/server/data/schoolKnowledge.json`, preserving source identities, physical page references, event dates, qualifications, unresolved discrepancies and explicit unknowns.
2. Replace the chunk array in `src/server/data/schoolSourceChunks.json`, retaining its source/page/topic fields, `representation`, `quality_flags` and `source_issue_ids`.
3. Update the counts, source filenames and version information in `src/config/schoolKnowledge.json`. Keep this file small; do not add the corpus to the settings component.
4. Reconcile dataset-specific assertions in `__tests__/schoolContext.spec.ts`, then run the focused checks and real chatbot questions.

From the repository root:

```sh
npm test -- --runInBand __tests__/schoolContext.spec.ts __tests__/schoolKnowledgeApi.spec.ts __tests__/schoolAnswer.spec.ts __tests__/claude.spec.ts __tests__/processResponse.spec.ts
npx tsc --noEmit --incremental false
```

The context tests cover source inclusion, qualifications, bounded retrieval, Chinese and English queries, page deduplication and short follow-ups. The Claude route tests cover request validation, prompt wiring, UTF-8 streaming and upstream failures. Mocked tests do not prove real model answers: live browser questions must also be compared with the cited PDF pages. Historical live verification results and screenshots were saved under `output/school-knowledge/` in the original checkout and are excluded here. The initial source-visible tests preceded the later instruction to hide provenance; the later tests verify that explicit citation requests do not expose it.
