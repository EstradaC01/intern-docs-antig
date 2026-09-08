'use client';

import React from 'react';
import { AlertTriangle, Loader2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface DocumentPreviewProps {
  fileUrl: string | null;
  isLoadingFile?: boolean;
  error?: string | null;
  title: string;
  onDownload?: () => void;
  downloadFileName?: string;
  className?: string;
}

export function isImageFileUrl(fileUrl: string | null): boolean {
  return Boolean(
    fileUrl &&
      (/\.(jpeg|jpg|png|webp|gif)(\?|$)/i.test(fileUrl) ||
        fileUrl.includes('image/') ||
        fileUrl.includes('image%2F'))
  );
}

const DEFAULT_CLASS_NAME =
  'flex-1 h-full min-h-[360px] bg-surface-muted p-1 sm:p-2 overflow-hidden flex items-center justify-center relative';

export function DocumentPreview({
  fileUrl,
  isLoadingFile = false,
  error = null,
  title,
  onDownload,
  downloadFileName,
  className = DEFAULT_CLASS_NAME,
}: DocumentPreviewProps) {
  const isImage = isImageFileUrl(fileUrl);

  const handleDownloadClick = () => {
    if (onDownload) {
      onDownload();
      return;
    }
    if (fileUrl) {
      const a = document.createElement('a');
      a.href = fileUrl;
      a.download = downloadFileName || 'document.pdf';
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  return (
    <div className={className}>
      {isLoadingFile ? (
        <div className="flex flex-col items-center gap-2 text-text-muted">
          <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
          <span className="text-xs font-medium">Generating secure document preview…</span>
        </div>
      ) : error ? (
        <div
          role="alert"
          className="max-w-md p-6 bg-surface-bg rounded-xl border border-status-returned/30 text-center space-y-3"
        >
          <AlertTriangle className="h-8 w-8 text-status-returned mx-auto" />
          <h4 className="text-sm font-bold text-status-returned-text">Preview Unavailable</h4>
          <p className="text-xs text-status-returned-text">{error}</p>
          {fileUrl && (
            <Button size="sm" onClick={handleDownloadClick} className="mt-2 gap-1.5">
              <Download className="h-3.5 w-3.5" />
              Download File Instead
            </Button>
          )}
        </div>
      ) : fileUrl ? (
        isImage ? (
          <div className="w-full h-full overflow-auto flex items-center justify-center p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={fileUrl}
              alt={title}
              className="max-h-full max-w-full object-contain rounded shadow-xs bg-white"
            />
          </div>
        ) : (
          <iframe
            src={fileUrl}
            title={title}
            className="w-full h-full rounded-lg border border-border-default bg-white shadow-xs"
          />
        )
      ) : (
        <div className="text-xs text-text-muted text-center p-6">
          No document file available to preview.
        </div>
      )}
    </div>
  );
}
