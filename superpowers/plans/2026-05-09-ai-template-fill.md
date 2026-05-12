# AI Template Fill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` before implementing this plan.

**Goal:** Implement AI-powered auto-fill for business files using bid documents and Baidu Qianfan LLM, then switch OnlyOffice preview to the newly filled document.

**Important:** This is a **revised v2 execution plan**. It replaces the earlier line-number-based instructions with a safer, code-aware workflow. Do not mechanically apply snippets without first checking the current repository structure.

---

## 0. Execution Rules

- [ ] Read the approved design doc first: `docs/superpowers/specs/2026-05-09-ai-template-fill-design.md`
- [ ] Confirm current `doc-service` schema, API shape, and OnlyOffice token flow before editing
- [ ] Follow TDD in small slices: RED → GREEN → IMPROVE
- [ ] Do not modify `/backend`
- [ ] Do not write test fixtures into tracked binary files during test execution
- [ ] Do not rely on hard-coded line numbers; locate symbols/functions in the current codebase first

---

## 1. Implementation Scope Summary

### New capabilities

- Upload business file with `job_id`
- Upload multiple bid documents under the same `job_id`
- Analyze business file fields from real tender formats
- Extract knowledge text from multiple docx files
- Match field values via LLM
- Generate new filled docx without overwriting original business file
- Return `filled_doc_id` and switch frontend preview to the new business file document

### Main modules

#### `doc-service`
- `app/services/knowledge_extractor.py`
- `app/services/template_analyzer.py`
- `app/services/llm_service.py`
- `app/services/template_filler.py`
- `app/api/v1/documents.py`
- `app/models/document.py`
- `app/schemas/document.py`
- `app/core/config.py`

#### `frontend`
- `src/types/businessDoc.ts`
- `src/services/businessDoc.ts`
- `src/pages/bidding/businessDoc/index.tsx`

---

## 2. Phase 1 — Baseline discovery and schema alignment

**Goal:** verify existing contracts before new implementation.

- [ ] Inspect current `doc-service` `Document` model
- [ ] Inspect current document schemas, especially existing `DocField` and AI fill response types
- [ ] Inspect current upload endpoints and `/{doc_id}/editor-token` flow
- [ ] Inspect current frontend page state transitions in `businessDoc/index.tsx`
- [ ] Inspect how `docId`, `docKey`, `fields`, and editor refresh are wired today

### Deliverables

- [ ] Decide whether AI fill can reuse existing `DocField` schema safely
- [ ] Confirm whether `filled_template` can be marked `ready` immediately or must follow existing parse/status flow
- [ ] Confirm how `onlyoffice_doc_key` is generated today and where new document key should be assigned

### Stop condition

Do not proceed to implementation until the above three questions are answered from code, not assumption.

---

## 3. Phase 2 — Config and persistence changes

**Goal:** prepare environment variables and DB model.

### Files
- `doc-service/.env.example`
- `doc-service/app/core/config.py`
- `doc-service/app/models/document.py`
- `doc-service/app/schemas/document.py`
- Alembic migration files if the service uses Alembic

### Tasks

- [ ] Add/update `.env.example` with:
  - `LLM_BASE_URL`
  - `LLM_API_KEY`
  - `LLM_MODEL`
  - `ONLYOFFICE_URL`
  - `ONLYOFFICE_JWT_SECRET`
- [ ] Align config names in `config.py` to `llm_*`
- [ ] Add `parent_doc_id` to `Document`
- [ ] Add `AiFillRequest.job_id`
- [ ] Add `AiFillResponse.filled_doc_id`
- [ ] If current `DocField` does not support AI response shape, define a dedicated schema instead of forcing reuse

### Verification

- [ ] Run config import check
- [ ] Generate and run DB migration if the project uses migrations
- [ ] Verify `parent_doc_id` exists in the actual DB schema used by `doc-service`

---

## 4. Phase 3 — Build `KnowledgeExtractor` with isolated tests

**Goal:** extract text from multiple docx files safely.

### Files
- `doc-service/app/services/knowledge_extractor.py`
- `doc-service/tests/conftest.py`
- `doc-service/tests/test_knowledge_extractor.py`

### Test strategy

**Important revision:** all generated docx fixtures must live under `tmp_path`, not under tracked `tests/fixtures/` binaries.

### Tasks

- [ ] Write failing tests for:
  - single doc extraction
  - table extraction
  - multiple files
  - corrupt file handling
  - empty input
