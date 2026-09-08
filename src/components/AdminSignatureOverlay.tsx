'use client';

import React, { useState } from 'react';
import { SignaturePad } from './SignaturePad';
import { PrintedNameForm } from './PrintedNameForm';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface AdminSignatureOverlayProps {
  hasSignature: boolean;
  signaturePreviewUrl?: string | null;
  lastUpdatedAt?: string | null;
  onSaveSignatureAction: (formData: FormData) => Promise<{ success?: boolean; error?: string }>;
  /**
   * Admins are also an approver step (final sign-off), so they need the same printed
   * name FR-11 composites onto the PDF -- but only a plain 'admin', not system_admin
   * (system_admin doesn't act as a routing-template approver). Optional so this overlay
   * still works if the caller doesn't wire it up; the page decides who gets it.
   */
  currentFullName?: string | null;
  onSaveNameAction?: (fullName: string) => Promise<{ success?: boolean; error?: string }>;
}

export function AdminSignatureOverlay({
  hasSignature,
  signaturePreviewUrl,
  lastUpdatedAt,
  onSaveSignatureAction,
  currentFullName,
  onSaveNameAction,
}: AdminSignatureOverlayProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Top Right Trigger Button */}
      <Button
        type="button"
        variant="outline"
        onClick={() => setIsOpen(true)}
        title="View or update your digital signature stamp"
        className={
          hasSignature
            ? ''
            : 'border-status-in-review/40 bg-status-in-review/10 text-status-in-review-text font-bold hover:bg-status-in-review/20'
        }
      >
        {hasSignature ? (
          <>
            <span className="flex h-2 w-2 relative">
              <span className="relative inline-flex rounded-full h-2 w-2 bg-status-approved"></span>
            </span>
            <svg className="w-4 h-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            <span>My Signature</span>
          </>
        ) : (
          <>
            <svg className="w-4 h-4 text-status-in-review-text" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>Enroll Signature</span>
          </>
        )}
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden">
          <DialogHeader className="flex-row items-center gap-2.5 px-6 py-4 border-b border-border-default bg-surface-muted space-y-0">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${hasSignature ? 'bg-status-approved/10 text-status-approved-text' : 'bg-status-in-review/20 text-status-in-review-text'}`}>
              {hasSignature ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              )}
            </div>
            <div>
              <DialogTitle>Admin Digital Signature</DialogTitle>
              <p className="text-[11px] text-text-muted">
                This signature stamp will be composited onto approved documents.
              </p>
            </div>
          </DialogHeader>

          <div className="p-6 max-h-[80vh] overflow-y-auto space-y-6">
            {onSaveNameAction && (
              <PrintedNameForm
                currentName={currentFullName ?? null}
                onSaveNameAction={onSaveNameAction}
              />
            )}
            <SignaturePad
              currentSignatureUrl={signaturePreviewUrl}
              lastUpdatedAt={lastUpdatedAt}
              onSaveSignature={async (formData) => {
                const res = await onSaveSignatureAction(formData);
                if (res.success) {
                  setIsOpen(false);
                }
                return res;
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
