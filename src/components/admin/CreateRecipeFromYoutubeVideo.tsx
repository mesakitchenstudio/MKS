"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { adminFocusRing, adminPrimaryButtonClass } from "@/lib/admin-ui";

const secondaryBtn =
  "inline-flex items-center justify-center rounded-sm border border-line bg-paper px-3 py-1.5 text-sm font-semibold text-muted transition-colors duration-150 motion-reduce:transition-none hover:bg-cream hover:text-terracotta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

type RecipeTypeOption = { id: string; name: string };

type DetectionState =
  | { phase: "idle" }
  | { phase: "detecting" }
  | { phase: "creating" }
  | { phase: "analyzing" }
  | { phase: "opening" }
  | {
      phase: "ready";
      typeId: string;
      typeName: string;
      confidence: "HIGH" | "MEDIUM";
      reasoning?: string;
    }
  | {
      phase: "manual";
      message: string;
      typeId?: string;
      typeName?: string;
    }
  | { phase: "error"; message: string };

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
  const router = useRouter();
  const [state, setState] = useState<DetectionState>({ phase: "idle" });
  const [typeId, setTypeId] = useState("");
  const [typeSource, setTypeSource] = useState<"ai" | "manual">("manual");
  const [typeConfidence, setTypeConfidence] = useState<"HIGH" | "MEDIUM" | "LOW">("LOW");
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [busy, setBusy] = useState(false);

  async function createAndOpen(
    nextTypeId: string,
    nextSource: "ai" | "manual",
    nextConfidence: "HIGH" | "MEDIUM" | "LOW",
  ) {
    setBusy(true);
    setState({ phase: "creating" });
    try {
      setState({ phase: "analyzing" });
      const response = await fetch("/api/admin/youtube/create-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "create",
          videoId,
          typeId: nextTypeId,
          typeSource: nextSource,
          typeConfidence: nextConfidence,
        }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        recipeId?: string;
        analysisOk?: boolean;
        analysisMessage?: string;
        message?: string;
      };

      if (!response.ok || !data.ok || !data.recipeId) {
        setState({
          phase: "error",
          message: data.message || "Could not create draft recipe.",
        });
        setBusy(false);
        return;
      }

      setState({ phase: "opening" });
      const params = new URLSearchParams();
      if (data.analysisOk === false) {
        params.set(
          "aiNotice",
          data.analysisMessage ||
            "Draft created, but AI analysis could not be completed. You can regenerate the analysis or edit the recipe manually.",
        );
      }
      const qs = params.toString();
      router.push(`/admin/recipes/${data.recipeId}${qs ? `?${qs}` : ""}`);
    } catch {
      setState({ phase: "error", message: "Could not create draft recipe." });
      setBusy(false);
    }
  }

  async function startDetection() {
    if (busy) return;
    setBusy(true);
    setState({ phase: "detecting" });
    try {
      const response = await fetch("/api/admin/youtube/create-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "classify", videoId }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        alreadyLinked?: boolean;
        recipeId?: string;
        confidence?: "HIGH" | "MEDIUM" | "LOW";
        recipeTypeId?: string | null;
        recipeTypeName?: string | null;
        reasoning?: string | null;
        message?: string;
        needsTypeConfirmation?: boolean;
      };

      if (data.alreadyLinked && data.recipeId) {
        setState({ phase: "opening" });
        router.push(`/admin/recipes/${data.recipeId}`);
        return;
      }

      if (!response.ok || !data.ok) {
        setTypeId("");
        setTypeSource("manual");
        setTypeConfidence("LOW");
        setShowTypePicker(true);
        setState({
          phase: "manual",
          message: data.message || "AI could not confidently determine the recipe type.",
        });
        setBusy(false);
        return;
      }

      if (data.confidence === "HIGH" && data.recipeTypeId) {
        await createAndOpen(data.recipeTypeId, "ai", "HIGH");
        return;
      }

      setTypeId(data.recipeTypeId || "");
      setTypeSource(data.recipeTypeId ? "ai" : "manual");
      setTypeConfidence(data.confidence === "MEDIUM" ? "MEDIUM" : "LOW");
      setBusy(false);

      if (data.confidence === "MEDIUM" && data.recipeTypeId && data.recipeTypeName) {
        setShowTypePicker(false);
        setState({
          phase: "ready",
          typeId: data.recipeTypeId,
          typeName: data.recipeTypeName,
          confidence: "MEDIUM",
          reasoning: data.reasoning || undefined,
        });
        return;
      }

      setShowTypePicker(true);
      setState({
        phase: "manual",
        message: data.message || "AI could not confidently determine the recipe type.",
        typeId: data.recipeTypeId || undefined,
        typeName: data.recipeTypeName || undefined,
      });
    } catch {
      setTypeId("");
      setTypeSource("manual");
      setTypeConfidence("LOW");
      setShowTypePicker(true);
      setBusy(false);
      setState({
        phase: "manual",
        message: "Could not detect recipe type automatically. Select one manually.",
      });
    }
  }

  function openManualPicker() {
    setShowTypePicker(true);
    setTypeSource("manual");
  }

  function onTypeChange(nextTypeId: string) {
    setTypeId(nextTypeId);
    setTypeSource("manual");
    setTypeConfidence("LOW");
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
  if (state.phase === "creating") {
    return <p className="text-sm text-muted">Creating draft…</p>;
  }
  if (state.phase === "analyzing") {
    return <p className="text-sm text-muted">Analyzing video…</p>;
  }
  if (state.phase === "opening") {
    return <p className="text-sm text-muted">Opening recipe…</p>;
  }
  if (state.phase === "error") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-terracotta">{state.message}</p>
        <button
          type="button"
          className={`${secondaryBtn} ${adminFocusRing}`}
          onClick={() => {
            setState({ phase: "idle" });
            setBusy(false);
          }}
        >
          Try again
        </button>
      </div>
    );
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
              {state.phase === "manual"
                ? state.message
                : "Confirm or change the Mesa recipe type for this draft."}
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

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!typeId || busy}
          className={`${adminPrimaryButtonClass} ${adminFocusRing} disabled:cursor-not-allowed disabled:opacity-60`}
          onClick={() => void createAndOpen(typeId, typeSource, typeConfidence)}
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
            setBusy(false);
          }}
        >
          Cancel
        </button>
      </div>

      {selectedTypeName && typeId ? (
        <p className="text-xs text-muted">Draft will use the {selectedTypeName} field schema.</p>
      ) : null}
    </div>
  );
}
