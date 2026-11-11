import React, { useState } from 'react';
import { Dices, Hash, Sparkles } from 'lucide-react';
import { getCellTier } from '../types/game';

interface D20RollerProps {
  diceRoll: number | null;
  secondaryDiceRoll: number | null;
  doubleDiceActive: boolean;
  canRoll: boolean;
  onRollVirtual: () => void;
  onSelectManualRoll: (val: number) => void;
  onChooseDoubleDieResult?: (chosenVal: number) => void;
  canActivateDoubleDe: boolean;
  onActivateDoubleDe: () => void;
}

export const D20Roller: React.FC<D20RollerProps> = ({
  diceRoll,
  doubleDiceActive,
  canRoll,
  onRollVirtual,
  onSelectManualRoll,
  canActivateDoubleDe,
  onActivateDoubleDe,
}) => {
  const [isRollingAnim, setIsRollingAnim] = useState(false);
  const [inputMode, setInputMode] = useState<'VIRTUAL' | 'PHYSICAL'>('VIRTUAL');

  const handleVirtualClick = () => {
    if (!canRoll || isRollingAnim) return;
    setIsRollingAnim(true);
    setTimeout(() => {
      setIsRollingAnim(false);
      onRollVirtual();
    }, 480);
  };

  const getTierAccent = (val: number | null) => {
    if (!val) return { stroke: '#0f172a', fill: '#f8fafc', text: 'text-slate-900' };
    const tier = getCellTier(val);
    if (tier === 'GREEN') return { stroke: '#16a34a', fill: '#f0fdf4', text: 'text-emerald-700' };
    if (tier === 'YELLOW') return { stroke: '#d97706', fill: '#fffbeb', text: 'text-amber-700' };
    return { stroke: '#dc2626', fill: '#fef2f2', text: 'text-red-600' };
  };

  const accent = getTierAccent(diceRoll);

  return (
    <div className="bg-white border-2 border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs text-center">
      {/* Mode Switcher: Dé Virtuel vs Saisie Dé Physique */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <span className="font-display font-bold text-xl uppercase text-slate-900">
          À votre tour de lancer
        </span>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 shrink-0">
          <button
            type="button"
            onClick={() => setInputMode('VIRTUAL')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
              inputMode === 'VIRTUAL'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Dices className="w-3.5 h-3.5" />
            Dé Virtuel
          </button>
          <button
            type="button"
            onClick={() => setInputMode('PHYSICAL')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
              inputMode === 'PHYSICAL'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Hash className="w-3.5 h-3.5" />
            Dé Physique
          </button>
        </div>
      </div>

      {/* Pre-roll Tactical Option: Double Dé */}
      {canRoll && canActivateDoubleDe && !doubleDiceActive && (
        <div className="mb-6 p-3.5 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-3 text-left">
          <div className="text-xs font-semibold text-amber-950">
            Carte <strong>Double Dé</strong> disponible en main
          </div>
          <button
            type="button"
            onClick={onActivateDoubleDe}
            className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
          >
            <Sparkles className="w-4 h-4" />
            Utiliser Double Dé
          </button>
        </div>
      )}

      {doubleDiceActive && (
        <div className="mb-5 py-2 px-4 rounded-xl bg-amber-100 text-amber-950 text-xs font-bold inline-block">
          Double Dé actif : 2 dés seront lancés simultanément !
        </div>
      )}

      {inputMode === 'VIRTUAL' ? (
        <div className="flex flex-col items-center">
          {/* Giant Center Icosahedron D20 */}
          <button
            type="button"
            disabled={!canRoll || isRollingAnim}
            onClick={handleVirtualClick}
            aria-label="Lancer le D20"
            className={`relative group flex items-center justify-center w-44 h-44 my-2 rounded-3xl transition-transform ${
              canRoll ? 'cursor-pointer active:scale-95' : 'cursor-not-allowed opacity-60'
            } ${isRollingAnim ? 'animate-d20-roll' : ''}`}
          >
            <svg
              viewBox="0 0 120 120"
              className="w-44 h-44 drop-shadow-xs transition-transform group-hover:scale-105"
            >
              <polygon
                points="60,6 110,33 110,87 60,114 10,87 10,33"
                fill={accent.fill}
                stroke={accent.stroke}
                strokeWidth="3.5"
                strokeLinejoin="round"
              />
              <polygon
                points="60,24 94,80 26,80"
                fill="none"
                stroke={accent.stroke}
                strokeWidth="2"
                strokeLinejoin="round"
                opacity="0.35"
              />
              <line x1="60" y1="6" x2="60" y2="24" stroke={accent.stroke} strokeWidth="2" opacity="0.35" />
              <line x1="110" y1="33" x2="60" y2="24" stroke={accent.stroke} strokeWidth="2" opacity="0.35" />
              <line x1="10" y1="33" x2="60" y2="24" stroke={accent.stroke} strokeWidth="2" opacity="0.35" />
              <line x1="110" y1="33" x2="94" y2="80" stroke={accent.stroke} strokeWidth="2" opacity="0.35" />
              <line x1="10" y1="33" x2="26" y2="80" stroke={accent.stroke} strokeWidth="2" opacity="0.35" />
              <line x1="110" y1="87" x2="94" y2="80" stroke={accent.stroke} strokeWidth="2" opacity="0.35" />
              <line x1="10" y1="87" x2="26" y2="80" stroke={accent.stroke} strokeWidth="2" opacity="0.35" />
              <line x1="60" y1="114" x2="94" y2="80" stroke={accent.stroke} strokeWidth="2" opacity="0.35" />
              <line x1="60" y1="114" x2="26" y2="80" stroke={accent.stroke} strokeWidth="2" opacity="0.35" />
            </svg>

            <span
              className={`absolute font-display font-extrabold text-6xl tracking-tight ${accent.text} font-mono-tabular`}
            >
              {isRollingAnim ? '••' : 'D20'}
            </span>
          </button>

          <button
            type="button"
            disabled={!canRoll || isRollingAnim}
            onClick={handleVirtualClick}
            className="mt-4 w-full min-h-[64px] py-4 px-6 rounded-2xl bg-red-600 hover:bg-red-700 disabled:opacity-50 active:scale-[0.99] text-white font-display font-extrabold text-2xl uppercase tracking-wide shadow-sm transition-all flex items-center justify-center gap-3 whitespace-nowrap shrink-0"
          >
            <Dices className="w-7 h-7" />
            {isRollingAnim
              ? 'Lancer en cours...'
              : doubleDiceActive
              ? 'Lancer les 2 Dés D20'
              : 'Lancer le Dé (D20)'}
          </button>
        </div>
      ) : (
        /* Physical D20 Keypad (1 to 20) */
        <div className="text-left">
          <p className="text-xs font-semibold text-slate-600 mb-3">
            Touchez le résultat de votre dé physique :
          </p>
          <div className="grid grid-cols-5 gap-2.5">
            {Array.from({ length: 20 }, (_, i) => i + 1).map((num) => {
              const tier = getCellTier(num);
              const tierColors =
                tier === 'GREEN'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-950 hover:bg-emerald-100'
                  : tier === 'YELLOW'
                  ? 'border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100'
                  : 'border-red-300 bg-red-50 text-red-950 hover:bg-red-100';

              return (
                <button
                  key={num}
                  type="button"
                  disabled={!canRoll}
                  onClick={() => onSelectManualRoll(num)}
                  className={`min-h-[52px] rounded-xl border font-mono-tabular font-extrabold text-lg transition-all ${tierColors} ${
                    !canRoll ? 'opacity-40 cursor-not-allowed' : 'active:scale-95'
                  }`}
                >
                  {num}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
