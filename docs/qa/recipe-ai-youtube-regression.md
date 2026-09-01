# Recipe AI + YouTube Workflow — QA Regression Suite

Reusable manual regression checklist for the PR1→PR6 recipe editor, AI field workflow, canonical video chapters, and safe YouTube chapter synchronization.

Use generic identities only: **Owner A**, **Editor A**, **Audience A**.

Priority: **P0** = release blocker, **P1** = important, **P2** = secondary polish.

---

## Auth / Roles

| ID | Priority | Steps | Expected |
|---|---|---|---|
| AUTH-01 | P0 | Sign in as Owner A | Full admin access including Team access and YouTube write controls |
| AUTH-02 | P0 | Sign in as Editor A | Recipe/types/categories/series/reviews/YouTube read; no Team access; no YouTube description write |
| AUTH-03 | P0 | Sign in as Audience A | Members, Visitors, YouTube reports only; no recipe editor, no Series |
| AUTH-04 | P1 | Revoke staff role while session active | Session reflects persisted role; unauthorized areas hidden |
| AUTH-05 | P1 | Forgot / reset password flow | Reset completes; no credential leakage in responses |

---

## Recipe CRUD

| ID | Priority | Steps | Expected |
|---|---|---|---|
| CRUD-01 | P0 | Create draft recipe | Saves; required title enforced |
| CRUD-02 | P0 | Edit and save existing recipe | Values persist; no data loss |
| CRUD-03 | P0 | Publish with required fields complete | Publishes; public page renders |
| CRUD-04 | P1 | Move published recipe to draft | Confirmation; status updates |
| CRUD-05 | P1 | Assign types and categories | Saved correctly on reload |
| CRUD-06 | P2 | Reviews admin loads | Moderation list accessible to content roles |

---

## AI Field Workflow

| ID | Priority | Steps | Expected |
|---|---|---|---|
| AI-01 | P0 | **Generate** on empty eligible field | Scalar suggestion; Apply updates only that field |
| AI-02 | P0 | **Improve** on populated field | Current value is scalar; suggestion matches field shape |
| AI-03 | P0 | Preview → **Keep current** | No mutation |
| AI-04 | P0 | Preview → **Try another** | Same path targeted; prior suggestion cleared |
| AI-05 | P0 | Staff edit after AI fill | Field marked edited; bulk AI respects protection |
| AI-06 | P0 | **Lock / Unlock** field | Locked blocks AI overwrite; unlock restores prior review state |
| AI-07 | P1 | **Confirm field** | Removes from AI review count |
| AI-08 | P1 | **Fill missing** (bulk) | Only empty/unprotected AI-eligible fields change |
| AI-09 | P0 | Clear an AI-filled scalar (e.g. Season / holiday) | No INFERRED/From video badge while empty; Generate available; review count drops |
| AI-10 | P1 | Staff Verified workflow | Verification gate behaves; publish warning when unverified |

### Granular nested fields (spot-check each)

Instruction section title, step text, ingredient group/name/amount/notes, FAQ question/answer, key ingredient name/explanation, image alt.

**Expected:** Current value = scalar only; Apply mutates only the targeted path.

---

## Completeness / Review Navigation

| ID | Priority | Steps | Expected |
|---|---|---|---|
| COMP-01 | P0 | Empty required field | Blocking missing; appears in issue navigator |
| COMP-02 | P0 | Populated unreviewed AI content | Counts as review; highlight navigates correctly |
| COMP-03 | P0 | Staff-edited content | Not counted as AI review |
| COMP-04 | P0 | Confirmed / locked content | Not counted as AI review |
| COMP-05 | P1 | FAQ: question + empty answer | Partial / recommended attention only |
| COMP-06 | P1 | Key ingredient: name + empty explanation | Partial / recommended attention only |
| COMP-07 | P1 | Optional empty Notes | Not publication-blocking |
| COMP-08 | P1 | Missing canonical timestamp | Chapter attention only; not generic required-field missing |
| COMP-09 | P0 | Tab badges vs AI Assistant vs issue navigator | Same counts from central evaluator |

---

## Instructions / Chapters

