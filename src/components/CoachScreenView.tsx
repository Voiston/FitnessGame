import React, { useState } from 'react';
import {
  Tv,
  Users,
  Copy,
  Check,
  Play,
  Plus,
  Snowflake,
  Activity,
  Trophy,
  Smartphone,
} from 'lucide-react';
import { RoomState, getCellTier } from '../types/game';

interface CoachScreenViewProps {
  room: RoomState;
  onStartRoomGame: () => void;
  onAddQuickAthlete: (name: string) => void;
  onSwitchToAthleteView: (playerId: string) => void;
}

export const CoachScreenView: React.FC<CoachScreenViewProps> = ({
  room,
  onStartRoomGame,
  onAddQuickAthlete,
  onSwitchToAthleteView,
}) => {
  const [copied, setCopied] = useState(false);
  const [quickAthleteName, setQuickAthleteName] = useState('');

  const joinUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}?room=${room.roomCode}`
      : `https://d20-fitness.app?room=${room.roomCode}`;

  const handleCopyLink = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(joinUrl).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickAthleteName.trim()) return;
    onAddQuickAthlete(quickAthleteName.trim());
    setQuickAthleteName('');
  };

  const sortedPlayers = [...room.players].sort((a, b) => {
    if (b.completedCells.length !== a.completedCells.length) {
      return b.completedCells.length - a.completedCells.length;
    }
    return b.stats.totalRepsExecuted - a.stats.totalRepsExecuted;
  });

  return (
    <div className="space-y-6">
      {/* Top Coach Banner: Room Code + Workout Tiers + Quick Actions */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Room Code & Join Info */}
          <div className="lg:col-span-5 flex flex-col sm:flex-row items-start sm:items-center gap-5 border-b lg:border-b-0 lg:border-r border-slate-200 pb-5 lg:pb-0 lg:pr-6">
            <div className="bg-slate-900 text-white rounded-2xl px-5 py-4 text-center shrink-0">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-300">
                Code Salle
              </div>
              <div className="font-mono-tabular font-extrabold text-4xl tracking-widest mt-0.5">
                {room.roomCode}
              </div>
            </div>

            <div className="space-y-2 min-w-0">
              <div className="flex items-center gap-2 text-slate-900 font-display font-bold text-xl uppercase">
                <Tv className="w-5 h-5 text-red-600 shrink-0" />
                <span>Écran Coach / TV Temps Réel</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Les athlètes rejoignent depuis leur smartphone avec le code{' '}
                <span className="font-mono-tabular font-bold text-slate-900">{room.roomCode}</span>{' '}
                ou via le lien direct.
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Lien copié !</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copier le lien Athlète</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* 3 Exercise Tiers Summary */}
          <div className="lg:col-span-4 grid grid-cols-3 gap-2.5">
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
              <div className="text-[11px] font-bold text-emerald-800">Cases 1 à 6</div>
              <div className="font-display font-bold text-base uppercase text-slate-900 truncate mt-0.5">
                {room.config.greenExercise}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
              <div className="text-[11px] font-bold text-amber-800">Cases 7 à 13</div>
              <div className="font-display font-bold text-base uppercase text-slate-900 truncate mt-0.5">
                {room.config.yellowExercise}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-red-50 border border-red-200">
              <div className="text-[11px] font-bold text-red-800">Cases 14 à 20</div>
              <div className="font-display font-bold text-base uppercase text-slate-900 truncate mt-0.5">
                {room.config.redExercise}
              </div>
            </div>
          </div>

          {/* Add Athlete / Start Session Controls */}
          <div className="lg:col-span-3 flex flex-col gap-2.5">
            <form onSubmit={handleQuickAdd} className="flex items-center gap-2">
              <input
                type="text"
                value={quickAthleteName}
                onChange={(e) => setQuickAthleteName(e.target.value)}
                placeholder="Ajouter un athlète..."
                className="flex-1 min-w-0 h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-900"
              />
              <button
                type="submit"
                className="h-10 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1 shrink-0"
              >
                <Plus className="w-4 h-4" />
                Ajouter
              </button>
            </form>

            {room.status === 'LOBBY' && room.players.length > 0 && (
              <button
                type="button"
                onClick={onStartRoomGame}
                className="w-full h-11 rounded-xl bg-red-600 hover:bg-red-700 text-white font-display font-bold text-lg uppercase tracking-wide flex items-center justify-center gap-2 shadow-xs"
              >
                <Play className="w-4 h-4" />
                Lancer la Bataille ({room.players.length} athlètes)
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Coach Arena: Live Grids + Live Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 8 Columns: Real-Time Athlete Grids */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-extrabold text-2xl uppercase text-slate-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-slate-700" />
              <span>Classement & Grilles en Direct ({room.players.length})</span>
            </h2>
            <span className="text-xs text-slate-500">
              Cliquez sur « Ouvrir Vue Athlète » pour contrôler un joueur depuis cet écran
            </span>
          </div>

          {sortedPlayers.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-3xl p-10 text-center">
              <Users className="w-10 h-10 text-slate-400 mx-auto mb-3" />
              <h3 className="font-display font-bold text-2xl uppercase text-slate-900">
                En attente de connexion des athlètes
              </h3>
              <p className="text-sm text-slate-600 max-w-md mx-auto mt-1">
                Demandez aux participants de rejoindre la salle avec le code{' '}
                <span className="font-mono-tabular font-bold text-slate-900">{room.roomCode}</span>{' '}
                ou ajoutez-les directement via le champ ci-dessus.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sortedPlayers.map((player, rankIdx) => {
                const isFrozen =
                  player.freezeUntilTimestamp && player.freezeUntilTimestamp > Date.now();
                const pct = Math.round((player.completedCells.length / 20) * 100);

                return (
                  <div
                    key={player.id}
                    className={`bg-white rounded-2xl border p-5 shadow-2xs transition-all ${
                      isFrozen ? 'border-sky-500 bg-sky-50/30' : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-7 h-7 rounded-lg font-mono-tabular font-bold text-xs text-white flex items-center justify-center shrink-0"
                          style={{ backgroundColor: player.color }}
                        >
                          #{rankIdx + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-display font-bold text-xl uppercase text-slate-900 truncate">
                              {player.name}
                            </span>
                            <span className="text-[11px] font-mono-tabular font-bold text-slate-600">
                              · {player.scalingLevel === 'SCALED' ? '×0.5' : player.scalingLevel === 'ELITE' ? '×1.5' : 'RX'}
                              {player.teamId && player.teamId !== 'SOLO' ? ` · Éq. ${player.teamId}` : ''}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 font-mono-tabular">
                            {player.completedCells.length}/20 cases ({pct}%) ·{' '}
                            {player.stats.totalRepsExecuted} rép. exécutées
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => onSwitchToAthleteView(player.id)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-slate-900 text-xs font-semibold text-slate-700 hover:text-slate-900 flex items-center gap-1 shrink-0 transition-colors"
                      >
                        <Smartphone className="w-3.5 h-3.5" />
                        <span>Ouvrir Vue Athlète</span>
                      </button>
                    </div>

                    {/* Current Action Banner */}
                    <div className="mb-3 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs">
                      {isFrozen ? (
                        <span className="text-sky-700 font-bold flex items-center gap-1.5">
                          <Snowflake className="w-4 h-4" />
                          GELÉ (45s Planche par {player.frozenByPlayerName})
                        </span>
                      ) : player.turn.diceRoll ? (
                        <span className="text-slate-800 font-medium">
                          Dé tiré :{' '}
                          <strong className="font-mono-tabular">{player.turn.diceRoll}</strong> →{' '}
                          <strong className="font-mono-tabular">{player.turn.finalReps} rép.</strong>
                        </span>
                      ) : (
                        <span className="text-slate-500">Prêt à lancer le D20</span>
                      )}

                      <span className="text-slate-500 font-mono-tabular">
                        Cartes : {player.hand.length}/3
                      </span>
                    </div>

                    {/* Mini 20-Cell Matrix */}
                    <div className="grid grid-cols-10 gap-1.5">
                      {Array.from({ length: 20 }, (_, i) => i + 1).map((cell) => {
                        const done = player.completedCells.includes(cell);
                        const isTarget = player.turn.selectedTargetCells.includes(cell);
                        const tier = getCellTier(cell);

                        let bg = 'bg-slate-100 text-slate-500 border-slate-200';
                        if (done) {
                          bg =
                            tier === 'GREEN'
                              ? 'bg-emerald-600 text-white border-emerald-700'
                              : tier === 'YELLOW'
                              ? 'bg-amber-500 text-slate-950 border-amber-600'
                              : 'bg-red-600 text-white border-red-700';
                        } else if (isTarget) {
                          bg = 'bg-slate-900 text-white border-slate-900 ring-2 ring-red-400';
                        }

                        return (
                          <div
                            key={cell}
                            className={`h-8 rounded-lg border font-mono-tabular font-bold text-xs flex items-center justify-center ${bg}`}
                          >
                            {cell}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right 4 Columns: Live Activity Feed */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-bold text-xl uppercase text-slate-900 flex items-center gap-2">
              <Activity className="w-4 h-4 text-red-600" />
              <span>Journal de Bataille en Direct</span>
            </h3>
          </div>

          <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
            {room.logs.map((entry) => (
              <div
                key={entry.id}
                className={`p-3 rounded-xl border text-xs leading-relaxed ${
                  entry.type === 'VICTORY'
                    ? 'bg-amber-50 border-amber-300 text-amber-950 font-semibold'
                    : entry.type === 'ATTACK'
                    ? 'bg-red-50 border-red-200 text-red-900'
                    : entry.type === 'CARD'
                    ? 'bg-sky-50 border-sky-200 text-sky-900'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between text-[11px] text-slate-500 mb-0.5">
                  <span className="font-bold text-slate-900">{entry.playerName}</span>
                  <span className="font-mono-tabular">
                    {new Date(entry.timestamp).toLocaleTimeString('fr-FR', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                </div>
                <div>{entry.message}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
