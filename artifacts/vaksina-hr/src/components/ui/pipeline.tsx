import React from 'react';
import { cn } from '../../lib/utils';
import { PipelineStage, PipelineStageStatus } from '@workspace/api-client-react';
import { Check, X } from 'lucide-react';

interface PipelineProps {
  stages: PipelineStage[];
  className?: string;
  selectedStage?: string | null;
  onSelectStage?: (key: string) => void;
}

export function Pipeline({ stages, className, selectedStage, onSelectStage }: PipelineProps) {
  const getStatusColor = (status: PipelineStageStatus, selected: boolean) => {
    const ring = selected ? 'ring-4 ring-primary/30 scale-110' : '';
    switch (status) {
      case 'completed':
        return cn('bg-emerald-500 border-emerald-500 text-white', ring);
      case 'in_progress':
        return cn('bg-amber-400 border-amber-400 text-white ring-4 ring-amber-200', selected && 'ring-primary/40');
      case 'failed':
        return cn('bg-destructive border-destructive text-white', ring);
      case 'pending':
      default:
        return cn('bg-white border-gray-300 text-muted-foreground', ring);
    }
  };

  const getLineColor = (status: PipelineStageStatus) => {
    if (status === 'completed') return 'bg-emerald-500';
    if (status === 'in_progress') return 'bg-gradient-to-r from-emerald-500 to-amber-300';
    return 'bg-gray-200';
  };

  return (
    <div className={cn('w-full py-8 overflow-x-auto', className)}>
      <div className="flex items-start min-w-max px-2">
        {stages.map((stage, index) => {
          const isLast = index === stages.length - 1;
          const selected = selectedStage === stage.key;
          const clickable = stage.status !== 'pending';

          return (
            <div key={stage.key} className="flex items-start flex-1 min-w-[88px]">
              <div className="flex flex-col items-center w-full relative">
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={() => clickable && onSelectStage?.(stage.key)}
                  className={cn(
                    'w-9 h-9 rounded-full border-2 flex items-center justify-center text-xs font-bold z-10 transition-transform',
                    getStatusColor(stage.status, selected),
                    clickable ? 'cursor-pointer hover:opacity-90' : 'cursor-default opacity-80',
                  )}
                  title={
                    clickable
                      ? `${index + 1}. ${stage.label} — suhbat natijasini ochish`
                      : `${index + 1}. ${stage.label} — hali ochilmagan`
                  }
                >
                  {stage.status === 'completed' ? (
                    <Check className="w-4 h-4" strokeWidth={3} />
                  ) : stage.status === 'failed' ? (
                    <X className="w-4 h-4" strokeWidth={3} />
                  ) : (
                    index + 1
                  )}
                </button>
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={() => clickable && onSelectStage?.(stage.key)}
                  className={cn(
                    'mt-2 px-1 text-center w-full',
                    clickable ? 'hover:opacity-80 cursor-pointer' : 'cursor-default',
                  )}
                >
                  <div className="text-[10px] font-semibold text-muted-foreground tabular-nums">{index + 1}-qadam</div>
                  <div
                    className={cn(
                      'text-[11px] leading-tight mt-0.5',
                      selected && 'underline',
                      stage.status === 'in_progress' && 'font-bold text-foreground',
                      stage.status === 'completed' && 'text-emerald-700 font-medium',
                      stage.status === 'failed' && 'text-destructive font-medium',
                      stage.status === 'pending' && 'text-muted-foreground',
                    )}
                  >
                    {stage.label}
                  </div>
                </button>
              </div>

              {!isLast && (
                <div className="flex-1 h-9 flex items-center -mx-1">
                  <div className={cn('h-1 w-full rounded-full', getLineColor(stage.status))} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-center text-xs text-muted-foreground mt-2">Bosqichga bosing — shu qadamning suhbat natijasi ochiladi</p>
    </div>
  );
}
