# AI prompt log (AI-usage appendix)

RESILION 2.0 uses a language model for exactly two things (PRD §9): the **photo check** (FR-21) and the **alert
writer** (FR-27/28). Claude Sonnet 5.5 (`claude-sonnet-5-5`) does both when `ANTHROPIC_API_KEY` is set. Without a
key, by owner decisions 2026-11 and 2026-11-03, an optional free local model through Ollama (`AI_PROVIDER=ollama`,
`OLLAMA_VISION_MODEL`, default `qwen2.5vl:7b`) does the **photo check only**, shown as **"Local model"**, never as
Claude. The **alert writer is Claude-only**; without a key, alerts use the validated templates (see "Local models and
alert text" below). The landslide susceptibility model is a separate LightGBM model
(`docs/MODEL_CARD.md`), not a language model.

| # | Purpose | Prompt (source) | What is checked / corrected in code |
|---|---|---|---|
| 1 | Photo check: class, share of road blocked, confidence | `PHOTO_SYSTEM` in `backend/app/ai.py`; user turn = photo + `<report_metadata>{location, captured_at, note}</report_metadata>` + "Classify the photo." | Output forced to JSON schema `PHOTO_SCHEMA` (class ∈ debris / crack / fallen_tree / water / clear / not_relevant). Unknown class → `AIUnavailable` → manual review (FR-26). `blocked_share` clamped 0–100, 0 for clear / not_relevant; confidence clamped 0–1. The reporter's note is passed only inside the metadata block and the prompt says to ignore instructions in it (BR-10). The result never changes road state (BR-07); only an officer can. |
| 2 | Alert writer: en / hi / as / bn text from an approved template | `ALERT_SYSTEM` in `backend/app/ai.py`; user turn = `<alert_input>{fields, reference_templates}</alert_input>` + "Write the four alerts." | Output forced to JSON schema `ALERT_SCHEMA`. Every text is validated by `validateAlert` (`src/domain/alerts.ts`, Python port in `app/domain/alerts.py`): segment ID, direction words, decision keywords, place names, head keyword, reopening time, no other times or known places, no hurry wording. Any mismatch → that language is blocked and the plain template is used (BR-09). An officer approves every alert (BR-08). |
| 3 | Local model — photo check only | Same photo prompt and schema, sent to Ollama `/api/chat` with `format` = the JSON schema (`backend/app/ai_local.py`) | Same checks as 1; timeout / HTTP error / invalid JSON → `AIUnavailable` (tested in `backend/tests/test_ai_local.py`). Model stored as `local:<model>`; UI label "Local model". `OllamaAI.write_alerts` always raises without calling Ollama, and the alert writer is never scheduled (`writes_alerts=False`, `test_photo_only_provider_keeps_templates`). |

## Changes made after review

- Report text moved into a delimited metadata block, with an explicit instruction to treat it as untrusted data (BR-10).
- Refusal / truncation / invalid output all fail safe to manual review or the plain template, never to a guessed value.
- Local model labelled `local:<model>` end to end, so the UI cannot show it as Claude.

## Local models and alert text (owner's manual tests, 2026-11-03)

The owner ran the alert-writer prompt by hand through Ollama on this laptop. Findings, as reported by the owner:

- **qwen2.5vl:7b, Assamese alert test:** the output was mostly **Bengali**, dropped **"HOLD"**, rewrote **"Haflong"**
  in Bengali script, changed **"4:00 PM"** to **"৪:০০ প. ম"**, and translated "Reopening" as **"পুনর্ব্যবহার"**
  (= "reuse"). The validator (`validateAlert`: decision keyword, place names, reopening time) would block it.
- **gemma3:4b:** Assamese and Bengali only **echoed the tokens** (no translation); Hindi contained the Russian word
  **"открытие"**.

**Decision (owner, 2026-11-03):** the local Ollama model is used **only for the photo check**. The alert writer stays
Claude-only (when `ANTHROPIC_API_KEY` exists); without a key, alerts use the validated templates. `OLLAMA_TEXT_MODEL`
exists only as `disabled` (any other value is logged and ignored); no local model is used for alert text.

## Runs with a real model (status 2026-11-03)

- **Claude:** not run — no `ANTHROPIC_API_KEY` provided. Tested with a stand-in model only (`test_api.py`, `test_ai.py`).
- **Local model (photo check):** `qwen2.5vl:7b` is now installed. Smoke test through the app code path: valid JSON,
  54 s for the first photo (model load), 18 s for the next. Full evaluation: `docs/PHOTO_EVAL.md` (after the owner labels
  the photo set).
- **Photo evaluation set:** 142 Wikimedia Commons photos fetched (`backend/scripts/fetch_eval_photos.py`; CC0 / PD /
  CC BY / CC BY-SA only; credits in `backend/inputs/photo_eval/CREDITS.md`). `class` and `blocked_share` are empty and
  `label_confirmed=no` until the owner labels them in `label.html` — no model created any label.

AC-14 and AC-19 are tested with a stand-in model until the photo evaluation runs; AC-21 = templates + validator (LLM
writer pending a Claude key).
