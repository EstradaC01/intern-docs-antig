'use client';

import React, { useRef, useState, useEffect } from 'react';
import { ConfirmAction } from '@/components/ConfirmAction';
import { Button } from '@/components/ui/button';

interface SignaturePadProps {
  currentSignatureUrl?: string | null;
  lastUpdatedAt?: string | null;
  onSaveSignature: (formData: FormData) => Promise<{ success?: boolean; error?: string }>;
  onSuccess?: () => void;
}

export function SignaturePad({
  currentSignatureUrl,
  lastUpdatedAt,
  onSaveSignature,
  onSuccess,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [mode, setMode] = useState<'canvas' | 'upload'>('canvas');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);
  const [removeBackground, setRemoveBackground] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  // Revoke the object URL created for an uploaded-file preview once it's no longer needed.
  useEffect(() => {
    return () => {
      if (pendingPreviewUrl && mode === 'upload') URL.revokeObjectURL(pendingPreviewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPreviewUrl]);

  // Computes the dropzone's immediate preview (shown as soon as a file is picked, before the
  // user clicks "Update Signature") -- including a live preview of background removal, using
  // the same luminance-to-alpha rule as the server (lib/data/signatures.ts:removeWhiteBackground),
  // so what's shown here is what actually gets saved.
  useEffect(() => {
    if (!uploadFile) return; // uploadPreviewUrl is cleared wherever uploadFile is nulled

    let cancelled = false;
    const objectUrl = URL.createObjectURL(uploadFile);

    // Always resolve the preview through the Image element's async load callback (even when
    // background removal is off) so every setUploadPreviewUrl call here happens in response to
    // that external event, not synchronously in the effect body.
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      if (!removeBackground) {
        setUploadPreviewUrl(objectUrl);
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx || canvas.width === 0 || canvas.height === 0) {
        setUploadPreviewUrl(objectUrl);
        return;
      }
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imageData.data;
      for (let i = 0; i < d.length; i += 4) {
        const luminance = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const backgroundAlpha = Math.max(0, Math.min(255, Math.round(255 - luminance)));
        d[i + 3] = Math.min(d[i + 3], backgroundAlpha);
      }
      ctx.putImageData(imageData, 0, 0);
      setUploadPreviewUrl(canvas.toDataURL('image/png'));
    };
    img.onerror = () => {
      if (!cancelled) setUploadPreviewUrl(objectUrl);
    };
    img.src = objectUrl;

    return () => {
      cancelled = true;
      URL.revokeObjectURL(objectUrl);
    };
  }, [uploadFile, removeBackground]);

  // Canvas drawing setup
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set high-DPI scaling
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [mode]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    setHasDrawn(true);
    setErrorMsg(null);

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    setErrorMsg(null);
  };

  const ACCEPTED_SIGNATURE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

  const handleFileUploadChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!ACCEPTED_SIGNATURE_TYPES.includes(file.type)) {
        setErrorMsg('Please select a PNG, JPG, WebP, or SVG image.');
        setUploadFile(null);
        setUploadPreviewUrl(null);
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        setErrorMsg('File size must be under 2 MB.');
        setUploadFile(null);
        setUploadPreviewUrl(null);
        return;
      }
      setUploadFile(file);
      setErrorMsg(null);
    }
  };

  // Validates the captured signature and opens the confirm-with-preview dialog;
  // the actual save only happens from handleConfirmSave below.
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (mode === 'canvas') {
      const canvas = canvasRef.current;
      if (!canvas || !hasDrawn) {
        setErrorMsg('Please draw your signature before saving.');
        return;
      }
      setPendingPreviewUrl(canvas.toDataURL('image/png'));
    } else {
      if (!uploadFile) {
        setErrorMsg('Please choose a PNG, JPG, WebP, or SVG signature file to upload.');
        return;
      }
      // Reuse the dropzone's own preview (already reflects background removal, if enabled)
      // instead of building a fresh one from the raw file, so the confirm dialog matches
      // exactly what's about to be saved.
      setPendingPreviewUrl(uploadPreviewUrl);
    }

    setConfirmError(null);
    setConfirmOpen(true);
  };

  const handleConfirmSave = async () => {
    const formData = new FormData();

    if (mode === 'canvas') {
      const canvas = canvasRef.current;
      if (!canvas) return;
      formData.set('signature_data', canvas.toDataURL('image/png'));
    } else {
      if (!uploadFile) return;
      formData.set('file', uploadFile);
      formData.set('remove_background', String(removeBackground));
    }

    setIsSaving(true);
    setConfirmError(null);
    try {
      const res = await onSaveSignature(formData);
      if (res.error) throw new Error(res.error);

      setConfirmOpen(false);
      setSuccessMsg('Signature enrolled successfully!');
      if (onSuccess) {
        onSuccess();
      } else {
        setTimeout(() => {
          window.location.reload();
        }, 1200);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save signature.';
      setConfirmError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Existing Enrolled Signature Card */}
      {currentSignatureUrl && (
        <div className="bg-surface-bg border border-border-default rounded-xl p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-text-primary">Currently Enrolled Signature</h3>
              <p className="text-xs text-text-muted">
                Last updated:{' '}
                {lastUpdatedAt
                  ? new Date(lastUpdatedAt).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                  : 'N/A'}
              </p>
            </div>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-status-approved/10 text-status-approved-text border border-status-approved/30">
              <span className="h-1.5 w-1.5 rounded-full bg-status-approved" />
              Active
            </span>
          </div>

          <div className="h-28 bg-surface-muted border border-dashed border-border-default rounded-lg flex items-center justify-center p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentSignatureUrl}
              alt="Enrolled Signature Preview"
              className="max-h-full max-w-full object-contain filter drop-shadow-xs"
            />
          </div>
        </div>
      )}

      {/* Signature Enrollment / Update Form */}
      <div className="bg-surface-bg border border-border-default rounded-xl p-6 shadow-xs">
        <div className="flex items-center justify-between pb-4 border-b border-border-default mb-4">
          <div>
            <h3 className="text-base font-bold text-text-primary">
              {currentSignatureUrl ? 'Update Signature' : 'Enroll Digital Signature'}
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
              Draw on screen or upload a PNG, JPG, WebP, or SVG image (&lt; 2 MB). Stamped onto approved PDFs. PNG or SVG with a transparent background looks best.
            </p>
          </div>

          {/* Mode Tabs */}
          <div role="tablist" aria-label="Signature input method" className="flex bg-surface-muted rounded-lg p-1 border border-border-default text-xs">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'canvas'}
              onClick={() => { setMode('canvas'); setErrorMsg(null); }}
              className={`px-3 py-1 rounded-md font-semibold transition-colors ${mode === 'canvas' ? 'bg-surface-bg text-brand-primary shadow-xs' : 'text-text-muted hover:text-text-primary'
                }`}
            >
              Draw
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'upload'}
              onClick={() => { setMode('upload'); setErrorMsg(null); }}
              className={`px-3 py-1 rounded-md font-semibold transition-colors ${mode === 'upload' ? 'bg-surface-bg text-brand-primary shadow-xs' : 'text-text-muted hover:text-text-primary'
                }`}
            >
              Upload Image
            </button>
          </div>
        </div>

        {errorMsg && (
          <div role="alert" className="mb-4 rounded-lg bg-status-returned/10 p-3 text-xs text-status-returned-text border border-status-returned/30">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div role="status" className="mb-4 rounded-lg bg-status-approved/10 p-3 text-xs text-status-approved-text border border-status-approved/30">
            {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'canvas' ? (
            <div>
              <div className="relative border-2 border-dashed border-border-strong rounded-xl bg-surface-muted overflow-hidden touch-none">
                <canvas
                  ref={canvasRef}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  className="w-full h-44 cursor-crosshair block"
                />
                {!hasDrawn && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-xs text-text-muted font-medium">
                    Sign here with your mouse, stylus, or finger
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center mt-2">
                <span className="text-[11px] text-text-muted">
                  Make sure your signature is clear and centered.
                </span>
                <Button type="button" variant="ghost" size="sm" onClick={clearCanvas} className="text-status-returned hover:text-status-returned-text hover:bg-status-returned/10">
                  Clear Canvas
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <div className="border-2 border-dashed border-border-default hover:border-brand-primary rounded-xl p-6 text-center cursor-pointer transition-colors bg-surface-muted">
                <input
                  type="file"
                  id="sig-file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={handleFileUploadChange}
                  className="hidden"
                />
                <label htmlFor="sig-file" className="cursor-pointer flex flex-col items-center">
                  {uploadFile && uploadPreviewUrl ? (
                    <>
                      <div className="h-20 w-full flex items-center justify-center mb-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={uploadPreviewUrl}
                          alt="Selected signature preview"
                          className="max-h-full max-w-full object-contain filter drop-shadow-xs"
                        />
                      </div>
                      <span className="text-xs font-semibold text-text-primary">{uploadFile.name}</span>
                      <span className="text-[11px] text-text-muted mt-1">Click to choose a different image</span>
                    </>
                  ) : (
                    <>
                      <svg className="h-10 w-10 text-brand-primary mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="text-xs font-semibold text-text-primary">Click to select a signature image</span>
                      <span className="text-[11px] text-text-muted mt-1">PNG, JPG, WebP, or SVG (Max 2 MB)</span>
                    </>
                  )}
                </label>
              </div>

              <label className="flex items-start gap-2 mt-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={removeBackground}
                  onChange={(e) => setRemoveBackground(e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 rounded border-border-default text-brand-primary focus:ring-brand-primary"
                />
                <span className="text-[11px] text-text-muted leading-snug">
                  <span className="font-semibold text-text-primary">Automatically remove background.</span>{' '}
                  Best for a photo or scan of your signature on plain white or light paper. Turn this off if your
                  image already has a transparent background, or if the background isn&apos;t plain white/light
                  (the preview above shows exactly what will be saved either way).
                </span>
              </label>
            </div>
          )}

          <div className="flex justify-end pt-3 border-t border-border-default">
            <Button type="submit">
              {currentSignatureUrl ? 'Update Signature' : 'Save Signature'}
            </Button>
          </div>
        </form>
      </div>

      <ConfirmAction
        open={confirmOpen}
        onOpenChange={(next) => {
          if (isSaving) return;
          setConfirmOpen(next);
          if (!next && pendingPreviewUrl && mode === 'upload') {
            URL.revokeObjectURL(pendingPreviewUrl);
            setPendingPreviewUrl(null);
          }
        }}
        title={currentSignatureUrl ? 'Replace your enrolled signature?' : 'Save this signature?'}
        description={
          currentSignatureUrl
            ? 'This replaces the signature stamp used on every approval you sign from now on. Approvals you already signed keep their original stamp.'
            : 'This is the stamp that will be composited onto documents when you approve them.'
        }
        confirmLabel={currentSignatureUrl ? 'Replace Signature' : 'Save Signature'}
        isLoading={isSaving}
        loadingLabel="Saving…"
        error={confirmError}
        onConfirm={handleConfirmSave}
      >
        {pendingPreviewUrl && (
          <div>
            <span className="block text-[10px] uppercase font-bold text-text-muted mb-1.5">
              Preview — approximate size as stamped on an approved document:
            </span>
            <div className="h-24 flex items-center justify-center bg-surface-muted rounded-lg border border-dashed border-border-strong p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pendingPreviewUrl}
                alt="Signature preview"
                className="max-h-full max-w-[220px] object-contain filter drop-shadow-xs"
              />
            </div>
          </div>
        )}
      </ConfirmAction>
    </div>
  );
}
