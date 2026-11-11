import React, { useState } from 'react';
import {
  Sparkles,
  Snowflake,
  Swords,
  ShieldAlert,
  Split,
  FastForward,
  Percent,
  Layers,
  Trophy,
  Dices,
  X,
  RefreshCw,
} from 'lucide-react';
import {
  PlayerState,
  TacticalCardId,
  TacticalCardInstance,
  getCardDefinition,
  getFreeCells,
  computeScissionPairs,
  computeDoubleMisePartner,
} from '../types/game';

interface TacticalCardHandProps {
  player: PlayerState;
  allPlayers: PlayerState[];
  onPlayCard: (
    instanceId: string,
    cardId: TacticalCardId,
    options?: {
      targetPlayerId?: string;
      chosenCells?: number[];
      balleDeMatchAction?: 'REROLL' | 'COPY_CELL';
    }
  ) => void;
  onDiscardCard: (instanceId: string) => void;
}

export const TacticalCardHand: React.FC<TacticalCardHandProps> = ({
  player,
  allPlayers,
  onPlayCard,
  onDiscardCard,
}) => {
  const [configuringCard, setConfiguringCard] = useState<TacticalCardInstance | null>(null);
  const [selectedRivalId, setSelectedRivalId] = useState<string>('');
  const [selectedScissionPair, setSelectedScissionPair] = useState<[number, number] | null>(null);
  const [selectedFreeCell, setSelectedFreeCell] = useState<number | null>(null);
  const [balleDeMatchMode, setBalleDeMatchMode] = useState<'REROLL' | 'COPY_CELL'>('REROLL');

  const rivals = allPlayers.filter((p) => p.id !== player.id);
  const freeCells = getFreeCells(player.completedCells);
  const remainingCount = freeCells.length;
  const rolledValue = player.turn.diceRoll;
  const currentReps = player.turn.finalReps;
  const isRolledPhase = player.turn.phase === 'ROLLED' || player.turn.phase === 'EXECUTING_REPS';

  const getCardVisualTheme = (cardId: TacticalCardId) => {
    switch (cardId) {
      case 'PASSE_DROIT':
      case 'DEMI_TARIF':
      case 'DOUBLE_MISE':
        return {
          border: 'border-emerald-300',
          bg: 'bg-emerald-50/60',
          impactBg: 'bg-emerald-600 text-white',
          tagText: 'text-emerald-800',
          tagLabel: 'BOOST SÉRIE',
          icon:
            cardId === 'PASSE_DROIT' ? (
              <Sparkles className="w-4 h-4 text-emerald-700 shrink-0" />
            ) : cardId === 'DEMI_TARIF' ? (
              <Percent className="w-4 h-4 text-emerald-700 shrink-0" />
            ) : (
              <Layers className="w-4 h-4 text-emerald-700 shrink-0" />
            ),
        };
      case 'GEL':
        return {
          border: 'border-sky-300',
          bg: 'bg-sky-50/60',
          impactBg: 'bg-sky-600 text-white',
          tagText: 'text-sky-800',
          tagLabel: 'ATTAQUE CRYO',
          icon: <Snowflake className="w-4 h-4 text-sky-700 shrink-0" />,
        };
      case 'LEST_TACTIQUE':
      case 'PARTAGE_CHARGE':
        return {
          border: 'border-red-300',
          bg: 'bg-red-50/60',
          impactBg: 'bg-red-600 text-white',
          tagText: 'text-red-800',
          tagLabel: 'ATTAQUE RIVALE',
          icon:
            cardId === 'LEST_TACTIQUE' ? (
              <Swords className="w-4 h-4 text-red-700 shrink-0" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-red-700 shrink-0" />
            ),
        };
      default:
        return {
          border: 'border-amber-300',
          bg: 'bg-amber-50/60',
          impactBg: 'bg-amber-500 text-slate-950',
          tagText: 'text-amber-900',
          tagLabel: 'TACTIQUE GRILLE',
          icon:
            cardId === 'DOUBLE_DE' ? (
              <Dices className="w-4 h-4 text-amber-800 shrink-0" />
            ) : cardId === 'GLISSADE' ? (
              <FastForward className="w-4 h-4 text-amber-800 shrink-0" />
            ) : cardId === 'SCISSION' ? (
              <Split className="w-4 h-4 text-amber-800 shrink-0" />
            ) : (
              <Trophy className="w-4 h-4 text-amber-800 shrink-0" />
            ),
        };
    }
  };

  /**
   * Calcule la formule visuelle dynamique pour qu'un joueur épuisé comprenne l'effet en 1 coup d'œil.
   */
  const getLiveImpactBadgeText = (cardId: TacticalCardId): string => {
    const def = getCardDefinition(cardId);
    if (!isRolledPhase || !rolledValue) {
      return def.impactFormula;
    }

    switch (cardId) {
      case 'PASSE_DROIT':
        return `${currentReps} → 0 RÉP. (VALIDÉ)`;
      case 'DEMI_TARIF':
        return `${currentReps} → ${Math.floor(currentReps / 2)} RÉP.`;
      case 'PARTAGE_CHARGE':
        return `${Math.floor(currentReps / 2)} VOUS / +${Math.ceil(currentReps / 2)} RIVAL`;
      case 'DOUBLE_MISE': {
        const baseCell = player.turn.selectedTargetCells[0] || rolledValue;
        const partner = computeDoubleMisePartner(baseCell, player.completedCells);
        return partner ? `CASES ${baseCell} + ${partner}` : def.impactFormula;
      }
      case 'SCISSION': {
        const pairs = computeScissionPairs(rolledValue, player.completedCells);
        return pairs.length > 0
          ? `COCHE ${pairs[0][0]} + ${pairs[0][1]}`
          : `AUCUNE PAIRE = ${rolledValue}`;
      }
      default:
        return def.impactFormula;
    }
  };

  const canPlayCardNow = (cardId: TacticalCardId): { allowed: boolean; reason?: string } => {
    if (player.turn.activeCardUsed && cardId !== 'GEL' && cardId !== 'LEST_TACTIQUE') {
      return { allowed: false, reason: '1 carte déjà jouée' };
    }

    switch (cardId) {
      case 'DOUBLE_DE':
        if (player.turn.phase !== 'IDLE') {
          return { allowed: false, reason: 'Avant le lancer' };
        }
        return { allowed: true };

      case 'GEL':
      case 'LEST_TACTIQUE':
        return { allowed: true };

      case 'BALLE_DE_MATCH':
        if (remainingCount > 3) {
          return {
            allowed: false,
            reason: `À ≤ 3 cases (${remainingCount} rest.)`,
          };
        }
        return { allowed: true };

      case 'SCISSION': {
        if (!isRolledPhase || !rolledValue) {
          return { allowed: false, reason: 'Après le lancer' };
        }
        const pairs = computeScissionPairs(rolledValue, player.completedCells);
        if (pairs.length === 0) {
          return {
            allowed: false,
            reason: `Pas de paire = ${rolledValue}`,
          };
        }
        return { allowed: true };
      }

      case 'DOUBLE_MISE': {
        if (!isRolledPhase || !rolledValue) {
          return { allowed: false, reason: 'Après le lancer' };
        }
        const baseCell = player.turn.selectedTargetCells[0] || rolledValue;
        const partner = computeDoubleMisePartner(baseCell, player.completedCells);
        if (!partner) {
          return { allowed: false, reason: '1 seule case libre' };
        }
        return { allowed: true };
      }

      case 'PASSE_DROIT':
      case 'DEMI_TARIF':
      case 'GLISSADE':
      case 'PARTAGE_CHARGE':
        if (!isRolledPhase || !rolledValue) {
          return { allowed: false, reason: 'Après le lancer' };
        }
        return { allowed: true };
    }
  };

  const handleInitiateCard = (instance: TacticalCardInstance) => {
    const check = canPlayCardNow(instance.cardId);
    if (!check.allowed) return;

    if (instance.cardId === 'DOUBLE_DE') {
      onPlayCard(instance.instanceId, 'DOUBLE_DE');
      return;
    }
    if (instance.cardId === 'DEMI_TARIF') {
      onPlayCard(instance.instanceId, 'DEMI_TARIF');
      return;
    }
    if (instance.cardId === 'DOUBLE_MISE') {
      const baseCell = player.turn.selectedTargetCells[0] || rolledValue || 1;
      const partner = computeDoubleMisePartner(baseCell, player.completedCells);
      if (partner) {
        onPlayCard(instance.instanceId, 'DOUBLE_MISE', {
          chosenCells: [baseCell, partner],
        });
      }
      return;
    }
    if (
      instance.cardId === 'PASSE_DROIT' &&
      !player.turn.isDuplicate &&
      player.turn.selectedTargetCells.length > 0
    ) {
      onPlayCard(instance.instanceId, 'PASSE_DROIT', {
        chosenCells: [player.turn.selectedTargetCells[0]],
      });
      return;
    }

    setConfiguringCard(instance);
    setSelectedRivalId(rivals[0]?.id || '');
    if (instance.cardId === 'SCISSION' && rolledValue) {
      const pairs = computeScissionPairs(rolledValue, player.completedCells);
      setSelectedScissionPair(pairs[0] || null);
    }
    if (instance.cardId === 'GLISSADE' || instance.cardId === 'PASSE_DROIT') {
      setSelectedFreeCell(freeCells[freeCells.length - 1] || freeCells[0] || null);
    }
    if (instance.cardId === 'BALLE_DE_MATCH') {
      setBalleDeMatchMode('REROLL');
      const rivalChecked = freeCells.filter((c) =>
        rivals.some((r) => r.completedCells.includes(c))
      );
      setSelectedFreeCell(rivalChecked[rivalChecked.length - 1] || freeCells[0] || null);
    }
  };

  const confirmConfiguredCard = () => {
    if (!configuringCard) return;
    const { instanceId, cardId } = configuringCard;

    if (cardId === 'GEL' || cardId === 'LEST_TACTIQUE' || cardId === 'PARTAGE_CHARGE') {
      onPlayCard(instanceId, cardId, {
        targetPlayerId: selectedRivalId || undefined,
      });
    } else if (cardId === 'SCISSION' && selectedScissionPair) {
      onPlayCard(instanceId, cardId, {
        chosenCells: [selectedScissionPair[0], selectedScissionPair[1]],
      });
    } else if ((cardId === 'GLISSADE' || cardId === 'PASSE_DROIT') && selectedFreeCell) {
      onPlayCard(instanceId, cardId, {
        chosenCells: [selectedFreeCell],
      });
    } else if (cardId === 'BALLE_DE_MATCH') {
      onPlayCard(instanceId, cardId, {
        balleDeMatchAction: balleDeMatchMode,
        chosenCells:
          balleDeMatchMode === 'COPY_CELL' && selectedFreeCell ? [selectedFreeCell] : undefined,
      });
    }

    setConfiguringCard(null);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-600" />
          <h3 className="text-lg font-extrabold tracking-tight text-slate-900 uppercase font-display">
            Deck Tactique ({player.hand.length}/3)
          </h3>
        </div>
        <span className="text-[11px] font-medium text-slate-500">
          Touchez une carte active pour déclencher son effet
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {player.hand.map((instance) => {
          const def = getCardDefinition(instance.cardId);
          const status = canPlayCardNow(instance.cardId);
          const theme = getCardVisualTheme(instance.cardId);
          const liveImpact = getLiveImpactBadgeText(instance.cardId);

          return (
            <div
              key={instance.instanceId}
              className={`flex flex-col justify-between p-3 rounded-2xl border-2 transition-all ${
                status.allowed
                  ? `${theme.border} ${theme.bg} shadow-2xs`
                  : 'border-slate-200 bg-slate-50/60 opacity-75'
              }`}
            >
              <div>
                {/* Top Row: Category Label + Swap Card Button */}
                <div className="flex items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-1">
                    {theme.icon}
                    <span className={`text-[10px] font-extrabold uppercase tracking-wider ${theme.tagText}`}>
                      {theme.tagLabel}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDiscardCard(instance.instanceId)}
                    title="Échanger cette carte contre une autre"
                    className="p-1 text-slate-400 hover:text-slate-900 rounded-lg transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                </div>

                {/* Card Title */}
                <div className="font-display font-extrabold text-xl uppercase text-slate-900 leading-tight">
                  {def.name}
                </div>

                {/* HIGH-IMPACT VISUAL FORMULA BOX (Readable at a glance!) */}
                <div
                  className={`mt-2 py-1.5 px-2.5 rounded-xl font-mono-tabular font-extrabold text-xs tracking-tight text-center ${
                    status.allowed ? theme.impactBg : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {liveImpact}
                </div>

                <p className="text-[11px] text-slate-600 mt-1.5 leading-snug">{def.shortDesc}</p>
              </div>

              {/* Action Trigger */}
              <div className="mt-3 pt-2 border-t border-slate-200/70">
                {status.allowed ? (
                  <button
                    type="button"
                    onClick={() => handleInitiateCard(instance)}
                    className="w-full min-h-[42px] py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-95 text-white font-display font-bold text-base uppercase tracking-wide transition-all flex items-center justify-center gap-1.5"
                  >
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    Activer
                  </button>
                ) : (
                  <div className="text-[11px] font-semibold text-slate-500 text-center py-1.5">
                    {status.reason}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal for Card Target / Options Selection */}
      {configuringCard && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-6 shadow-xl">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h4 className="font-display font-extrabold text-2xl uppercase text-slate-900">
                  {getCardDefinition(configuringCard.cardId).name}
                </h4>
                <div className="mt-1 inline-block px-2.5 py-0.5 rounded-lg bg-slate-900 text-white font-mono-tabular font-bold text-xs">
                  {getLiveImpactBadgeText(configuringCard.cardId)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfiguringCard(null)}
                className="w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {(configuringCard.cardId === 'GEL' ||
              configuringCard.cardId === 'LEST_TACTIQUE' ||
              configuringCard.cardId === 'PARTAGE_CHARGE') && (
              <div className="my-4">
                <label className="block text-xs font-bold uppercase text-slate-700 mb-2">
                  {rivals.length > 0
                    ? 'Choisissez l’adversaire ciblé :'
                    : 'Mode Solo (simulation d’attaque) :'}
                </label>
                {rivals.length > 0 ? (
                  <div className="space-y-2">
                    {rivals.map((rival) => (
                      <button
                        key={rival.id}
                        type="button"
                        onClick={() => setSelectedRivalId(rival.id)}
                        className={`w-full p-3.5 rounded-xl border text-left flex items-center justify-between transition-colors ${
                          selectedRivalId === rival.id
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-200 bg-slate-50 text-slate-900 hover:bg-slate-100'
                        }`}
                      >
                        <span className="font-bold text-sm">{rival.name}</span>
                        <span className="text-xs font-mono-tabular opacity-85">
                          {rival.completedCells.length}/20 cases · {rival.stats.totalRepsExecuted} rép.
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-600 p-3 rounded-xl bg-slate-100">
                    Vous jouez en solo : Partage Charge réduit vos répétitions de 50%, et Gel lance le chronomètre de 45s.
                  </p>
                )}
              </div>
            )}

            {configuringCard.cardId === 'SCISSION' && rolledValue && (
              <div className="my-4">
                <label className="block text-xs font-bold uppercase text-slate-700 mb-2">
                  Choisissez les 2 cases libres dont la somme vaut {rolledValue} :
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {computeScissionPairs(rolledValue, player.completedCells).map(([a, b]) => {
                    const isSelected =
                      selectedScissionPair?.[0] === a && selectedScissionPair?.[1] === b;
                    return (
                      <button
                        key={`${a}_${b}`}
                        type="button"
                        onClick={() => setSelectedScissionPair([a, b])}
                        className={`p-3 rounded-xl border font-mono-tabular font-bold text-sm transition-colors ${
                          isSelected
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-200 bg-slate-50 text-slate-900 hover:bg-slate-100'
                        }`}
                      >
                        Case {a} + Case {b} = {rolledValue}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {(configuringCard.cardId === 'GLISSADE' ||
              configuringCard.cardId === 'PASSE_DROIT') && (
              <div className="my-4">
                <label className="block text-xs font-bold uppercase text-slate-700 mb-2">
                  Choisissez la case libre à cibler :
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {freeCells.map((cell) => (
                    <button
                      key={cell}
                      type="button"
                      onClick={() => setSelectedFreeCell(cell)}
                      className={`min-h-[44px] rounded-xl border font-mono-tabular font-bold text-sm transition-colors ${
                        selectedFreeCell === cell
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-slate-50 text-slate-900 hover:bg-slate-100'
                      }`}
                    >
                      {cell}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {configuringCard.cardId === 'BALLE_DE_MATCH' && (
              <div className="my-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setBalleDeMatchMode('REROLL')}
                    className={`p-3 rounded-xl border text-xs font-bold transition-colors ${
                      balleDeMatchMode === 'REROLL'
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-800'
                    }`}
                  >
                    Relancer le D20
                  </button>
                  <button
                    type="button"
                    onClick={() => setBalleDeMatchMode('COPY_CELL')}
                    className={`p-3 rounded-xl border text-xs font-bold transition-colors ${
                      balleDeMatchMode === 'COPY_CELL'
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-800'
                    }`}
                  >
                    Cibler une case libre
                  </button>
                </div>

                {balleDeMatchMode === 'COPY_CELL' && (
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700 mb-2">
                      Choisissez la case restante à valider :
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {freeCells.map((cell) => (
                        <button
                          key={cell}
                          type="button"
                          onClick={() => setSelectedFreeCell(cell)}
                          className={`p-3 rounded-xl border font-mono-tabular font-bold text-sm ${
                            selectedFreeCell === cell
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : 'border-slate-200 bg-slate-50 text-slate-900'
                          }`}
                        >
                          Case {cell}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-3 mt-6">
              <button
                type="button"
                onClick={() => setConfiguringCard(null)}
                className="px-4 min-h-[48px] rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmConfiguredCard}
                className="flex-1 min-h-[48px] rounded-xl bg-red-600 hover:bg-red-700 text-white font-display font-bold text-lg uppercase tracking-wide"
              >
                Confirmer la Carte
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