- [ ] Use `tmp_path` fixtures for all generated documents
- [ ] Implement extractor to:
  - keep file boundaries in merged text
  - extract non-empty paragraphs
  - extract readable table rows
  - skip corrupt files with warning
- [ ] If all files are invalid or no valid text remains, ensure caller can distinguish that from success

### Verification

- [ ] Run only `test_knowledge_extractor.py`
- [ ] Confirm no tracked fixture files changed after test run

---

## 5. Phase 4 — Build `TemplateAnalyzer` with explicit scope limits

**Goal:** identify fillable fields from real-world template formats.

### Files
- `doc-service/app/services/template_analyzer.py`
- `doc-service/tests/test_template_analyzer.py`

### Supported MVP field types
- `bracket`
- `blank`
- `table_cell`
- optional `inline_paren` if current template samples prove it is needed and testable

### Tasks

- [ ] Write failing tests for bracket placeholders
- [ ] Write failing tests for blank labels and combined-line blanks
- [ ] Write failing tests for simple labeled table cells
- [ ] Add only the minimum `inline_paren` support justified by real samples; skip it if rules are too weak
- [ ] Implement deduplication rules per field type and label
- [ ] Treat `location` as per-run locator only, not as persistent identity

### Verification

- [ ] Run only `test_template_analyzer.py`
- [ ] Validate that analyzer does not over-claim support for complex merged-table semantics

---

## 6. Phase 5 — Build `LLMService` with explicit error categories

**Goal:** map analyzed fields to values from knowledge text.

### Files
- `doc-service/app/services/llm_service.py`
- `doc-service/tests/test_llm_service.py`

### Tasks

- [ ] Write failing tests for:
  - normal JSON success
  - empty knowledge text
  - JSON parse retry
  - chunking behavior
  - prompt content
  - unknown field IDs in response
- [ ] Implement service using configured OpenAI-compatible client
- [ ] Distinguish these failure types in code/logging:
  - API/network failure
  - empty response
  - non-JSON response
  - invalid field ids
- [ ] Chunk by file boundary first, then by content length if needed
- [ ] Do not use blanket `except Exception` for all logic paths
- [ ] Prefer preserving first trustworthy non-empty value instead of blindly overriding with later chunks

### Verification

- [ ] Run only `test_llm_service.py`
- [ ] Confirm one overlong single line is still chunked safely

---

## 7. Phase 6 — Build `TemplateFiller` without mutating source template

**Goal:** generate a new formatted docx from field values.

### Files
- `doc-service/app/services/template_filler.py`
- `doc-service/tests/test_template_filler.py`

### Tasks

- [ ] Write failing tests for bracket replacement
- [ ] Write failing tests for blank replacement
- [ ] Write failing tests for table cell fill
- [ ] Add at least one cross-run replacement test
- [ ] Add at least one merged-cell or unique-cell handling test if current sample supports it
- [ ] Implement run-level replacement logic
- [ ] Ensure blank filling scans all relevant paragraphs, not just `doc.paragraphs`, if actual templates require table/header/footer support
- [ ] Save output as a new file under processed/output directory
- [ ] Skip empty values instead of writing placeholders

### Verification

- [ ] Run only `test_template_filler.py`
- [ ] Verify source template file remains unchanged

---

## 8. Phase 7 — Wire the AI fill API pipeline

**Goal:** connect upload, extraction, analysis, LLM, fill, and persistence.

### Files
- `doc-service/app/api/v1/documents.py`
- `doc-service/app/schemas/document.py`
- possibly helper imports already used by current parsing/token flow

### Tasks

- [ ] Update upload endpoints to accept `job_id` from multipart form data
- [ ] Persist `job_id` on both business file and bid document records
- [ ] Implement `POST /{doc_id}/ai-fill` using request body `job_id`
- [ ] Validate business file exists and has correct `doc_type`
- [ ] Query `bid_source` docs by `job_id`
- [ ] Ignore missing file paths only if at least one valid knowledge file remains
- [ ] If no usable knowledge text exists, return a clear 400/500-class error depending on failure cause
- [ ] Analyze business file fields
- [ ] If no fields found, return successful empty result without creating a filled document
- [ ] Run LLM match
- [ ] Fill the business file into a new file
- [ ] Create a new `filled_template` `Document` record
- [ ] Assign new `onlyoffice_doc_key` using the same mechanism the project already uses for new doc versions
- [ ] Persist response fields only if schema is confirmed compatible
- [ ] On DB failure after file creation, delete the generated file

### Verification

