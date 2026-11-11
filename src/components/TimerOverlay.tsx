import React, { useEffect, useState } from 'react';
import { Snowflake, Timer, CheckCircle2, Play, RotateCcw } from 'lucide-react';
import { soundEngine } from '../utils/sound';

interface TimerOverlayProps {
  mode: 'FREEZE_45S' | 'PENALTY_TIMER';
  durationSeconds: number;
  title: string;
  subtitle: string;
  attackerName?: string | null;
  onComplete: () => void;
}

export const TimerOverlay: React.FC<TimerOverlayProps> = ({
  mode,
  durationSeconds,
  title,
  subtitle,
  attackerName,
  onComplete,
}) => {
  const [secondsLeft, setSecondsLeft] = useState(durationSeconds);
  const [isRunning, setIsRunning] = useState(true);

  useEffect(() => {
    setSecondsLeft(durationSeconds);
    setIsRunning(true);
  }, [durationSeconds, mode]);

  useEffect(() => {
    if (!isRunning) return;
    if (secondsLeft <= 0) {
      soundEngine.playCountdownBeep(true);
      return;
    }

    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        const next = prev - 1;
        if (next > 0 && next <= 3) {
          soundEngine.playCountdownBeep(false);
        } else if (next === 0) {
          soundEngine.playCountdownBeep(true);
        }
        return Math.max(0, next);
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, secondsLeft]);

  const progressPct = Math.max(
    0,
    Math.min(100, ((durationSeconds - secondsLeft) / durationSeconds) * 100)
  );

  const isFreeze = mode === 'FREEZE_45S';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        className={`w-full max-w-md rounded-3xl border-2 p-6 shadow-xl bg-white ${
          isFreeze ? 'border-sky-500' : 'border-amber-500'
        }`}
      >
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
                isFreeze ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'
              }`}
            >
              {isFreeze ? <Snowflake className="w-6 h-6" /> : <Timer className="w-6 h-6" />}
            </div>
            <div>
              <h3 className="font-display font-extrabold text-2xl uppercase text-slate-900 leading-none">
                {title}
              </h3>
              <p className="text-xs font-medium text-slate-600 mt-1">
                {attackerName ? `Attaque envoyée par ${attackerName} · ` : ''}
                {subtitle}
              </p>
            </div>
          </div>
        </div>

        {/* Giant Tabular Countdown */}
        <div
          className={`my-6 py-8 rounded-2xl border text-center ${
            isFreeze ? 'bg-sky-50 border-sky-200' : 'bg-amber-50 border-amber-200'
          }`}
        >
          <div className="font-mono-tabular font-extrabold text-7xl tracking-tight text-slate-900">
            00:{String(secondsLeft).padStart(2, '0')}
          </div>
          <div className="mt-2 text-xs font-semibold text-slate-600">
            {secondsLeft === 0
              ? 'Chronomètre terminé ! Vous pouvez valider.'
              : isRunning
              ? 'Maintenez la position...'
              : 'En pause'}
          </div>

          {/* Progress Bar */}
          <div className="mt-5 mx-6 h-2.5 bg-white rounded-full overflow-hidden border border-slate-200">
            <div
              className={`h-full transition-all duration-300 ${
                isFreeze ? 'bg-sky-600' : 'bg-amber-600'
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsRunning((r) => !r)}
            className="px-4 min-h-[50px] rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-semibold flex items-center justify-center gap-1.5"
          >
            <Play className="w-4 h-4" />
            {isRunning ? 'Pause' : 'Reprendre'}
          </button>

          <button
            type="button"
            onClick={() => {
              setSecondsLeft(durationSeconds);
              setIsRunning(true);
            }}
            className="px-4 min-h-[50px] rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-semibold flex items-center justify-center gap-1.5"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>

          <button
            type="button"
            onClick={onComplete}
            className={`flex-1 min-h-[50px] rounded-xl font-display font-bold text-lg uppercase tracking-wide text-white flex items-center justify-center gap-2 transition-colors ${
              secondsLeft === 0
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : isFreeze
                ? 'bg-sky-600 hover:bg-sky-700'
                : 'bg-amber-600 hover:bg-amber-700'
            }`}
          >
            <CheckCircle2 className="w-5 h-5" />
            {secondsLeft === 0 ? 'Valider & Continuer' : 'Valider Maintenant'}
          </button>
        </div>
      </div>
    </div>
  );
};
