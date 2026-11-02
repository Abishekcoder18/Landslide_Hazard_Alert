# AI prompt log (AI-usage appendix)

RESILION 2.0 uses a language model for exactly two things (PRD §9): the **photo check** (FR-21) and the **alert
writer** (FR-27/28). Claude Sonnet 5.5 (`claude-sonnet-5-5`) when `ANTHROPIC_API_KEY` is set; otherwise, by owner
decision 2026-11, an optional free local model through Ollama (`AI_PROVIDER=ollama`, default `qwen2.5vl:7b`),
shown as **"Local model"**, never as Claude. The landslide susceptibility model is a separate LightGBM model
(`docs/MODEL_CARD.md`), not a language model.

| # | Purpose | Prompt (source) | What is checked / corrected in code |
|---|---|---|---|
| 1 | Photo check: class, share of road blocked, confidence | `PHOTO_SYSTEM` in `backend/app/ai.py`; user turn = photo + `<report_metadata>{location, captured_at, note}</report_metadata>` + "Classify the photo." | Output forced to JSON schema `PHOTO_SCHEMA` (class ∈ debris / crack / fallen_tree / water / clear / not_relevant). Unknown class → `AIUnavailable` → manual review (FR-26). `blocked_share` clamped 0–100, 0 for clear / not_relevant; confidence clamped 0–1. The reporter's note is passed only inside the metadata block and the prompt says to ignore instructions in it (BR-10). The result never changes road state (BR-07); only an officer can. |
| 2 | Alert writer: en / hi / as / bn text from an approved template | `ALERT_SYSTEM` in `backend/app/ai.py`; user turn = `<alert_input>{fields, reference_templates}</alert_input>` + "Write the four alerts." | Output forced to JSON schema `ALERT_SCHEMA`. Every text is validated by `validateAlert` (`src/domain/alerts.ts`, Python port in `app/domain/alerts.py`): segment ID, direction words, decision keywords, place names, head keyword, reopening time, no other times or known places, no hurry wording. Any mismatch → that language is blocked and the plain template is used (BR-09). An officer approves every alert (BR-08). |
| 3 | Local model (same two uses) | Same prompts and schemas, sent to Ollama `/api/chat` with `format` = the JSON schema (`backend/app/ai_local.py`) | Same checks as 1–2; timeout / HTTP error / invalid JSON → `AIUnavailable` (tested in `backend/tests/test_ai_local.py`). Model stored as `local:<model>`; UI label "Local model". |

## Changes made after review

- Report text moved into a delimited metadata block, with an explicit instruction to treat it as untrusted data (BR-10).
- Refusal / truncation / invalid output all fail safe to manual review or the plain template, never to a guessed value.
- Local model labelled `local:<model>` end to end, so the UI cannot show it as Claude.

## Runs with a real model (status 2026-11-03)

- **Claude:** not run — no `ANTHROPIC_API_KEY` provided. Tested with a stand-in model only (`test_api.py`, `test_ai.py`).
- **Local model:** not run — `ollama pull qwen2.5vl:7b` failed on this laptop (DNS lookup of Ollama's storage host failed
  after 5.8 MB of 6.0 GB). The installed `qwen2.5:3b-instruct` is text-only and cannot do the photo check.
- **Photo evaluation set:** `backend/scripts/fetch_photo_eval.py` written but not run (owner decision pending on the
  Wikimedia request); labels must be confirmed by the owner before any evaluation (`docs/PHOTO_EVAL.md` not produced yet).

AC-14, AC-19 and AC-21 therefore remain tested with a stand-in model only.
