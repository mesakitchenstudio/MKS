"use client";

import { useState } from "react";
import { createRecipeFromYoutubeVideoAction } from "@/app/admin/actions";
import { adminFocusRing, adminPrimaryButtonClass } from "@/lib/admin-ui";

const secondaryBtn =
  "inline-flex items-center justify-center rounded-sm border border-line bg-paper px-3 py-1.5 text-sm font-semibold text-muted transition-colors duration-150 motion-reduce:transition-none hover:bg-cream hover:text-terracotta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

type RecipeTypeOption = { id: string; name: string };

type DetectionState =
  | { phase: "idle" }
  | { phase: "detecting" }
  | {
      phase: "ready";
      typeId: string;
      typeName: string;
      confidence: "HIGH" | "MEDIUM";
      reasoning?: string;
      manual: boolean;
    }
  | {
      phase: "manual";
      message: string;
    };

function confidenceLabel(confidence: "HIGH" | "MEDIUM") {
  return confidence === "HIGH" ? "High confidence" : "Medium confidence";
}

export function CreateRecipeFromYoutubeVideo({
  videoId,
  recipeTypes,
  disabled = false,
}: {
  videoId: string;
  recipeTypes: RecipeTypeOption[];
  disabled?: boolean;
}) {
  const [state, setState] = useState<DetectionState>({ phase: "idle" });
  const [typeId, setTypeId] = useState("");
  const [typeSource, setTypeSource] = useState<"ai" | "manual">("manual");
  const [typeConfidence, setTypeConfidence] = useState<"HIGH" | "MEDIUM" | "LOW">("LOW");
  const [showTypePicker, setShowTypePicker] = useState(false);

  async function startDetection() {
    setState({ phase: "detecting" });
    try {
      const response = await fetch("/api/admin/youtube/classify-recipe-type", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        recipeTypeId?: string;
        recipeTypeName?: string;
        confidence?: "HIGH" | "MEDIUM" | "LOW";
        reasoning?: string;
        message?: string;
      };

      if (response.ok && data.ok && data.recipeTypeId && data.recipeTypeName && data.confidence) {
        setTypeId(data.recipeTypeId);
        setTypeSource("ai");
        setTypeConfidence(data.confidence);
        setShowTypePicker(false);
        setState({
          phase: "ready",
          typeId: data.recipeTypeId,
          typeName: data.recipeTypeName,
          confidence: data.confidence === "HIGH" ? "HIGH" : "MEDIUM",
          reasoning: data.reasoning,
          manual: false,
        });
        return;
      }

      setTypeId("");
      setTypeSource("manual");
      setTypeConfidence("LOW");
      setShowTypePicker(true);
      setState({
        phase: "manual",
        message: data.message || "AI could not confidently determine the recipe type.",
      });
    } catch {
      setTypeId("");
      setTypeSource("manual");
      setTypeConfidence("LOW");
      setShowTypePicker(true);
      setState({
        phase: "manual",
        message: "Could not detect recipe type automatically. Select one manually.",
      });
    }
  }

  function openManualPicker() {
    setShowTypePicker(true);
    setTypeSource("manual");
    setTypeConfidence("LOW");
    if (state.phase === "ready") {
      setState({ ...state, manual: true });
    }
  }

  function onTypeChange(nextTypeId: string) {
    setTypeId(nextTypeId);
    setTypeSource("manual");
    setTypeConfidence("LOW");
    if (state.phase === "ready") {
      setState({ ...state, manual: true, typeId: nextTypeId });
    }
  }

  if (disabled) {
    return <p className="text-sm text-muted">This video is already linked to a recipe.</p>;
  }

  if (!recipeTypes.length) {
    return <p className="text-sm text-muted">Add a recipe type before creating recipes.</p>;
  }

  if (state.phase === "idle") {
    return (
      <button
        type="button"
        className={`${adminPrimaryButtonClass} ${adminFocusRing}`}
        onClick={() => void startDetection()}
      >
        Create recipe
      </button>
    );
  }

  if (state.phase === "detecting") {
    return <p className="text-sm text-muted">Detecting recipe type…</p>;
  }

  const selectedTypeName =
    recipeTypes.find((type) => type.id === typeId)?.name ||
    (state.phase === "ready" ? state.typeName : "");

  return (
    <div className="space-y-4">
      <div className="rounded-sm border border-line bg-cream/30 px-4 py-3 text-sm">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">Recipe type</p>
        {state.phase === "ready" && !showTypePicker ? (
          <>
            <p className="mt-2 font-medium text-ink">{state.typeName}</p>
            <p className="mt-1 text-xs text-olive">
              ✓ AI detected — {confidenceLabel(state.confidence)}
            </p>
            {state.reasoning ? <p className="mt-1 text-xs text-muted">{state.reasoning}</p> : null}
          </>
        ) : (
          <>
            <p className="mt-2 text-muted">
              {state.phase === "manual" ? state.message : "Choose the Mesa recipe type for this draft."}
            </p>
            <label className="mt-3 grid gap-1">
              <span className="text-xs font-semibold text-ink">Select recipe type</span>
              <select
                value={typeId}
                onChange={(event) => onTypeChange(event.target.value)}
                className="h-10 min-w-[14rem] rounded-sm border border-line bg-paper px-3 text-sm outline-none focus:border-olive focus:ring-2 focus:ring-olive/15"
              >
                <option value="">Select recipe type…</option>
                {recipeTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>

      <form action={createRecipeFromYoutubeVideoAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="videoId" value={videoId} />
        <input type="hidden" name="typeId" value={typeId} />
        <input type="hidden" name="typeSource" value={typeSource} />
        <input type="hidden" name="typeConfidence" value={typeConfidence} />
        <button
          type="submit"
          disabled={!typeId}
          className={`${adminPrimaryButtonClass} ${adminFocusRing} disabled:cursor-not-allowed disabled:opacity-60`}
        >
          Create draft recipe
        </button>
        {state.phase === "ready" && !showTypePicker ? (
          <button type="button" className={`${secondaryBtn} ${adminFocusRing}`} onClick={openManualPicker}>
            Change type
          </button>
        ) : null}
        <button
          type="button"
          className={`${secondaryBtn} ${adminFocusRing}`}
          onClick={() => {
            setState({ phase: "idle" });
            setTypeId("");
            setShowTypePicker(false);
          }}
        >
          Cancel
        </button>
      </form>

      {selectedTypeName && typeId ? (
        <p className="text-xs text-muted">Draft will use the {selectedTypeName} field schema.</p>
      ) : null}
    </div>
  );
}
