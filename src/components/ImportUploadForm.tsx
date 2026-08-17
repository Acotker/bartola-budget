"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { uploadImportAction } from "@/app/import-actions";

export function ImportUploadForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsSign, setNeedsSign] = useState(false);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function submit(signConvention?: "negative-is-spend" | "positive-is-spend") {
    if (!file) return;
    setError(null);
    setBusy(true);
    const fd = new FormData();
    fd.set("file", file);
    if (signConvention) fd.set("signConvention", signConvention);

    const result = await uploadImportAction(fd);
    setBusy(false);

    if (result.ok) {
      startTransition(() => router.push(`/import/${result.uploadId}`));
      return;
    }
    if (result.kind === "signAmbiguous") {
      setNeedsSign(true);
      return;
    }
    setError(result.message);
  }

  const working = busy || pending;

  return (
    <div className="mt-6 flex flex-col gap-4">
      <label className="border-line bg-card flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed px-4 py-8 text-center">
        <span className="text-ink text-sm font-bold">
          {file ? file.name : "Choose a CSV file"}
        </span>
        <span className="text-muted text-xs">
          {file
            ? `${(file.size / 1024).toFixed(0)} KB · tap to pick a different file`
            : "Export from your bank or card, up to 5MB"}
        </span>
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setError(null);
            setNeedsSign(false);
          }}
        />
      </label>

      {error && (
        <p className="border-alert/30 bg-alert/5 text-alert rounded-xl border px-4 py-3 text-sm">
          {error}
        </p>
      )}

      {needsSign ? (
        // Surfacing ambiguity costs one tap; guessing would invert the whole file.
        <div className="border-line bg-card rounded-2xl border p-4">
          <p className="text-ink text-sm font-bold">One quick question</p>
          <p className="text-muted mt-1 text-sm leading-6">
            In this file, does money leaving your account show up as negative or
            positive numbers?
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <button
              type="button"
              disabled={working}
              onClick={() => submit("negative-is-spend")}
              className="bg-primary flex h-11 items-center justify-center rounded-full text-sm font-bold text-white disabled:opacity-40"
            >
              Negative, like −12.40
            </button>
            <button
              type="button"
              disabled={working}
              onClick={() => submit("positive-is-spend")}
              className="border-line bg-surface text-ink flex h-11 items-center justify-center rounded-full border text-sm font-bold disabled:opacity-40"
            >
              Positive, like 12.40
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={!file || working}
          onClick={() => submit()}
          className="bg-primary font-heading flex h-14 items-center justify-center rounded-full text-base font-semibold text-white shadow-lg active:scale-[0.98] disabled:opacity-40"
        >
          {working ? "Reading your file…" : "Find recurring spends"}
        </button>
      )}

      <Link
        href="/programs"
        className="text-muted flex h-10 items-center justify-center text-sm font-bold"
      >
        Cancel
      </Link>
    </div>
  );
}
