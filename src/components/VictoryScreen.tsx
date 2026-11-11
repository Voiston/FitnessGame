import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Trophy, RotateCcw, Award, Flame, Layers, ShieldAlert } from 'lucide-react';
import { PlayerState, WorkoutConfig } from '../types/game';
import { soundEngine } from '../utils/sound';

interface VictoryScreenProps {
  players: PlayerState[];
  winnerId: string | null;
  config: WorkoutConfig;
  onPlayAgainSamePlayers: () => void;
  onNewSessionSetup: () => void;
}

export const VictoryScreen: React.FC<VictoryScreenProps> = ({
  players,
  winnerId,
  config,
  onPlayAgainSamePlayers,
  onNewSessionSetup,
}) => {
  useEffect(() => {
    soundEngine.playVictoryFanfare();
    try {
      confetti({
        particleCount: 90,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch {
      // Ignore confetti errors in headless environments
    }
  }, []);

  const sortedPlayers = [...players].sort((a, b) => {
    if (a.id === winnerId) return -1;
    if (b.id === winnerId) return 1;
    if (b.completedCells.length !== a.completedCells.length) {
      return b.completedCells.length - a.completedCells.length;
    }
    return b.stats.totalRepsExecuted - a.stats.totalRepsExecuted;
  });

  const winner = sortedPlayers[0];
  const totalGroupReps = players.reduce((sum, p) => sum + p.stats.totalRepsExecuted, 0);

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-4">
      {/* Winner Hero Card */}
      <div className="bg-white border-2 border-amber-400 rounded-3xl p-8 text-center shadow-sm">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-4">
          <Trophy className="w-9 h-9" />
        </div>

        <div className="text-xs font-bold uppercase tracking-widest text-amber-700">
          Grille 20/20 Complétée · Vainqueur D20 Fitness Battle
        </div>
        <h1 className="font-display font-extrabold text-5xl uppercase text-slate-900 mt-1">
          {winner ? winner.name : 'Séance Terminée'}
        </h1>
        <p className="text-sm text-slate-600 mt-2">
          Volume total du groupe :{' '}
          <span className="font-mono-tabular font-bold text-slate-900">
            {totalGroupReps} répétitions exécutées
          </span>
        </p>

        {winner && (
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto">
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
              <div className="text-xs text-slate-500">Volume Exécuté</div>
              <div className="font-mono-tabular font-extrabold text-2xl text-slate-900 mt-0.5">
                {winner.stats.totalRepsExecuted} rép.
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200">
              <div className="text-xs text-emerald-800 truncate">{config.greenExercise}</div>
              <div className="font-mono-tabular font-extrabold text-2xl text-emerald-900 mt-0.5">
                {winner.stats.greenReps} rép.
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200">
              <div className="text-xs text-amber-800 truncate">{config.yellowExercise}</div>
              <div className="font-mono-tabular font-extrabold text-2xl text-amber-900 mt-0.5">
                {winner.stats.yellowReps} rép.
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200">
              <div className="text-xs text-red-800 truncate">{config.redExercise}</div>
              <div className="font-mono-tabular font-extrabold text-2xl text-red-900 mt-0.5">
                {winner.stats.redReps} rép.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Full Leaderboard & Volume Breakdown */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs">
        <h2 className="font-display font-bold text-2xl uppercase text-slate-900 mb-4 flex items-center gap-2">
          <Award className="w-5 h-5 text-red-600" />
          <span>Bilan Athlétique Détaillé par Joueur</span>
        </h2>

        <div className="space-y-3">
          {sortedPlayers.map((p, idx) => (
            <div
              key={p.id}
              className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-xl font-mono-tabular font-bold text-sm text-white flex items-center justify-center shrink-0"
                  style={{ backgroundColor: p.color }}
                >
                  #{idx + 1}
                </div>
                <div>
                  <div className="font-display font-bold text-xl uppercase text-slate-900">
                    {p.name}
                  </div>
                  <div className="text-xs text-slate-600">
                    Cases validées :{' '}
                    <span className="font-mono-tabular font-bold text-slate-900">
                      {p.completedCells.length}/20
                    </span>
                    <span aria-hidden="true" className="mx-1.5">
                      ·
                    </span>
                    Lancers :{' '}
                    <span className="font-mono-tabular font-bold text-slate-900">
                      {p.stats.rollsCount}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
                <div className="flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 text-red-600" />
                  <span>Total exécuté :</span>
                  <strong className="font-mono-tabular text-slate-900">
                    {p.stats.totalRepsExecuted} rép.
                  </strong>
                </div>
                <span aria-hidden="true">·</span>
                <div className="flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-amber-600" />
                  <span>Cartes jouées :</span>
                  <strong className="font-mono-tabular text-slate-900">
                    {p.stats.cardsPlayed}
                  </strong>
                </div>
                <span aria-hidden="true">·</span>
                <div className="flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5 text-sky-600" />
                  <span>Pénalités :</span>
                  <strong className="font-mono-tabular text-slate-900">
                    {p.stats.penaltyReps > 0
                      ? `${p.stats.penaltyReps} rép.`
                      : `${p.stats.penaltySeconds}s`}
                  </strong>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Restart Actions */}
        <div className="mt-6 pt-5 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-end gap-3">
          <button
            type="button"
            onClick={onNewSessionSetup}
            className="w-full sm:w-auto px-5 min-h-[48px] rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-semibold"
          >
            Configurer de nouveaux exercices
          </button>
          <button
            type="button"
            onClick={onPlayAgainSamePlayers}
            className="w-full sm:w-auto px-6 min-h-[48px] rounded-xl bg-red-600 hover:bg-red-700 text-white font-display font-bold text-lg uppercase tracking-wide flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Rejouer une Manche
          </button>
        </div>
      </div>
    </div>
  );
};
