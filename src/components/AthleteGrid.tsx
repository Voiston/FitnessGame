import React from 'react';
import { Check, CornerDownRight, Crosshair } from 'lucide-react';
import { WorkoutConfig, getCellTier } from '../types/game';

interface AthleteGridProps {
  completedCells: number[];
  config: WorkoutConfig;
  selectedTargetCells: number[];
  reboundOptions: number[];
  rolledDuplicateCell: number | null;
  interactiveMode: 'NONE' | 'REBOUND_CHOICE' | 'FREE_CELL_PICK';
  onSelectCell?: (cellNumber: number) => void;
  compact?: boolean;
}

export const AthleteGrid: React.FC<AthleteGridProps> = ({
  completedCells,
  config,
  selectedTargetCells,
  reboundOptions,
  rolledDuplicateCell,
  interactiveMode,
  onSelectCell,
  compact = false,
}) => {
  const totalTheoreticalReps = completedCells.reduce((acc, c) => acc + c, 0);

  const renderTierSection = (
    title: string,
    exerciseName: string,
    rangeText: string,
    cells: number[],
    tierKey: 'GREEN' | 'YELLOW' | 'RED'
  ) => {
    const headerColors =
      tierKey === 'GREEN'
        ? 'text-emerald-800 border-emerald-200 bg-emerald-50/70'
        : tierKey === 'YELLOW'
        ? 'text-amber-900 border-amber-200 bg-amber-50/70'
        : 'text-red-800 border-red-200 bg-red-50/70';

    const completedInTier = cells.filter((c) => completedCells.includes(c)).length;

    return (
      <div className="border border-slate-200 rounded-2xl bg-white overflow-hidden shadow-2xs">
        {/* Clean Unboxed Tier Header */}
        <div
          className={`px-4 py-2.5 border-b flex items-center justify-between gap-2 ${headerColors}`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-display font-bold text-lg uppercase tracking-tight truncate">
              {exerciseName}
            </span>
            <span aria-hidden="true" className="opacity-50">
              ·
            </span>
            <span className="text-xs font-medium opacity-85 whitespace-nowrap">
              {title} ({rangeText})
            </span>
          </div>
          <div className="text-xs font-mono-tabular font-bold whitespace-nowrap">
            {completedInTier}/{cells.length} cases
          </div>
        </div>

        {/* Cells Grid */}
        <div
          className={`p-3 grid ${
            compact
              ? 'grid-cols-7 gap-1.5'
              : cells.length === 6
              ? 'grid-cols-3 sm:grid-cols-6 gap-2.5'
              : 'grid-cols-4 sm:grid-cols-7 gap-2.5'
          }`}
        >
          {cells.map((cellNumber) => {
            const isCompleted = completedCells.includes(cellNumber);
            const isTarget = selectedTargetCells.includes(cellNumber);
            const isReboundOption = reboundOptions.includes(cellNumber) && !isCompleted;
            const isDuplicateHit = rolledDuplicateCell === cellNumber && isCompleted;

            const isClickable =
              (interactiveMode === 'REBOUND_CHOICE' && isReboundOption) ||
              (interactiveMode === 'FREE_CELL_PICK' && !isCompleted);

            const tier = getCellTier(cellNumber);

            let cellStyle = '';
            if (isCompleted) {
              if (tier === 'GREEN') {
                cellStyle = 'bg-emerald-600 text-white border-emerald-700';
              } else if (tier === 'YELLOW') {
                cellStyle = 'bg-amber-500 text-slate-950 border-amber-600';
              } else {
                cellStyle = 'bg-red-600 text-white border-red-700';
              }
            } else if (isTarget) {
              cellStyle =
                'bg-slate-900 text-white border-slate-900 ring-4 ring-red-500/30 scale-[1.03]';
            } else if (isReboundOption) {
              cellStyle =
                'bg-sky-50 text-sky-950 border-2 border-sky-600 ring-2 ring-sky-400/40';
            } else {
              if (tier === 'GREEN') {
                cellStyle =
                  'bg-emerald-50/50 text-slate-900 border-emerald-200 hover:border-emerald-400';
              } else if (tier === 'YELLOW') {
                cellStyle =
                  'bg-amber-50/50 text-slate-900 border-amber-200 hover:border-amber-400';
              } else {
                cellStyle = 'bg-red-50/50 text-slate-900 border-red-200 hover:border-red-400';
              }
            }

            if (isDuplicateHit) {
              cellStyle += ' ring-2 ring-amber-500';
            }

            return (
              <button
                key={cellNumber}
                type="button"
                disabled={!isClickable}
                onClick={() => isClickable && onSelectCell && onSelectCell(cellNumber)}
                className={`relative flex flex-col items-center justify-center rounded-xl border transition-all ${
                  compact ? 'min-h-[46px] p-1' : 'min-h-[64px] p-2'
                } ${cellStyle} ${
                  isClickable ? 'cursor-pointer active:scale-95' : 'cursor-default'
                }`}
              >
                <span
                  className={`font-display font-extrabold font-mono-tabular leading-none ${
                    compact ? 'text-lg' : 'text-2xl'
                  }`}
                >
                  {cellNumber}
                </span>

                {!compact && (
                  <span
                    className={`mt-1 text-[11px] font-medium leading-none flex items-center gap-0.5 ${
                      isCompleted
                        ? tier === 'YELLOW'
                          ? 'text-slate-900'
                          : 'text-white/90'
                        : isTarget
                        ? 'text-amber-300 font-semibold'
                        : isReboundOption
                        ? 'text-sky-700 font-bold'
                        : 'text-slate-500'
                    }`}
                  >
                    {isCompleted ? (
                      <>
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                        <span>Validé</span>
                      </>
                    ) : isTarget ? (
                      <>
                        <Crosshair className="w-3 h-3" />
                        <span>Cible</span>
                      </>
                    ) : isReboundOption ? (
                      <>
                        <CornerDownRight className="w-3 h-3" />
                        <span>Rebond</span>
                      </>
                    ) : (
                      <span>{cellNumber} rép.</span>
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Summary Header */}
      {!compact && (
        <div className="flex items-center justify-between px-1">
          <div className="text-xs font-medium text-slate-600">
            Progression Grille :{' '}
            <span className="font-mono-tabular font-bold text-slate-900">
              {completedCells.length}/20 cases
            </span>
            <span aria-hidden="true" className="mx-1.5">
              ·
            </span>
            Volume Grille :{' '}
            <span className="font-mono-tabular font-bold text-slate-900">
              {totalTheoreticalReps}/210 rép.
            </span>
          </div>
          {interactiveMode !== 'NONE' && (
            <span className="text-xs font-bold text-sky-700">
              {interactiveMode === 'REBOUND_CHOICE'
                ? 'Touchez votre case de rebond'
                : 'Touchez une case libre sur la grille'}
            </span>
          )}
        </div>
      )}

      {renderTierSection(
        'Palier Vert',
        config.greenExercise,
        'Cases 1 à 6',
        [1, 2, 3, 4, 5, 6],
        'GREEN'
      )}
      {renderTierSection(
        'Palier Jaune',
        config.yellowExercise,
        'Cases 7 à 13',
        [7, 8, 9, 10, 11, 12, 13],
        'YELLOW'
      )}
      {renderTierSection(
        'Palier Rouge',
        config.redExercise,
        'Cases 14 à 20',
        [14, 15, 16, 17, 18, 19, 20],
        'RED'
      )}
    </div>
  );
};
