import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEV_YOUTUBE_ALIAS_BLOB, DEV_YOUTUBE_FIXTURE } from "../data/dev-youtube-fixture.ts";
import {
  applyRawYoutubeMetadataJson,
  emptyYoutubeMetadataEditorState,
  formatTimestampInput,
  parseTimestampInput,
  serializeYoutubeMetadataEditorState,
  validateYoutubeMetadataEditorState,
  youtubeMetadataEditorHasContent,
  youtubeMetadataToEditorState,
} from "./youtube-metadata-editor.ts";

describe("youtube-metadata-editor", () => {
  it("loads legacy JSON blob into structured editor state", () => {
    const state = youtubeMetadataToEditorState(DEV_YOUTUBE_FIXTURE);
    assert.equal(state.hook, DEV_YOUTUBE_FIXTURE.hook);
    assert.equal(state.timestamps.length, 2);
    assert.equal(state.timestamps[0]?.timeInput, "00:45");
    assert.equal(state.relatedVideos.length, 3);
  });

  it("loads alias keys and preserves non-structured fields", () => {
    const state = youtubeMetadataToEditorState(DEV_YOUTUBE_ALIAS_BLOB);
    assert.equal(state.hook, "Section copy from alias.");
    assert.equal(state.timestamps[0]?.timeInput, "00:45");
    assert.equal(state.preserved.videoId, "dQw4w9WgXcQ");
  });

  it("round-trips structured edits without losing preserved fields", () => {
    const initial = youtubeMetadataToEditorState(DEV_YOUTUBE_FIXTURE);
    initial.timestamps.push({ timeInput: "02:30", label: "Finishing touches" });
    const blob = serializeYoutubeMetadataEditorState(initial);
    assert.ok(blob);
    const reloaded = youtubeMetadataToEditorState(blob);
    assert.equal(reloaded.timestamps.length, 3);
    assert.equal(reloaded.timestamps[2]?.label, "Finishing touches");
    assert.equal(parseTimestampInput(reloaded.timestamps[2]?.timeInput ?? ""), 150);
  });

  it("parses and formats timestamp inputs", () => {
    assert.equal(parseTimestampInput("00:13"), 13);
    assert.equal(parseTimestampInput("1:02:03"), 3723);
    assert.equal(parseTimestampInput("45"), 45);
    assert.equal(formatTimestampInput(13), "00:13");
    assert.equal(formatTimestampInput(3723), "1:02:03");
  });

  it("validates partial chapter rows", () => {
    const state = emptyYoutubeMetadataEditorState();
    state.timestamps = [{ timeInput: "00:13", label: "" }];
    const issues = validateYoutubeMetadataEditorState(state);
    assert.ok(issues.some((issue) => issue.path.endsWith(".label")));
  });

  it("applies raw JSON after validation", () => {
    const current = emptyYoutubeMetadataEditorState();
    const result = applyRawYoutubeMetadataJson(
      current,
      JSON.stringify({
        hook: "From raw JSON",
        timestamps: [{ time: 13, label: "Start" }],
      }),
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.state.hook, "From raw JSON");
      assert.equal(result.state.timestamps[0]?.label, "Start");
    }
  });

  it("rejects invalid raw JSON", () => {
    const result = applyRawYoutubeMetadataJson(emptyYoutubeMetadataEditorState(), "{bad");
    assert.equal(result.ok, false);
  });

  it("detects empty editor state", () => {
    assert.equal(youtubeMetadataEditorHasContent(emptyYoutubeMetadataEditorState()), false);
    const state = emptyYoutubeMetadataEditorState();
    state.hook = "Hello";
    assert.equal(youtubeMetadataEditorHasContent(state), true);
  });
});