- [ ] Import router successfully
- [ ] Verify endpoint schema appears correctly in FastAPI app
- [ ] Verify `filled_template` records are queryable and use `parent_doc_id`

---

## 9. Phase 8 — Frontend service and state updates

**Goal:** allow frontend to send `job_id`, trigger AI fill, and switch to the new business file document.

### Files
- `frontend/src/types/businessDoc.ts`
- `frontend/src/services/businessDoc.ts`
- `frontend/src/pages/bidding/businessDoc/index.tsx`

### Tasks

- [ ] Extend frontend AI fill response type with `filled_doc_id`
- [ ] Update `uploadBusinessTemplate(file, jobId)` to send `job_id`
- [ ] Update `triggerAiFill(docId, jobId)` to send request body with `job_id`
- [ ] Align mock service signatures with real service signatures
- [ ] Update business file upload flow to always use current `jobId`
- [ ] Update bid document upload input to support `multiple`
- [ ] Update multi-file upload handler
- [ ] Add `handleAiFill`
- [ ] On success:
  - set new `docId`
  - update URL if current page depends on it
  - refresh document/editor state from new document
  - update field panel
- [ ] On failure:
  - do not set page state to `filled`
  - restore safe interactive state
  - keep current document preview unchanged

### Verification

- [ ] Confirm changing `docId` actually refreshes OnlyOffice in current page architecture
- [ ] If not, explicitly trigger re-fetch of token/status/outline after AI fill success

---

## 10. Phase 9 — Workflow reference document

**Goal:** document the external fill-template workflow as implementation background.

### Files
- `doc-service/docs/fill-template-workflow.md`

### Tasks

- [ ] Write reference doc for replacement strategy, blank fill behavior, merged-cell handling, and run-level edits
- [ ] Do not include personal-machine absolute paths in the document
- [ ] Focus on reusable engineering insights, not local file locations

---

## 11. Phase 10 — Integration tests and end-to-end verification

**Goal:** verify the full AI fill pipeline.

### Files
- `doc-service/tests/test_ai_fill_api.py`

### Test revisions from review

- Use temporary DB path or in-memory DB isolated per test session
- Use `tmp_path` for sample docx files
- Avoid leaving test DB files in project root

### Tests

- [ ] Upload business file with `job_id`
- [ ] Upload bid document with same `job_id`
- [ ] Trigger AI fill with mocked LLM
- [ ] Verify `filled_doc_id` returned
- [ ] Verify new `filled_template` record exists
- [ ] Verify missing bid-source case returns 400
- [ ] Add at least one test for generated document file existence
- [ ] Add at least one test for cleanup behavior on persistence failure if practical

### Verification

- [ ] Run API integration tests only
- [ ] Run all `doc-service` tests together
- [ ] Start service locally and ensure no import/startup errors

---

## 12. Final verification checklist

- [ ] `doc-service` tests all pass
- [ ] No tracked `.env` file is staged
- [ ] No tracked test fixture binaries were mutated by test execution
- [ ] New env variable names are consistent everywhere
- [ ] `filled_template` creation path uses a new OnlyOffice doc key
- [ ] Frontend AI fill success actually refreshes to the new business file document
- [ ] Frontend AI fill failure leaves the user on a recoverable state
- [ ] All changes stay within approved scope

---

## 13. Suggested implementation order

1. Phase 1 — discovery
2. Phase 2 — config/schema
3. Phase 3 — knowledge extractor
4. Phase 4 — template analyzer
5. Phase 5 — LLM service
6. Phase 6 — template filler
7. Phase 7 — API wiring
8. Phase 8 — frontend wiring
9. Phase 9 — workflow doc
10. Phase 10 — integration tests
11. Phase 12 — final verification

---

## 14. Expected risks to watch during implementation

- Existing schema may not match planned AI response shape
- OnlyOffice refresh may depend on more than `docId` mutation
- Current parsing/status pipeline may require a new filled document to run extra steps before `ready`
- Template analyzer may overfit toy tests and fail on real templates
- Temporary test artifacts may pollute git status if not isolated
- LLM compatibility with Baidu Qianfan base URL must be verified with a real call before integration is considered complete

---

## 15. Definition of done

This feature is complete only when all of the following are true:

- A user can upload one business file and multiple bid documents under one `job_id`
- Triggering AI fill returns a new `filled_doc_id`
- The new business file document can be opened in OnlyOffice with a fresh doc key
- The original business file remains unchanged
- Field results are visible in the frontend
- Failures are explicit and recoverable
- Tests pass without mutating tracked fixture files
- The implementation still matches the revised design doc
