import React from 'react';

interface ProgressBarProps {
  completed: number;
  total: number;
  label?: string;
  className?: string;
}

export function ProgressBar({ completed, total, label, className = '' }: ProgressBarProps) {
  const safeTotal = Math.max(0, total);
  const safeCompleted = Math.max(0, Math.min(completed, safeTotal));
  const percentage = safeTotal > 0 ? Math.round((safeCompleted / safeTotal) * 100) : 0;

  return (
    <div className={`flex flex-col sm:items-end gap-1.5 min-w-[160px] ${className}`}>
      <div className="flex items-center gap-2 text-xs font-semibold text-text-primary">
        <span>{label ?? `${safeCompleted} / ${safeTotal} Completed`}</span>
        <span className="text-[11px] font-mono text-text-muted font-normal">({percentage}%)</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={safeCompleted}
        aria-valuemin={0}
        aria-valuemax={safeTotal}
        aria-label={`${safeCompleted} of ${safeTotal} requirements completed`}
        className="w-full sm:w-36 h-2 rounded-full bg-border-default overflow-hidden"
      >
        <div
          className="h-full bg-brand-accent rounded-full transition-all duration-300 ease-in-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