| ID | Priority | Steps | Expected |
|---|---|---|---|
| INST-01 | P0 | Accordion expand/collapse / reorder | Sections reorder; steps intact |
| INST-02 | P0 | Nested AI on section title and step | Scalar paths; no whole-array current value |
| INST-03 | P0 | Optional End blank | No validation error |
| INST-04 | P0 | End ≤ start | Error on that section only |
| INST-05 | P0 | Clear invalid End | Error clears; no leak to other sections |
| INST-06 | P1 | Non-monotonic / duplicate starts | Warnings shown; export does not hide bad order |
| INST-07 | P1 | Blank chapterLabel | Falls back to section title in export preview |
| INST-08 | P1 | Explicit chapterLabel override | Visible; swap warning when adjacent labels reversed |
| INST-09 | P1 | Clear both overrides | Requires explicit user action |

---

## Video Workspace

| ID | Priority | Steps | Expected |
|---|---|---|---|
| VID-01 | P0 | Open verification workspace | Player loads; canonical timestamps visible |
| VID-02 | P0 | Play / Set start from playhead | Updates targeted section start |
| VID-03 | P1 | Set / clear end timestamp | Validation rules above hold |
| VID-04 | P2 | Sticky layout on narrow viewport | Controls remain usable |

---

## AI Timestamp Suggestions

| ID | Priority | Steps | Expected |
|---|---|---|---|
| TS-01 | P0 | Generate suggestions | Recipe timestamps unchanged until Apply Selected |
| TS-02 | P0 | Play suggestion | Seeks player; no auto-apply |
| TS-03 | P0 | Apply Selected | Only chosen paths update; provenance recorded |
| TS-04 | P1 | Stale batch after canonical edit | Regenerate required; old batch not silently applied |

---

## YouTube Chapter Sync

**Do not run live YouTube writes during routine QA unless explicitly scheduled.**

| ID | Priority | Steps | Expected |
|---|---|---|---|
| YT-01 | P0 | Preview chapters (Owner A) | Before/after description; no automatic write |
| YT-02 | P0 | Already in sync | Update disabled; no API write |
| YT-03 | P0 | Remote description drift since preview | Apply blocked; user must refresh preview |
| YT-04 | P0 | Canonical / linked-video drift | Apply blocked |
| YT-05 | P0 | Editor A attempts apply | Denied server-side |
| YT-06 | P1 | OAuth permission missing | Clear guidance; no token in browser |
| YT-07 | P1 | Refresh linked-video metadata | Canonical instruction chapters preserved |
| YT-08 | P1 | Apply modal UX | Loading, success, error, partial-success feedback |
| YT-09 | P1 | Feature flag off (`YOUTUBE_CHAPTER_SYNC_ENABLED` unset) | Sync UI disabled |

Metadata preservation on write (when enabled): title, categoryId, tags, defaultLanguage unchanged; description only intentionally changes.

---

## Public Recipe

| ID | Priority | Steps | Expected |
|---|---|---|---|
| PUB-01 | P0 | Published recipe page | Loads; hero and content render |
| PUB-02 | P0 | Canonical Watch links | Match instruction chapter timestamps |
| PUB-03 | P1 | Unmapped instruction section | Sensible fallback (no broken watch link) |
| PUB-04 | P1 | “In this video” section | Renders when data present |
| PUB-05 | P2 | Print / mobile layout | Readable; no major overlap |

---

## Admin Navigation (Editor vs Audience)

| ID | Priority | Steps | Expected |
|---|---|---|---|
| NAV-01 | P0 | Editor A sidebar | Recipes, types, categories, **Series**, reviews, YouTube |
| NAV-02 | P0 | Audience A sidebar | Members, visitors, YouTube only — **no Series** |

Series routes require `content` access (`requireAccess("content")`).

---

## Maintenance Notes

- **`scripts/` TypeScript exclusion:** Local one-off QA/smoke scripts are intentionally excluded from root `tsc` so production typecheck stays deterministic. Run scripts with `tsx` directly; do not commit ad-hoc scripts to the production tree.
- **Automated baseline:** `npm test` should be fully green after stabilization; chapter/sync paths covered by unit tests with mocks only.
