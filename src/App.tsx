/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Dices,
  Users,
  Tv,
  Smartphone,
  CheckCircle2,
  CornerDownRight,
  Flame,
  Sparkles,
  Plus,
  Trash2,
  Volume2,
  VolumeX,
  ArrowRight,
  AlertTriangle,
  Layers,
  BookOpen,
  Play,
  Grid,
  SlidersHorizontal,
  X,
  Mic,
  MicOff,
  Share2,
  Copy,
  Check,
} from 'lucide-react';
import {
  WorkoutConfig,
  WORKOUT_PRESETS,
  PlayerState,
  RoomState,
  TACTICAL_CARDS,
  TacticalCardId,
  ScalingLevel,
  TeamId,
  TeamMode,
  SCALING_DEFINITIONS,
  computeScaledReps,
  getTeamDisplayName,
  createPlayer,
  createInitialTurnState,
  getCellTier,
  getExerciseForCell,
  computeReboundOptions,
  drawRandomCard,
  fillHandToThree,
  getCardDefinition,
  GameLogEntry,
} from './types/game';
import { D20Roller } from './components/D20Roller';
import { AthleteGrid } from './components/AthleteGrid';
import { TacticalCardHand } from './components/TacticalCardHand';
import { TimerOverlay } from './components/TimerOverlay';
import { CoachScreenView } from './components/CoachScreenView';
import { VictoryScreen } from './components/VictoryScreen';
import { soundEngine } from './utils/sound';
import { P2PRoomManager, buildShareableRoomUrl } from './utils/multiplayerSync';

type NavTab = 'ARENA' | 'MULTI_ROOM' | 'CARDS_CATALOG' | 'RULES';

const LOCAL_STORAGE_KEY = 'd20_fitness_battle_state_v1';

interface SetupPlayerDraft {
  name: string;
  scalingLevel: ScalingLevel;
  teamId: TeamId;
}

export default function App() {
  const [activeNav, setActiveNav] = useState<NavTab>('ARENA');
  const [soundMuted, setSoundMuted] = useState(false);
  const [voiceCoachEnabled, setVoiceCoachEnabled] = useState(true);

  // Setup Form State
  const [setupMode, setSetupMode] = useState<'PASS_AND_PLAY' | 'COACH_TV' | 'JOIN_ATHLETE'>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('room')) return 'JOIN_ATHLETE';
    }
    return 'PASS_AND_PLAY';
  });
  const [workoutConfig, setWorkoutConfig] = useState<WorkoutConfig>(WORKOUT_PRESETS[0].config);
  const [showCustomExercises, setShowCustomExercises] = useState(false);
  const [setupPlayers, setSetupPlayers] = useState<SetupPlayerDraft[]>([
    { name: 'Lucas', scalingLevel: 'RX', teamId: 'ALPHA' },
    { name: 'Clara', scalingLevel: 'RX', teamId: 'BRAVO' },
  ]);
  const [newPlayerInput, setNewPlayerInput] = useState('');

  // On-demand Drawers during active workout
  const [showFullGridModal, setShowFullGridModal] = useState(false);
  const [showCardsDrawer, setShowCardsDrawer] = useState(true);
  const [copiedInviteLink, setCopiedInviteLink] = useState(false);

  // Multi-Screen Host / Join Form State
  const [hostAthleteName, setHostAthleteName] = useState('Lucas');
  const [hostPlaysToo, setHostPlaysToo] = useState(true);
  const [hostScalingLevel, setHostScalingLevel] = useState<ScalingLevel>('RX');
  const [hostTeamId, setHostTeamId] = useState<TeamId>('SOLO');
  const [joinCodeInput, setJoinCodeInput] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return (params.get('room') || '').toUpperCase().trim();
    }
    return '';
  });
  const [joinAthleteName, setJoinAthleteName] = useState('');
  const [joinScalingLevel, setJoinScalingLevel] = useState<ScalingLevel>('RX');
  const [joinTeamId, setJoinTeamId] = useState<TeamId>('SOLO');
  const [wsError, setWsError] = useState<string | null>(null);

  // Active Game / Room State
  const [room, setRoom] = useState<RoomState | null>(() => {
    try {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        // Si le joueur ouvre un lien d'invitation ?room=XXXX, afficher directement l'écran pour rejoindre
        if (params.get('room')) {
          return null;
        }
      }
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as RoomState;
        if (parsed && parsed.mode === 'PASS_AND_PLAY') {
          parsed.players = parsed.players.map((p) => ({
            ...p,
            scalingLevel: p.scalingLevel || 'RX',
            teamId: p.teamId || 'SOLO',
            hand: fillHandToThree(p.hand || [], 20 - (p.completedCells?.length || 0)),
          }));
          return parsed;
        }
      }
    } catch {
      // Ignore storage errors
    }
    return null;
  });

  const [multiScreenRole, setMultiScreenRole] = useState<'COACH' | 'ATHLETE'>('COACH');
  const [myAthleteId, setMyAthleteId] = useState<string | null>(null);

  const [activeTimerOverlay, setActiveTimerOverlay] = useState<{
    mode: 'FREEZE_45S' | 'PENALTY_TIMER';
    durationSeconds: number;
    title: string;
    subtitle: string;
    attackerName?: string | null;
    playerId: string;
  } | null>(null);

  const [isConnectingP2P, setIsConnectingP2P] = useState(false);
  const p2pManagerRef = useRef<P2PRoomManager | null>(null);

  const getP2PManager = (): P2PRoomManager => {
    if (!p2pManagerRef.current) {
      p2pManagerRef.current = new P2PRoomManager({
        onRoomCreated: (createdRoom) => {
          setWsError(null);
          setIsConnectingP2P(false);
          setRoom(createdRoom);
          setMultiScreenRole('COACH');
          setActiveNav('ARENA');
        },
        onRoomJoined: (joinedRoom, playerId) => {
          setWsError(null);
          setIsConnectingP2P(false);
          setRoom(joinedRoom);
          if (playerId) {
            setMyAthleteId(playerId);
            setMultiScreenRole('ATHLETE');
          }
          setActiveNav('ARENA');
        },
        onRoomStateUpdated: (updatedRoom) => {
          setRoom(updatedRoom);
        },
        onError: (msg) => {
          setIsConnectingP2P(false);
          setWsError(msg);
        },
        onConnectionStatusChange: (status) => {
          setIsConnectingP2P(status === 'CONNECTING');
        },
      });
    }
    return p2pManagerRef.current;
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get('room');
    if (codeParam) {
      setJoinCodeInput(codeParam.toUpperCase().trim());
      setSetupMode('JOIN_ATHLETE');
      setRoom(null);
      setActiveNav('ARENA');
    }
    return () => {
      p2pManagerRef.current?.destroy();
    };
  }, []);

  useEffect(() => {
    if (room && room.mode === 'PASS_AND_PLAY') {
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(room));
      } catch {
        // Ignore storage errors
      }
    }
  }, [room]);

  const currentActivePlayer: PlayerState | null = (() => {
    if (!room || room.players.length === 0) return null;
    if (room.mode === 'PASS_AND_PLAY') {
      return room.players[room.activePlayerIndex] || room.players[0];
    }
    if (multiScreenRole === 'ATHLETE' && myAthleteId) {
      return room.players.find((p) => p.id === myAthleteId) || room.players[0];
    }
    return room.players[0];
  })();

  useEffect(() => {
    if (!currentActivePlayer) return;
    if (
      currentActivePlayer.freezeUntilTimestamp &&
      currentActivePlayer.freezeUntilTimestamp > Date.now()
    ) {
      const remaining = Math.max(
        5,
        Math.ceil((currentActivePlayer.freezeUntilTimestamp - Date.now()) / 1000)
      );
      if (!activeTimerOverlay || activeTimerOverlay.mode !== 'FREEZE_45S') {
        soundEngine.playFreezeOrAttackAlert();
        soundEngine.speakCoach(
          `Attention ${currentActivePlayer.name} ! Attaque Gel : 45 secondes de planche statique !`
        );
        setActiveTimerOverlay({
          mode: 'FREEZE_45S',
          durationSeconds: remaining,
          title: 'Attaque GEL · 45s Planche !',
          subtitle: 'Maintenez la planche statique avant de reprendre votre série',
          attackerName: currentActivePlayer.frozenByPlayerName,
          playerId: currentActivePlayer.id,
        });
      }
    }
  }, [
    currentActivePlayer?.id,
    currentActivePlayer?.freezeUntilTimestamp,
    currentActivePlayer?.frozenByPlayerName,
  ]);

  const toggleMute = () => {
    const next = !soundMuted;
    setSoundMuted(next);
    soundEngine.muted = next;
  };

  const toggleVoiceCoach = () => {
    const next = !voiceCoachEnabled;
    setVoiceCoachEnabled(next);
    soundEngine.voiceEnabled = next;
    if (next) {
      soundEngine.speakCoach('Coach vocal activé');
    }
  };

  const handleTeamModeChange = (mode: TeamMode) => {
    setWorkoutConfig((prev) => ({ ...prev, teamMode: mode }));
    setSetupPlayers((prev) =>
      prev.map((p, idx) => ({
        ...p,
        teamId:
          mode === 'INDIVIDUAL'
            ? 'SOLO'
            : mode === 'COOP_RELAY'
            ? 'ALPHA'
            : idx % 2 === 0
            ? 'ALPHA'
            : 'BRAVO',
      }))
    );
  };

  const handleStartPassAndPlay = () => {
    const validDrafts = setupPlayers.filter((p) => p.name.trim().length > 0);
    const finalDrafts =
      validDrafts.length > 0
        ? validDrafts
        : [{ name: 'Athlète 1', scalingLevel: 'RX' as ScalingLevel, teamId: 'SOLO' as TeamId }];

    const players = finalDrafts.map((draft, i) => {
      const effectiveTeam: TeamId =
        workoutConfig.teamMode === 'INDIVIDUAL'
          ? 'SOLO'
          : workoutConfig.teamMode === 'COOP_RELAY'
          ? 'ALPHA'
          : draft.teamId === 'SOLO'
          ? i % 2 === 0
            ? 'ALPHA'
            : 'BRAVO'
          : draft.teamId;

      return createPlayer(
        draft.name,
        i,
        workoutConfig.startingCardsCount,
        draft.scalingLevel,
        effectiveTeam
      );
    });

    const newRoom: RoomState = {
      roomCode: 'LOCAL',
      mode: 'PASS_AND_PLAY',
      status: 'PLAYING',
      config: workoutConfig,
      players,
      activePlayerIndex: 0,
      winnerId: null,
      logs: [
        {
          id: `log_${Date.now()}`,
          timestamp: Date.now(),
          playerName: 'Arbitre',
          message: `Séance lancée (${players.length} joueur${players.length > 1 ? 's' : ''}) !`,
          type: 'ROLL',
        },
      ],
      createdAt: Date.now(),
    };

    setRoom(newRoom);
    setShowCardsDrawer(true);
    setShowFullGridModal(false);
    setActiveNav('ARENA');
    soundEngine.speakCoach(`C'est parti ! À ${players[0].name} de lancer le dé.`);
  };

  const handleCreateCoachRoom = (asHostPlayerName?: string) => {
    setWsError(null);
    getP2PManager().createHostRoom(
      workoutConfig,
      asHostPlayerName || '',
      hostScalingLevel,
      hostTeamId
    );
  };

  const handleCopyInviteLink = (roomCode: string) => {
    const shareUrl = buildShareableRoomUrl(roomCode);
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(shareUrl).catch(() => {});
      setCopiedInviteLink(true);
      setTimeout(() => setCopiedInviteLink(false), 2500);
    }
  };

  const handleShareInviteNative = async (roomCode: string) => {
    const shareUrl = buildShareableRoomUrl(roomCode);
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `D20 Fitness Battle — Salon ${roomCode}`,
          text: `Rejoins notre séance D20 Fitness Battle (Code : ${roomCode}) :`,
          url: shareUrl,
        });
        return;
      } catch {
        // Fallback to clipboard copy
      }
    }
    handleCopyInviteLink(roomCode);
  };

  const handleJoinRoomAsAthlete = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCodeInput.trim()) {
      setWsError('Veuillez saisir le code du salon à 4 caractères.');
      return;
    }
    setWsError(null);
    getP2PManager().joinHostRoom(
      joinCodeInput.toUpperCase().trim(),
      joinAthleteName.trim() || 'Athlète',
      joinScalingLevel,
      joinTeamId
    );
  };

  const commitPlayerUpdate = (
    updatedPlayer: PlayerState,
    options?: {
      advanceTurnInPassAndPlay?: boolean;
      logMessage?: string;
      logType?: GameLogEntry['type'];
      targetUpdate?: {
        targetPlayerId: string;
        freezeSeconds?: number;
        addExtraReps?: number;
      };
    }
  ) => {
    if (!room) return;

    const logEntry: GameLogEntry | undefined = options?.logMessage
      ? {
          id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          timestamp: Date.now(),
          playerName: updatedPlayer.name,
          message: options.logMessage,
          type: options.logType || 'ROLL',
        }
      : undefined;

    if (room.mode === 'MULTI_SCREEN') {
      getP2PManager().syncPlayerAction(updatedPlayer, options?.targetUpdate, logEntry);
      return;
    }

    setRoom((prev) => {
      if (!prev) return prev;

      // Merge team completed cells if player belongs to ALPHA or BRAVO
      const sharedTeamCells =
        updatedPlayer.teamId && updatedPlayer.teamId !== 'SOLO'
          ? Array.from(
              new Set([
                ...updatedPlayer.completedCells,
                ...prev.players
                  .filter((p) => p.teamId === updatedPlayer.teamId)
                  .flatMap((p) => p.completedCells),
              ])
            ).sort((a, b) => a - b)
          : null;

      const nextPlayers = prev.players.map((p) => {
        if (p.id === updatedPlayer.id) {
          return sharedTeamCells
            ? { ...updatedPlayer, completedCells: sharedTeamCells }
            : updatedPlayer;
        }

        let copy = { ...p };
        if (sharedTeamCells && p.teamId === updatedPlayer.teamId) {
          copy.completedCells = sharedTeamCells;
        }

        if (options?.targetUpdate && p.id === options.targetUpdate.targetPlayerId) {
          copy = { ...copy, turn: { ...copy.turn, notes: [...copy.turn.notes] } };
          if (options.targetUpdate.freezeSeconds) {
            copy.freezeUntilTimestamp = Date.now() + options.targetUpdate.freezeSeconds * 1000;
            copy.frozenByPlayerName = updatedPlayer.name;
          }
          if (options.targetUpdate.addExtraReps) {
            copy.pendingExtraReps += options.targetUpdate.addExtraReps;
            copy.pendingExtraRepsFrom = [...copy.pendingExtraRepsFrom, updatedPlayer.name];
            if (copy.turn.phase === 'ROLLED' || copy.turn.phase === 'EXECUTING_REPS') {
              copy.turn.finalReps += options.targetUpdate.addExtraReps;
              copy.turn.notes.push(
                `+${options.targetUpdate.addExtraReps} rép. (${updatedPlayer.name})`
              );
            }
          }
        }
        return copy;
      });

      const finished = nextPlayers.find((p) => p.completedCells.length >= 20);
      const nextStatus = finished ? 'GAME_OVER' : prev.status;
      const nextWinnerId = finished ? finished.id : prev.winnerId;

      if (finished && prev.status !== 'GAME_OVER') {
        soundEngine.speakCoach(
          `Victoire de ${finished.name} ! Les 20 cases de la grille sont complétées !`
        );
      }

      const nextIndex =
        options?.advanceTurnInPassAndPlay && prev.players.length > 1
          ? (prev.activePlayerIndex + 1) % prev.players.length
          : prev.activePlayerIndex;

      const nextLogs = logEntry ? [logEntry, ...prev.logs].slice(0, 40) : prev.logs;

      return {
        ...prev,
        status: nextStatus,
        winnerId: nextWinnerId,
        players: nextPlayers,
        activePlayerIndex: nextIndex,
        logs: nextLogs,
      };
    });
  };

  // Cycle current player's Scaling Level (×0.5 Débutant -> ×1.0 RX -> ×1.5 Élite)
  const handleCyclePlayerScaling = () => {
    if (!currentActivePlayer) return;
    const order: ScalingLevel[] = ['SCALED', 'RX', 'ELITE'];
    const nextLevel =
      order[(order.indexOf(currentActivePlayer.scalingLevel || 'RX') + 1) % order.length];

    let nextTurn = { ...currentActivePlayer.turn };
    if (
      nextTurn.phase === 'EXECUTING_REPS' &&
      nextTurn.selectedTargetCells.length > 0 &&
      nextTurn.activeCardUsed !== 'PASSE_DROIT'
    ) {
      const rawCellSum = nextTurn.selectedTargetCells.reduce((a, b) => a + b, 0);
      const scaledBase = computeScaledReps(rawCellSum, nextLevel);
      const finalReps =
        nextTurn.activeCardUsed === 'DEMI_TARIF' || nextTurn.activeCardUsed === 'PARTAGE_CHARGE'
          ? Math.floor(scaledBase / 2)
          : scaledBase;
      nextTurn = {
        ...nextTurn,
        baseReps: scaledBase,
        finalReps,
      };
    }

    const updated: PlayerState = {
      ...currentActivePlayer,
      scalingLevel: nextLevel,
      turn: nextTurn,
    };
    commitPlayerUpdate(updated);
  };

  // Resolve a D20 roll value: locks the die & applies individual Scaling + Voice Coach
  const applyDiceRollForPlayer = (
    player: PlayerState,
    primaryRoll: number,
    secondaryRoll: number | null = null,
    isRerollFromCard: boolean = false
  ) => {
    if (player.turn.phase !== 'IDLE' && !isRerollFromCard) {
      return;
    }

    soundEngine.playDiceRoll();

    const isDup = player.completedCells.includes(primaryRoll);
    const reboundOpts = isDup ? computeReboundOptions(primaryRoll, player.completedCells) : [];

    const incomingExtra = player.pendingExtraReps;
    const incomingNotes: string[] = [];

    if (player.scalingLevel && player.scalingLevel !== 'RX') {
      incomingNotes.push(`Niveau ${SCALING_DEFINITIONS[player.scalingLevel].label}`);
    }
    if (incomingExtra > 0) {
      incomingNotes.push(
        `+${incomingExtra} rép. (malus de ${player.pendingExtraRepsFrom.join(', ')})`
      );
    }

    const scaledBase = computeScaledReps(primaryRoll, player.scalingLevel);
    const finalReps = scaledBase + incomingExtra;
    const exName = room ? getExerciseForCell(primaryRoll, room.config) : 'répétitions';

    if (isDup) {
      soundEngine.playDuplicateAlert();
      soundEngine.speakCoach(
        `Case ${primaryRoll} déjà cochée ! Choisissez le rebond vers ${reboundOpts.join(
          ' ou '
        )}, ou la pénalité active.`
      );
    } else {
      soundEngine.speakCoach(`Case ${primaryRoll} : ${finalReps} ${exName} !`);
    }

    const autoSelectedTargets = !isDup ? [primaryRoll] : [];

    const updatedPlayer: PlayerState = {
      ...player,
      pendingExtraReps: 0,
      pendingExtraRepsFrom: [],
      stats: {
        ...player.stats,
        rollsCount: player.stats.rollsCount + 1,
        duplicatesHit: isDup ? player.stats.duplicatesHit + 1 : player.stats.duplicatesHit,
      },
      turn: {
        phase: isDup ? 'ROLLED' : 'EXECUTING_REPS',
        diceRoll: primaryRoll,
        secondaryDiceRoll: secondaryRoll,
        doubleDiceActive: false,
        isDuplicate: isDup,
        reboundOptions: reboundOpts,
        selectedTargetCells: autoSelectedTargets,
        baseReps: scaledBase,
        finalReps,
        activeCardUsed: player.turn.doubleDiceActive
          ? 'DOUBLE_DE'
          : isRerollFromCard
          ? 'BALLE_DE_MATCH'
          : null,
        notes: incomingNotes,
      },
    };

    commitPlayerUpdate(updatedPlayer, {
      logMessage: isDup
        ? `A tiré ${primaryRoll} (Doublon ! Rebond ${reboundOpts.join('/')} ou Pénalité)`
        : `A tiré ${primaryRoll} (${finalReps} ${exName})`,
      logType: 'ROLL',
    });
  };

  const handleRollVirtual = () => {
    if (!currentActivePlayer || currentActivePlayer.turn.phase !== 'IDLE') return;
    const roll1 = Math.floor(Math.random() * 20) + 1;
    if (currentActivePlayer.turn.doubleDiceActive) {
      const roll2 = Math.floor(Math.random() * 20) + 1;
      const r1Free = !currentActivePlayer.completedCells.includes(roll1);
      const r2Free = !currentActivePlayer.completedCells.includes(roll2);
      if (!r1Free && r2Free) {
        applyDiceRollForPlayer(currentActivePlayer, roll2, roll1);
      } else {
        applyDiceRollForPlayer(currentActivePlayer, roll1, roll2);
      }
    } else {
      applyDiceRollForPlayer(currentActivePlayer, roll1, null);
    }
  };

  const handleSelectManualRoll = (val: number) => {
    if (!currentActivePlayer || currentActivePlayer.turn.phase !== 'IDLE') return;
    applyDiceRollForPlayer(currentActivePlayer, val, null);
  };

  const handleChooseDoubleDieResult = (chosenVal: number) => {
    if (!currentActivePlayer || currentActivePlayer.turn.secondaryDiceRoll === null) return;
    const otherVal =
      chosenVal === currentActivePlayer.turn.diceRoll
        ? currentActivePlayer.turn.secondaryDiceRoll
        : currentActivePlayer.turn.diceRoll;
    applyDiceRollForPlayer(currentActivePlayer, chosenVal, otherVal, true);
  };

  const handleSelectReboundCell = (cellNumber: number) => {
    if (!currentActivePlayer || !room) return;
    const extraFromNotes = currentActivePlayer.turn.finalReps - currentActivePlayer.turn.baseReps;
    const scaledBase = computeScaledReps(cellNumber, currentActivePlayer.scalingLevel);
    const nextFinal = Math.max(1, scaledBase + extraFromNotes);
    const exName = getExerciseForCell(cellNumber, room.config);

    soundEngine.speakCoach(`Rebond case ${cellNumber} : ${nextFinal} ${exName} !`);

    const updated: PlayerState = {
      ...currentActivePlayer,
      turn: {
        ...currentActivePlayer.turn,
        phase: 'EXECUTING_REPS',
        isDuplicate: false,
        selectedTargetCells: [cellNumber],
        baseReps: scaledBase,
        finalReps: nextFinal,
        notes: [
          ...currentActivePlayer.turn.notes,
          `Rebond depuis la case ${currentActivePlayer.turn.diceRoll} vers la case ${cellNumber}`,
        ],
      },
    };
    commitPlayerUpdate(updated);
  };

  const handleStartDuplicatePenalty = () => {
    if (!currentActivePlayer || !room) return;
    soundEngine.speakCoach(
      `Pénalité active : ${room.config.penaltyValue} ${
        room.config.penaltyType === 'TIMER' ? 'secondes de' : ''
      } ${room.config.penaltyExercise} !`
    );
    if (room.config.penaltyType === 'TIMER') {
      setActiveTimerOverlay({
        mode: 'PENALTY_TIMER',
        durationSeconds: room.config.penaltyValue,
        title: `Pénalité Active · ${room.config.penaltyValue}s`,
        subtitle: `${room.config.penaltyExercise} pour renouveler 1 Carte Tactique`,
        playerId: currentActivePlayer.id,
      });
    } else {
      const updated: PlayerState = {
        ...currentActivePlayer,
        turn: {
          ...currentActivePlayer.turn,
          phase: 'EXECUTING_PENALTY',
        },
      };
      commitPlayerUpdate(updated);
    }
  };

  const handleCompleteDuplicatePenalty = () => {
    if (!currentActivePlayer || !room) return;
    soundEngine.playCardActivated();

    const remainingCount = 20 - currentActivePlayer.completedCells.length;
    const freshCard = drawRandomCard(currentActivePlayer.hand, remainingCount);
    const baseHand =
      currentActivePlayer.hand.length >= 3
        ? [...currentActivePlayer.hand.slice(1), freshCard]
        : [...currentActivePlayer.hand, freshCard];
    const nextHand = fillHandToThree(baseHand, remainingCount);

    const isTimer = room.config.penaltyType === 'TIMER';
    const addReps = isTimer ? 0 : room.config.penaltyValue;
    const addSeconds = isTimer ? room.config.penaltyValue : 0;

    const updated: PlayerState = {
      ...currentActivePlayer,
      hand: nextHand,
      stats: {
        ...currentActivePlayer.stats,
        totalRepsExecuted: currentActivePlayer.stats.totalRepsExecuted + addReps,
        penaltyReps: currentActivePlayer.stats.penaltyReps + addReps,
        penaltySeconds: currentActivePlayer.stats.penaltySeconds + addSeconds,
      },
      turn: createInitialTurnState(),
    };

    const cardName = getCardDefinition(freshCard.cardId).name;
    soundEngine.speakCoach(`Pénalité validée ! Nouvelle carte : ${cardName}.`);

    commitPlayerUpdate(updated, {
      advanceTurnInPassAndPlay: true,
      logMessage: `A validé la Pénalité Active et obtient « ${cardName} » (Deck 3/3) !`,
      logType: 'PENALTY',
    });
  };

  const handleValidateSetAndCheckCells = () => {
    if (!currentActivePlayer || !room) return;
    const targets = currentActivePlayer.turn.selectedTargetCells;
    if (targets.length === 0) return;

    soundEngine.playCellValidated();

    const repsDone = currentActivePlayer.turn.finalReps;
    const primaryCell = targets[0];
    const tier = getCellTier(primaryCell);

    const newCompleted = Array.from(
      new Set([...currentActivePlayer.completedCells, ...targets])
    ).sort((a, b) => a - b);

    const remainingCells = 20 - newCompleted.length;

    const updated: PlayerState = {
      ...currentActivePlayer,
      completedCells: newCompleted,
      hand: fillHandToThree(currentActivePlayer.hand, remainingCells),
      stats: {
        ...currentActivePlayer.stats,
        totalRepsExecuted: currentActivePlayer.stats.totalRepsExecuted + repsDone,
        greenReps:
          tier === 'GREEN'
            ? currentActivePlayer.stats.greenReps + repsDone
            : currentActivePlayer.stats.greenReps,
        yellowReps:
          tier === 'YELLOW'
            ? currentActivePlayer.stats.yellowReps + repsDone
            : currentActivePlayer.stats.yellowReps,
        redReps:
          tier === 'RED'
            ? currentActivePlayer.stats.redReps + repsDone
            : currentActivePlayer.stats.redReps,
      },
      turn: createInitialTurnState(),
    };

    if (newCompleted.length < 20) {
      if (room.mode === 'PASS_AND_PLAY' && room.players.length > 1) {
        const nextPlayer = room.players[(room.activePlayerIndex + 1) % room.players.length];
        soundEngine.speakCoach(
          `Case validée ! À ${nextPlayer.name} de lancer le dé.`
        );
      } else {
        soundEngine.speakCoach(`Case ${targets.join(' et ')} validée ! ${newCompleted.length} sur 20.`);
      }
    }

    commitPlayerUpdate(updated, {
      advanceTurnInPassAndPlay: true,
      logMessage: `Valide ${
        targets.length > 1 ? `les cases ${targets.join(' & ')}` : `la case ${primaryCell}`
      } (${repsDone} rép. exécutées · ${newCompleted.length}/20)`,
      logType: 'VALIDATE',
    });
  };

  const handlePlayTacticalCard = (
    instanceId: string,
    cardId: TacticalCardId,
    options?: {
      targetPlayerId?: string;
      chosenCells?: number[];
      balleDeMatchAction?: 'REROLL' | 'COPY_CELL';
    }
  ) => {
    if (!currentActivePlayer || !room) return;
    soundEngine.playCardActivated();

    const remainingCount = 20 - currentActivePlayer.completedCells.length;
    const filteredHand = currentActivePlayer.hand.filter((c) => c.instanceId !== instanceId);
    const remainingHand = fillHandToThree(filteredHand, remainingCount);
    const nextStats = {
      ...currentActivePlayer.stats,
      cardsPlayed: currentActivePlayer.stats.cardsPlayed + 1,
    };

    switch (cardId) {
      case 'DOUBLE_DE': {
        soundEngine.speakCoach('Carte Double Dé activée ! Lancez les 2 dés.');
        const updated: PlayerState = {
          ...currentActivePlayer,
          hand: remainingHand,
          stats: nextStats,
          turn: {
            ...currentActivePlayer.turn,
            doubleDiceActive: true,
            activeCardUsed: 'DOUBLE_DE',
            notes: [...currentActivePlayer.turn.notes, 'Double Dé activé (2 dés au lancer)'],
          },
        };
        commitPlayerUpdate(updated, {
          logMessage: 'Active la carte « Double Dé » pour son lancer !',
          logType: 'CARD',
        });
        break;
      }

      case 'PASSE_DROIT': {
        const targetCell =
          options?.chosenCells?.[0] ||
          currentActivePlayer.turn.selectedTargetCells[0] ||
          currentActivePlayer.turn.diceRoll ||
          1;

        const newCompleted = Array.from(
          new Set([...currentActivePlayer.completedCells, targetCell])
        ).sort((a, b) => a - b);

        soundEngine.playCellValidated();
        soundEngine.speakCoach(`Passe-Droit utilisé ! La case ${targetCell} est validée sans répétitions.`);

        const updated: PlayerState = {
          ...currentActivePlayer,
          completedCells: newCompleted,
          hand: remainingHand,
          stats: nextStats,
          turn: createInitialTurnState(),
        };
        commitPlayerUpdate(updated, {
          advanceTurnInPassAndPlay: true,
          logMessage: `Joue « Passe-Droit (Joker) » et valide la case ${targetCell} sans répétitions !`,
          logType: 'CARD',
        });
        break;
      }

      case 'DEMI_TARIF': {
        const halved = Math.floor(currentActivePlayer.turn.finalReps / 2);
        soundEngine.speakCoach(`Demi-Tarif activé ! Plus que ${halved} répétitions.`);
        const updated: PlayerState = {
          ...currentActivePlayer,
          hand: remainingHand,
          stats: nextStats,
          turn: {
            ...currentActivePlayer.turn,
            phase: 'EXECUTING_REPS',
            isDuplicate: false,
            selectedTargetCells:
              currentActivePlayer.turn.selectedTargetCells.length > 0
                ? currentActivePlayer.turn.selectedTargetCells
                : currentActivePlayer.turn.reboundOptions.slice(0, 1),
            finalReps: halved,
            activeCardUsed: 'DEMI_TARIF',
            notes: [
              ...currentActivePlayer.turn.notes,
              `Demi-Tarif appliqué (${halved} rép. au lieu de ${currentActivePlayer.turn.finalReps})`,
            ],
          },
        };
        commitPlayerUpdate(updated, {
          logMessage: `Joue « Demi-Tarif » : série réduite à ${halved} répétitions !`,
          logType: 'CARD',
        });
        break;
      }

      case 'GLISSADE': {
        const chosenCell = options?.chosenCells?.[0];
        if (!chosenCell) return;
        const scaledReps = computeScaledReps(chosenCell, currentActivePlayer.scalingLevel);
        const exName = getExerciseForCell(chosenCell, room.config);
        soundEngine.speakCoach(`Glissade vers la case ${chosenCell} : ${scaledReps} ${exName} !`);

        const updated: PlayerState = {
          ...currentActivePlayer,
          hand: remainingHand,
          stats: nextStats,
          turn: {
            ...currentActivePlayer.turn,
            phase: 'EXECUTING_REPS',
            isDuplicate: false,
            selectedTargetCells: [chosenCell],
            baseReps: scaledReps,
            finalReps: scaledReps,
            activeCardUsed: 'GLISSADE',
            notes: [
              ...currentActivePlayer.turn.notes,
              `Glissade Libératrice vers la case ${chosenCell}`,
            ],
          },
        };
        commitPlayerUpdate(updated, {
          logMessage: `Joue « Glissade Libératrice » et cible la case ${chosenCell} !`,
          logType: 'CARD',
        });
        break;
      }

      case 'SCISSION': {
        const pair = options?.chosenCells;
        if (!pair || pair.length !== 2) return;
        const sumReps = computeScaledReps(pair[0] + pair[1], currentActivePlayer.scalingLevel);
        soundEngine.speakCoach(
          `Scission sur les cases ${pair[0]} et ${pair[1]} : ${sumReps} répétitions !`
        );

        const updated: PlayerState = {
          ...currentActivePlayer,
          hand: remainingHand,
          stats: nextStats,
          turn: {
            ...currentActivePlayer.turn,
            phase: 'EXECUTING_REPS',
            isDuplicate: false,
            selectedTargetCells: [pair[0], pair[1]],
            baseReps: sumReps,
            finalReps: sumReps,
            activeCardUsed: 'SCISSION',
            notes: [
              ...currentActivePlayer.turn.notes,
              `Scission : Cases ${pair[0]} & ${pair[1]} (${sumReps} rép.)`,
            ],
          },
        };
        commitPlayerUpdate(updated, {
          logMessage: `Joue « Scission » pour cocher les 2 cases ${pair[0]} et ${pair[1]} !`,
          logType: 'CARD',
        });
        break;
      }

      case 'DOUBLE_MISE': {
        const pair = options?.chosenCells;
        if (!pair || pair.length !== 2) return;
        const totalReps = computeScaledReps(pair[0] + pair[1], currentActivePlayer.scalingLevel);
        soundEngine.speakCoach(
          `Double Mise sur les cases ${pair[0]} et ${pair[1]} : ${totalReps} répétitions !`
        );

        const updated: PlayerState = {
          ...currentActivePlayer,
          hand: remainingHand,
          stats: nextStats,
          turn: {
            ...currentActivePlayer.turn,
            phase: 'EXECUTING_REPS',
            isDuplicate: false,
            selectedTargetCells: [pair[0], pair[1]],
            baseReps: totalReps,
            finalReps: totalReps,
            activeCardUsed: 'DOUBLE_MISE',
            notes: [
              ...currentActivePlayer.turn.notes,
              `Double Mise : Cases ${pair[0]} + ${pair[1]} (${totalReps} rép. cumulées)`,
            ],
          },
        };
        commitPlayerUpdate(updated, {
          logMessage: `Joue « Double Mise » sur les cases ${pair[0]} et ${pair[1]} (${totalReps} rép.) !`,
          logType: 'CARD',
        });
        break;
      }

      case 'GEL': {
        const targetId = options?.targetPlayerId;
        const targetPlayer = room.players.find((p) => p.id === targetId);
        soundEngine.playFreezeOrAttackAlert();
        soundEngine.speakCoach(
          `Attaque Gel ! 45 secondes de planche pour ${
            targetPlayer ? targetPlayer.name : 'votre adversaire'
          } !`
        );

        const updated: PlayerState = {
          ...currentActivePlayer,
          hand: remainingHand,
          stats: nextStats,
        };

        if (room.mode === 'PASS_AND_PLAY') {
          setActiveTimerOverlay({
            mode: 'FREEZE_45S',
            durationSeconds: 45,
            title: `GEL · 45s Planche pour ${targetPlayer ? targetPlayer.name : 'Adversaire'} !`,
            subtitle: `Déclenché par ${currentActivePlayer.name}`,
            attackerName: currentActivePlayer.name,
            playerId: targetPlayer ? targetPlayer.id : currentActivePlayer.id,
          });
        }

        commitPlayerUpdate(updated, {
          targetUpdate: targetId
            ? {
                targetPlayerId: targetId,
                freezeSeconds: 45,
              }
            : undefined,
          logMessage: `Attaque « GEL (45s Planche) » envoyée sur ${
            targetPlayer ? targetPlayer.name : 'un adversaire'
          } !`,
          logType: 'ATTACK',
        });
        break;
      }

      case 'LEST_TACTIQUE': {
        const targetId = options?.targetPlayerId;
        const targetPlayer = room.players.find((p) => p.id === targetId);
        soundEngine.playFreezeOrAttackAlert();
        soundEngine.speakCoach(
          `Lest Tactique ! Plus 4 répétitions pour ${
            targetPlayer ? targetPlayer.name : 'votre rival'
          } !`
        );

        const updated: PlayerState = {
          ...currentActivePlayer,
          hand: remainingHand,
          stats: nextStats,
        };

        commitPlayerUpdate(updated, {
          targetUpdate: targetId
            ? {
                targetPlayerId: targetId,
                addExtraReps: 4,
              }
            : undefined,
          logMessage: `Inflige « Lest Tactique (+4 rép.) » à ${
            targetPlayer ? targetPlayer.name : 'son rival'
          } !`,
          logType: 'ATTACK',
        });
        break;
      }

      case 'PARTAGE_CHARGE': {
        const targetId = options?.targetPlayerId;
        const targetPlayer = room.players.find((p) => p.id === targetId);
        const myHalf = Math.floor(currentActivePlayer.turn.finalReps / 2);
        const rivalHalf = Math.ceil(currentActivePlayer.turn.finalReps / 2);

        soundEngine.speakCoach(
          `Partage Charge : ${myHalf} répétitions pour vous, et ${rivalHalf} transférées à ${
            targetPlayer?.name || 'votre rival'
          } !`
        );

        const updated: PlayerState = {
          ...currentActivePlayer,
          hand: remainingHand,
          stats: nextStats,
          turn: {
            ...currentActivePlayer.turn,
            phase: 'EXECUTING_REPS',
            isDuplicate: false,
            selectedTargetCells:
              currentActivePlayer.turn.selectedTargetCells.length > 0
                ? currentActivePlayer.turn.selectedTargetCells
                : currentActivePlayer.turn.reboundOptions.slice(0, 1),
            finalReps: myHalf,
            activeCardUsed: 'PARTAGE_CHARGE',
            notes: [
              ...currentActivePlayer.turn.notes,
              `Partage Charge : ${myHalf} rép. pour vous, +${rivalHalf} rép. transférées à ${
                targetPlayer?.name || 'votre rival'
              }`,
            ],
          },
        };

        commitPlayerUpdate(updated, {
          targetUpdate: targetId
            ? {
                targetPlayerId: targetId,
                addExtraReps: rivalHalf,
              }
            : undefined,
          logMessage: `Joue « Partage Charge » : garde ${myHalf} rép. et transfère +${rivalHalf} rép. à ${
            targetPlayer?.name || 'son rival'
          } !`,
          logType: 'ATTACK',
        });
        break;
      }

      case 'BALLE_DE_MATCH': {
        if (options?.balleDeMatchAction === 'COPY_CELL' && options.chosenCells?.[0]) {
          const cell = options.chosenCells[0];
          const scaledReps = computeScaledReps(cell, currentActivePlayer.scalingLevel);
          soundEngine.speakCoach(`Balle de Match : cible la case ${cell} pour ${scaledReps} répétitions !`);

          const updated: PlayerState = {
            ...currentActivePlayer,
            hand: remainingHand,
            stats: nextStats,
            turn: {
              ...currentActivePlayer.turn,
              phase: 'EXECUTING_REPS',
              isDuplicate: false,
              selectedTargetCells: [cell],
              baseReps: scaledReps,
              finalReps: scaledReps,
              activeCardUsed: 'BALLE_DE_MATCH',
              notes: [...currentActivePlayer.turn.notes, `Balle de Match : cible la case ${cell}`],
            },
          };
          commitPlayerUpdate(updated, {
            logMessage: `Joue « Balle de Match » et cible la case finale ${cell} !`,
            logType: 'CARD',
          });
        } else {
          const newRoll = Math.floor(Math.random() * 20) + 1;
          const tempPlayer: PlayerState = {
            ...currentActivePlayer,
            hand: remainingHand,
            stats: nextStats,
          };
          applyDiceRollForPlayer(tempPlayer, newRoll, null, true);
        }
        break;
      }
    }
  };

  const handleDiscardCard = (instanceId: string) => {
    if (!currentActivePlayer) return;
    const remainingCount = 20 - currentActivePlayer.completedCells.length;
    const withoutCard = currentActivePlayer.hand.filter((c) => c.instanceId !== instanceId);
    const updated: PlayerState = {
      ...currentActivePlayer,
      hand: fillHandToThree(withoutCard, remainingCount),
    };
    commitPlayerUpdate(updated);
  };

  const handleResetToSetup = () => {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    p2pManagerRef.current?.destroy();
    p2pManagerRef.current = null;
    setRoom(null);
    setShowFullGridModal(false);
    setActiveNav('ARENA');
  };

  const handlePlayAgainSamePlayers = () => {
    if (!room) return;
    const resetPlayers = room.players.map((p, idx) =>
      createPlayer(p.name, idx, room.config.startingCardsCount, p.scalingLevel, p.teamId)
    );
    const nextRoom: RoomState = {
      ...room,
      status: 'PLAYING',
      activePlayerIndex: 0,
      winnerId: null,
      players: resetPlayers,
      logs: [
        {
          id: `log_${Date.now()}`,
          timestamp: Date.now(),
          playerName: 'Arbitre',
          message: 'Nouvelle manche lancée avec les mêmes athlètes !',
          type: 'ROLL',
        },
      ],
    };

    if (room.mode === 'MULTI_SCREEN') {
      getP2PManager().syncFullRoomState(nextRoom);
    } else {
      setRoom(nextRoom);
    }
  };

  const getTargetTierVisuals = (cellNum: number) => {
    const tier = getCellTier(cellNum);
    if (tier === 'GREEN') {
      return {
        label: 'Palier Vert',
        bg: 'bg-emerald-50 border-emerald-300',
        accentText: 'text-emerald-700',
        badgeBg: 'bg-emerald-600 text-white',
      };
    }
    if (tier === 'YELLOW') {
      return {
        label: 'Palier Jaune',
        bg: 'bg-amber-50 border-amber-300',
        accentText: 'text-amber-800',
        badgeBg: 'bg-amber-500 text-slate-950',
      };
    }
    return {
      label: 'Palier Rouge',
      bg: 'bg-red-50 border-red-300',
      accentText: 'text-red-700',
      badgeBg: 'bg-red-600 text-white',
    };
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Mandatory 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 px-6 py-3.5 flex items-center justify-between gap-8">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveNav('ARENA');
          }}
          className="text-2xl font-extrabold uppercase tracking-tight text-slate-900 font-display whitespace-nowrap shrink-0"
        >
          D20 Fitness Battle
        </a>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <button
            type="button"
            onClick={() => setActiveNav('ARENA')}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
              activeNav === 'ARENA'
                ? 'text-slate-900 font-semibold border-b-2 border-red-600'
                : ''
            }`}
          >
            Arène de Jeu
          </button>
          <button
            type="button"
            onClick={() => {
              setSetupMode('COACH_TV');
              setActiveNav('MULTI_ROOM');
            }}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
              activeNav === 'MULTI_ROOM'
                ? 'text-slate-900 font-semibold border-b-2 border-red-600'
                : ''
            }`}
          >
            Salle Multi-Écrans
          </button>
          <button
            type="button"
            onClick={() => setActiveNav('CARDS_CATALOG')}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
              activeNav === 'CARDS_CATALOG'
                ? 'text-slate-900 font-semibold border-b-2 border-red-600'
                : ''
            }`}
          >
            Deck Tactique (10)
          </button>
          <button
            type="button"
            onClick={() => setActiveNav('RULES')}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
              activeNav === 'RULES'
                ? 'text-slate-900 font-semibold border-b-2 border-red-600'
                : ''
            }`}
          >
            Règles du Jeu
          </button>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleResetToSetup}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-xl hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            Nouvelle Séance
          </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* TAB: DECK TACTIQUE (10 CARTES) */}
        {activeNav === 'CARDS_CATALOG' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-3xl p-6">
              <div>
                <h1 className="font-display font-extrabold text-3xl uppercase text-slate-900">
                  Les 10 Cartes Tactiques Officielles
                </h1>
                <p className="text-sm text-slate-600 mt-1">
                  Chaque athlète dispose en permanence de 3 cartes tactiques dans son deck.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveNav('ARENA')}
                className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold whitespace-nowrap shrink-0"
              >
                Retourner à l’Arène
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {TACTICAL_CARDS.map((card) => (
                <div
                  key={card.id}
                  className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between shadow-2xs"
                >
                  <div>
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                      <span className="font-mono-tabular font-bold text-slate-900">
                        Carte #{String(card.number).padStart(2, '0')}
                      </span>
                      <span>·</span>
                      <span>
                        {card.category === 'BOOST'
                          ? 'Avantage Athlète'
                          : card.category === 'OFFENSIVE'
                          ? 'Attaque Rivale'
                          : 'Tactique de Grille'}
                      </span>
                    </div>
                    <h3 className="font-display font-extrabold text-2xl uppercase text-slate-900">
                      {card.name}
                    </h3>
                    <div className="mt-2 py-1.5 px-3 rounded-xl bg-slate-900 text-white font-mono-tabular font-extrabold text-xs tracking-wide inline-block">
                      {card.impactFormula}
                    </div>
                    <p className="text-sm text-slate-600 mt-2.5 leading-relaxed">{card.fullDesc}</p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
                    Activation :{' '}
                    <strong className="text-slate-800">
                      {card.timing === 'BEFORE_ROLL'
                        ? 'Avant de lancer le D20'
                        : card.timing === 'ATTACK_ANYTIME'
                        ? 'À tout moment contre un rival'
                        : 'Après le lancer du D20'}
                    </strong>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB: RÈGLES DU JEU */}
        {activeNav === 'RULES' && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-6">
              <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-5">
                <div>
                  <h1 className="font-display font-extrabold text-3xl uppercase text-slate-900">
                    Règles Officielles · D20 Fitness Battle
                  </h1>
                  <p className="text-sm text-slate-600 mt-1">
                    20 cases · Scaling Individuel (×0.5 / RX / ×1.5) · Mode Solo ou Équipes
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveNav('ARENA')}
                  className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold whitespace-nowrap shrink-0"
                >
                  Retour au Jeu
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200">
                  <div className="font-display font-bold text-xl uppercase text-emerald-900">
                    01. Palier Vert (1 à 6)
                  </div>
                  <p className="text-xs text-emerald-950/80 mt-1 leading-relaxed">
                    Séries courtes et explosives (ex: Burpees).
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200">
                  <div className="font-display font-bold text-xl uppercase text-amber-900">
                    02. Palier Jaune (7 à 13)
                  </div>
                  <p className="text-xs text-amber-950/80 mt-1 leading-relaxed">
                    Séries intermédiaires de résistance musculaire (ex: Pompes).
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-red-50 border border-red-200">
                  <div className="font-display font-bold text-xl uppercase text-red-900">
                    03. Palier Rouge (14 à 20)
                  </div>
                  <p className="text-xs text-red-950/80 mt-1 leading-relaxed">
                    Séries lourdes d’endurance (ex: Air Squats).
                  </p>
                </div>
              </div>

              <div className="space-y-4 text-sm text-slate-700 leading-relaxed">
                <h3 className="font-display font-bold text-2xl uppercase text-slate-900">
                  Nouveautés : Mode Équipes, Scaling & Coach Vocal
                </h3>
                <ul className="list-disc pl-5 space-y-2">
                  <li>
                    <strong>Scaling Individuel :</strong> Chaque joueur choisit son niveau (<strong>×0.5 Débutant</strong>, <strong>×1.0 RX</strong> ou <strong>×1.5 Élite</strong>) pour adapter ses répétitions tout en jouant dans la même partie.
                  </li>
                  <li>
                    <strong>Mode Équipes / Relais :</strong> Partagez une même grille de 20 cases avec votre binôme (en Relais Coopératif ou en Duel d’Équipes Alpha vs Bravo).
                  </li>
                  <li>
                    <strong>Coach Vocal :</strong> L’application annonce à voix haute l’exercice tiré, les répétitions et les attaques reçues.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* TAB: SALLE MULTI-ÉCRANS */}
        {activeNav === 'MULTI_ROOM' && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs">
              <h1 className="font-display font-extrabold text-3xl uppercase text-slate-900">
                Salon Multi-Téléphones en Direct
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                Ouvrez un salon en 1 clic pour obtenir un code à 4 lettres et inviter vos clients par lien.
              </p>

              {wsError && (
                <div className="mt-4 p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-800">
                  {wsError}
                </div>
              )}

              {isConnectingP2P && (
                <div className="mt-4 p-3.5 rounded-xl bg-sky-50 border border-sky-200 text-xs font-semibold text-sky-900">
                  Connexion en direct au salon en cours...
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                {/* Create Room (Simplified) */}
                <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50 flex flex-col justify-between space-y-4">
                  <div className="space-y-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center">
                      <Tv className="w-5 h-5" />
                    </div>
                    <h3 className="font-display font-bold text-2xl uppercase text-slate-900">
                      1. Héberger un Salon (Hôte)
                    </h3>
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={hostPlaysToo}
                        onChange={(e) => setHostPlaysToo(e.target.checked)}
                        className="rounded border-slate-300 text-red-600 focus:ring-red-600"
                      />
                      <span>Je participe aussi comme joueur sur ce téléphone</span>
                    </label>

                    {hostPlaysToo && (
                      <>
                        <div>
                          <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                            Votre Prénom
                          </label>
                          <input
                            type="text"
                            value={hostAthleteName}
                            onChange={(e) => setHostAthleteName(e.target.value)}
                            placeholder="Ex: Lucas"
                            className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm text-slate-900"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                              Niveau Scaling
                            </label>
                            <select
                              value={hostScalingLevel}
                              onChange={(e) => setHostScalingLevel(e.target.value as ScalingLevel)}
                              className="w-full h-10 px-2.5 rounded-xl border border-slate-300 bg-white text-xs font-bold"
                            >
                              <option value="SCALED">×0.5 Débutant</option>
                              <option value="RX">×1.0 RX</option>
                              <option value="ELITE">×1.5 Élite</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                              Équipe / Grille
                            </label>
                            <select
                              value={hostTeamId}
                              onChange={(e) => setHostTeamId(e.target.value as TeamId)}
                              className="w-full h-10 px-2.5 rounded-xl border border-slate-300 bg-white text-xs font-bold"
                            >
                              <option value="SOLO">Grille Solo</option>
                              <option value="ALPHA">Équipe Alpha</option>
                              <option value="BRAVO">Équipe Bravo</option>
                            </select>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={isConnectingP2P}
                    onClick={() =>
                      handleCreateCoachRoom(
                        hostPlaysToo ? hostAthleteName.trim() || 'Hôte' : undefined
                      )
                    }
                    className="w-full min-h-[52px] rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-display font-bold text-xl uppercase tracking-wide flex items-center justify-center gap-2 shadow-xs"
                  >
                    <Play className="w-5 h-5" />
                    Ouvrir le Salon & Obtenir le Code
                  </button>
                </div>

                {/* Join Room */}
                <form
                  onSubmit={handleJoinRoomAsAthlete}
                  className="p-5 rounded-2xl border border-slate-200 bg-white flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div className="w-10 h-10 rounded-xl bg-red-100 text-red-700 flex items-center justify-center">
                      <Smartphone className="w-5 h-5" />
                    </div>
                    <h3 className="font-display font-bold text-2xl uppercase text-slate-900">
                      2. Rejoindre un Salon (Client)
                    </h3>
                    <div>
                      <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                        Code du Salon (4 caractères)
                      </label>
                      <input
                        type="text"
                        maxLength={6}
                        value={joinCodeInput}
                        onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                        placeholder="Ex: K7X9"
                        className="w-full h-10 px-3 rounded-xl border border-slate-300 font-mono-tabular font-bold text-lg uppercase tracking-widest text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                        Votre Prénom
                      </label>
                      <input
                        type="text"
                        value={joinAthleteName}
                        onChange={(e) => setJoinAthleteName(e.target.value)}
                        placeholder="Ex: Maxime"
                        className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm text-slate-900"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                          Niveau Scaling
                        </label>
                        <select
                          value={joinScalingLevel}
                          onChange={(e) => setJoinScalingLevel(e.target.value as ScalingLevel)}
                          className="w-full h-10 px-2.5 rounded-xl border border-slate-300 bg-white text-xs font-bold"
                        >
                          <option value="SCALED">×0.5 Débutant</option>
                          <option value="RX">×1.0 RX</option>
                          <option value="ELITE">×1.5 Élite</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                          Équipe / Grille
                        </label>
                        <select
                          value={joinTeamId}
                          onChange={(e) => setJoinTeamId(e.target.value as TeamId)}
                          className="w-full h-10 px-2.5 rounded-xl border border-slate-300 bg-white text-xs font-bold"
                        >
                          <option value="SOLO">Grille Solo</option>
                          <option value="ALPHA">Équipe Alpha</option>
                          <option value="BRAVO">Équipe Bravo</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isConnectingP2P}
                    className="w-full min-h-[52px] rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white font-display font-bold text-xl uppercase tracking-wide flex items-center justify-center gap-2"
                  >
                    <ArrowRight className="w-5 h-5" />
                    Rejoindre la Partie
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* TAB: ARÈNE DE JEU */}
        {activeNav === 'ARENA' && (
          <>
            {!room ? (
              /* STREAMLINED SETUP VIEW */
              <div className="max-w-2xl mx-auto bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
                <div>
                  <h1 className="font-display font-extrabold text-4xl uppercase text-slate-900">
                    Nouvelle Séance D20
                  </h1>
                  <p className="text-sm text-slate-600 mt-1">
                    Choisissez comment vous souhaitez jouer aujourd’hui :
                  </p>
                </div>

                {/* Top Mode Selector: 3 Ultra-Clear Choices */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setWsError(null);
                      setSetupMode('PASS_AND_PLAY');
                    }}
                    className={`p-3.5 rounded-2xl border text-left transition-all ${
                      setupMode === 'PASS_AND_PLAY'
                        ? 'border-slate-900 bg-slate-900 text-white shadow-xs'
                        : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-900'
                    }`}
                  >
                    <div className="font-display font-bold text-lg uppercase flex items-center gap-1.5">
                      <Users className="w-4 h-4 shrink-0" />
                      <span>1 Seul Écran</span>
                    </div>
                    <div className="text-xs opacity-80 mt-0.5">Pass & Play sur cet appareil</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setWsError(null);
                      setSetupMode('COACH_TV');
                    }}
                    className={`p-3.5 rounded-2xl border text-left transition-all ${
                      setupMode === 'COACH_TV'
                        ? 'border-red-600 bg-red-600 text-white shadow-xs'
                        : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-900'
                    }`}
                  >
                    <div className="font-display font-bold text-lg uppercase flex items-center gap-1.5">
                      <Tv className="w-4 h-4 shrink-0" />
                      <span>Héberger un Salon</span>
                    </div>
                    <div className="text-xs opacity-80 mt-0.5">Inviter plusieurs téléphones</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setWsError(null);
                      setSetupMode('JOIN_ATHLETE');
                    }}
                    className={`p-3.5 rounded-2xl border text-left transition-all ${
                      setupMode === 'JOIN_ATHLETE'
                        ? 'border-slate-900 bg-slate-900 text-white shadow-xs'
                        : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-900'
                    }`}
                  >
                    <div className="font-display font-bold text-lg uppercase flex items-center gap-1.5">
                      <Smartphone className="w-4 h-4 shrink-0" />
                      <span>Rejoindre Salon</span>
                    </div>
                    <div className="text-xs opacity-80 mt-0.5">J’ai un code à 4 lettres</div>
                  </button>
                </div>

                {wsError && (
                  <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-800">
                    {wsError}
                  </div>
                )}

                {isConnectingP2P && (
                  <div className="p-3.5 rounded-xl bg-sky-50 border border-sky-200 text-xs font-semibold text-sky-900">
                    Connexion en direct au salon en cours...
                  </div>
                )}

                {setupMode === 'JOIN_ATHLETE' ? (
                  /* DIRECT CLIENT JOIN VIEW */
                  <form
                    onSubmit={handleJoinRoomAsAthlete}
                    className="p-5 rounded-2xl border-2 border-slate-900 bg-slate-50 space-y-4"
                  >
                    <div>
                      <h2 className="font-display font-extrabold text-2xl uppercase text-slate-900">
                        Rejoindre le Salon du Coach
                      </h2>
                      <p className="text-xs text-slate-600">
                        Entrez le code à 4 lettres affiché sur l’écran de l’hôte et votre prénom.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                          Code du Salon (4 caractères)
                        </label>
                        <input
                          type="text"
                          maxLength={6}
                          value={joinCodeInput}
                          onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                          placeholder="Ex: K7X9"
                          className="w-full h-11 px-3 rounded-xl border border-slate-300 bg-white font-mono-tabular font-extrabold text-xl uppercase tracking-widest text-slate-900"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                          Votre Prénom
                        </label>
                        <input
                          type="text"
                          value={joinAthleteName}
                          onChange={(e) => setJoinAthleteName(e.target.value)}
                          placeholder="Ex: Maxime"
                          className="w-full h-11 px-3 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-900"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                          Votre Niveau (Scaling)
                        </label>
                        <select
                          value={joinScalingLevel}
                          onChange={(e) => setJoinScalingLevel(e.target.value as ScalingLevel)}
                          className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-xs font-bold"
                        >
                          <option value="SCALED">×0.5 Débutant</option>
                          <option value="RX">×1.0 Standard (RX)</option>
                          <option value="ELITE">×1.5 Élite</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                          Équipe
                        </label>
                        <select
                          value={joinTeamId}
                          onChange={(e) => setJoinTeamId(e.target.value as TeamId)}
                          className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-xs font-bold"
                        >
                          <option value="SOLO">Individuel (Solo)</option>
                          <option value="ALPHA">Équipe Alpha</option>
                          <option value="BRAVO">Équipe Bravo</option>
                        </select>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isConnectingP2P}
                      className="w-full min-h-[58px] rounded-2xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-display font-extrabold text-2xl uppercase tracking-wide flex items-center justify-center gap-2 shadow-sm transition-colors"
                    >
                      <ArrowRight className="w-6 h-6" />
                      Rejoindre la Partie Maintenant
                    </button>
                  </form>
                ) : (
                  <>
                    {/* 1. Quick Preset Selection */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-bold uppercase text-slate-700">
                          1. Programme d’Exercices
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowCustomExercises((v) => !v)}
                          className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1"
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5" />
                          <span>{showCustomExercises ? 'Masquer options' : 'Personnaliser'}</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        {WORKOUT_PRESETS.map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() =>
                              setWorkoutConfig({
                                ...preset.config,
                                teamMode: workoutConfig.teamMode,
                              })
                            }
                            className={`p-3.5 rounded-2xl border text-left transition-all ${
                              workoutConfig.greenExercise === preset.config.greenExercise &&
                              workoutConfig.yellowExercise === preset.config.yellowExercise
                                ? 'border-slate-900 bg-slate-900 text-white'
                                : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-900'
                            }`}
                          >
                            <div className="font-display font-bold text-lg uppercase">
                              {preset.label}
                            </div>
                            <div className="text-xs opacity-80 truncate mt-0.5">
                              {preset.subtitle}
                            </div>
                          </button>
                        ))}
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                        <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
                          <div className="text-[11px] font-bold text-emerald-800">Cases 1–6</div>
                          <div className="font-display font-bold text-base uppercase text-slate-900 truncate">
                            {workoutConfig.greenExercise}
                          </div>
                        </div>
                        <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200">
                          <div className="text-[11px] font-bold text-amber-800">Cases 7–13</div>
                          <div className="font-display font-bold text-base uppercase text-slate-900 truncate">
                            {workoutConfig.yellowExercise}
                          </div>
                        </div>
                        <div className="p-2.5 rounded-xl bg-red-50 border border-red-200">
                          <div className="text-[11px] font-bold text-red-800">Cases 14–20</div>
                          <div className="font-display font-bold text-base uppercase text-slate-900 truncate">
                            {workoutConfig.redExercise}
                          </div>
                        </div>
                      </div>

                      {showCustomExercises && (
                        <div className="mt-4 p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs font-bold text-emerald-800 mb-1">
                                Vert (Cases 1 à 6)
                              </label>
                              <input
                                type="text"
                                value={workoutConfig.greenExercise}
                                onChange={(e) =>
                                  setWorkoutConfig({
                                    ...workoutConfig,
                                    greenExercise: e.target.value,
                                  })
                                }
                                className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm font-semibold"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-amber-800 mb-1">
                                Jaune (Cases 7 à 13)
                              </label>
                              <input
                                type="text"
                                value={workoutConfig.yellowExercise}
                                onChange={(e) =>
                                  setWorkoutConfig({
                                    ...workoutConfig,
                                    yellowExercise: e.target.value,
                                  })
                                }
                                className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm font-semibold"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-red-800 mb-1">
                                Rouge (Cases 14 à 20)
                              </label>
                              <input
                                type="text"
                                value={workoutConfig.redExercise}
                                onChange={(e) =>
                                  setWorkoutConfig({
                                    ...workoutConfig,
                                    redExercise: e.target.value,
                                  })
                                }
                                className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm font-semibold"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 2. Format de Grille : Solo vs Relais Coop vs Duel d'Équipes */}
                    <div className="space-y-2.5 pt-2 border-t border-slate-200">
                      <label className="block text-xs font-bold uppercase text-slate-700">
                        2. Format de Grille (Solo ou Équipes)
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => handleTeamModeChange('INDIVIDUAL')}
                          className={`p-3 rounded-xl border text-left transition-all ${
                            workoutConfig.teamMode === 'INDIVIDUAL'
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100'
                          }`}
                        >
                          <div className="font-display font-bold text-base uppercase">
                            Chacun sa Grille
                          </div>
                          <div className="text-[11px] opacity-80">Compétition individuelle</div>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleTeamModeChange('COOP_RELAY')}
                          className={`p-3 rounded-xl border text-left transition-all ${
                            workoutConfig.teamMode === 'COOP_RELAY'
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100'
                          }`}
                        >
                          <div className="font-display font-bold text-base uppercase">
                            Relais Coopératif
                          </div>
                          <div className="text-[11px] opacity-80">1 grille de 20 cases partagée</div>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleTeamModeChange('TEAMS_VERSUS')}
                          className={`p-3 rounded-xl border text-left transition-all ${
                            workoutConfig.teamMode === 'TEAMS_VERSUS'
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100'
                          }`}
                        >
                          <div className="font-display font-bold text-base uppercase">
                            Duel d’Équipes (2v2)
                          </div>
                          <div className="text-[11px] opacity-80">Équipe Alpha vs Équipe Bravo</div>
                        </button>
                      </div>
                    </div>

                    {/* 3. Participants / Lancement selon le mode choisi */}
                    <div className="space-y-4 pt-2 border-t border-slate-200">
                      {setupMode === 'PASS_AND_PLAY' ? (
                        <div className="space-y-3">
                          <label className="block text-xs font-bold uppercase text-slate-700">
                            3. Participants sur cet appareil & Niveau (Scaling)
                          </label>
                          <div className="space-y-2">
                            {setupPlayers.map((draft, idx) => (
                              <div
                                key={idx}
                                className="p-2.5 rounded-2xl border border-slate-200 bg-slate-50/70 flex flex-wrap sm:flex-nowrap items-center gap-2"
                              >
                                <span className="w-8 h-9 rounded-xl bg-slate-200 font-mono-tabular font-bold text-xs text-slate-800 flex items-center justify-center shrink-0">
                                  J{idx + 1}
                                </span>
                                <input
                                  type="text"
                                  value={draft.name}
                                  onChange={(e) => {
                                    const copy = [...setupPlayers];
                                    copy[idx] = { ...copy[idx], name: e.target.value };
                                    setSetupPlayers(copy);
                                  }}
                                  className="flex-1 min-w-[120px] h-9 px-3 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-900"
                                />

                                <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shrink-0">
                                  {(['SCALED', 'RX', 'ELITE'] as ScalingLevel[]).map((lvl) => (
                                    <button
                                      key={lvl}
                                      type="button"
                                      onClick={() => {
                                        const copy = [...setupPlayers];
                                        copy[idx] = { ...copy[idx], scalingLevel: lvl };
                                        setSetupPlayers(copy);
                                      }}
                                      className={`px-2 py-1 rounded-lg text-[11px] font-mono-tabular font-bold transition-colors ${
                                        draft.scalingLevel === lvl
                                          ? 'bg-slate-900 text-white'
                                          : 'text-slate-600 hover:text-slate-900'
                                      }`}
                                    >
                                      {lvl === 'SCALED' ? '×0.5' : lvl === 'RX' ? 'RX' : '×1.5'}
                                    </button>
                                  ))}
                                </div>

                                {workoutConfig.teamMode === 'TEAMS_VERSUS' && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const copy = [...setupPlayers];
                                      copy[idx] = {
                                        ...copy[idx],
                                        teamId: copy[idx].teamId === 'ALPHA' ? 'BRAVO' : 'ALPHA',
                                      };
                                      setSetupPlayers(copy);
                                    }}
                                    className={`px-2.5 py-1.5 rounded-xl text-xs font-bold shrink-0 ${
                                      draft.teamId === 'ALPHA'
                                        ? 'bg-red-600 text-white'
                                        : 'bg-blue-600 text-white'
                                    }`}
                                  >
                                    {draft.teamId === 'ALPHA' ? 'Éq. Alpha' : 'Éq. Bravo'}
                                  </button>
                                )}

                                {setupPlayers.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSetupPlayers(setupPlayers.filter((_, i) => i !== idx))
                                    }
                                    className="p-1.5 text-slate-400 hover:text-red-600"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>

                          {setupPlayers.length < 4 && (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={newPlayerInput}
                                onChange={(e) => setNewPlayerInput(e.target.value)}
                                placeholder="Ajouter un joueur (ex: Thomas)..."
                                className="flex-1 h-10 px-3 rounded-xl border border-slate-300 text-sm text-slate-900"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const nextName =
                                    newPlayerInput.trim() || `Athlète ${setupPlayers.length + 1}`;
                                  const nextTeam: TeamId =
                                    workoutConfig.teamMode === 'INDIVIDUAL'
                                      ? 'SOLO'
                                      : workoutConfig.teamMode === 'COOP_RELAY'
                                      ? 'ALPHA'
                                      : setupPlayers.length % 2 === 0
                                      ? 'ALPHA'
                                      : 'BRAVO';
                                  setSetupPlayers([
                                    ...setupPlayers,
                                    { name: nextName, scalingLevel: 'RX', teamId: nextTeam },
                                  ]);
                                  setNewPlayerInput('');
                                }}
                                className="h-10 px-3.5 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-800 flex items-center gap-1"
                              >
                                <Plus className="w-4 h-4" />
                                Ajouter
                              </button>
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={handleStartPassAndPlay}
                            className="mt-2 w-full min-h-[60px] rounded-2xl bg-red-600 hover:bg-red-700 text-white font-display font-extrabold text-2xl uppercase tracking-wide shadow-sm flex items-center justify-center gap-2 transition-colors"
                          >
                            <Play className="w-6 h-6" />
                            Démarrer la Séance
                          </button>
                        </div>
                      ) : (
                        /* SIMPLIFIED HOST LAUNCH CARD */
                        <div className="p-5 rounded-2xl border-2 border-red-200 bg-red-50/40 space-y-4">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                              <h3 className="font-display font-extrabold text-2xl uppercase text-slate-900">
                                3. Ouvrir le Salon en tant qu’Hôte
                              </h3>
                              <p className="text-xs text-slate-600">
                                Un code à 4 lettres et un lien d’invitation seront générés immédiatement.
                              </p>
                            </div>
                          </div>

                          <label className="flex items-center gap-2.5 p-3 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-800 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={hostPlaysToo}
                              onChange={(e) => setHostPlaysToo(e.target.checked)}
                              className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-600"
                            />
                            <span>Je joue aussi avec ma propre grille sur cet appareil</span>
                          </label>

                          {hostPlaysToo && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                                  Votre Prénom
                                </label>
                                <input
                                  type="text"
                                  value={hostAthleteName}
                                  onChange={(e) => setHostAthleteName(e.target.value)}
                                  placeholder="Ex: Lucas"
                                  className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-900"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                                  Votre Niveau (Scaling)
                                </label>
                                <select
                                  value={hostScalingLevel}
                                  onChange={(e) =>
                                    setHostScalingLevel(e.target.value as ScalingLevel)
                                  }
                                  className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-xs font-bold"
                                >
                                  <option value="SCALED">×0.5 Débutant</option>
                                  <option value="RX">×1.0 Standard (RX)</option>
                                  <option value="ELITE">×1.5 Élite</option>
                                </select>
                              </div>
                            </div>
                          )}

                          <button
                            type="button"
                            disabled={isConnectingP2P}
                            onClick={() =>
                              handleCreateCoachRoom(
                                hostPlaysToo ? hostAthleteName.trim() || 'Hôte' : undefined
                              )
                            }
                            className="w-full min-h-[60px] rounded-2xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-display font-extrabold text-2xl uppercase tracking-wide shadow-sm flex items-center justify-center gap-2 transition-colors"
                          >
                            <Play className="w-6 h-6" />
                            Ouvrir le Salon & Inviter mes Clients
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : room.status === 'GAME_OVER' ? (
              /* VICTORY & SUMMARY VIEW */
              <VictoryScreen
                players={room.players}
                winnerId={room.winnerId}
                config={room.config}
                onPlayAgainSamePlayers={handlePlayAgainSamePlayers}
                onNewSessionSetup={handleResetToSetup}
              />
            ) : room.mode === 'MULTI_SCREEN' && multiScreenRole === 'COACH' ? (
              /* COACH TV REAL-TIME DASHBOARD */
              <CoachScreenView
                room={room}
                onStartRoomGame={() => {
                  const updatedRoom: RoomState = { ...room, status: 'PLAYING' };
                  getP2PManager().syncFullRoomState(updatedRoom);
                }}
                onAddQuickAthlete={(name) => {
                  const defaultTeam: TeamId =
                    room.config.teamMode === 'COOP_RELAY'
                      ? 'ALPHA'
                      : room.config.teamMode === 'TEAMS_VERSUS'
                      ? room.players.length % 2 === 0
                        ? 'ALPHA'
                        : 'BRAVO'
                      : 'SOLO';
                  const newP = createPlayer(
                    name,
                    room.players.length,
                    room.config.startingCardsCount,
                    'RX',
                    defaultTeam
                  );
                  const updatedRoom: RoomState = {
                    ...room,
                    players: [...room.players, newP],
                  };
                  getP2PManager().syncFullRoomState(updatedRoom);
                }}
                onSwitchToAthleteView={(playerId) => {
                  setMyAthleteId(playerId);
                  setMultiScreenRole('ATHLETE');
                }}
              />
            ) : (
              /* ULTRA-FOCUSED ACTIVE WORKOUT VIEW (1 Step at a Time) */
              currentActivePlayer && (
                <div className="max-w-xl mx-auto space-y-4">
                  {/* MULTI-PHONE INVITE & ROOM BAR (Always visible in Multi-Screen so Host can invite easily) */}
                  {room.mode === 'MULTI_SCREEN' && (
                    <div className="bg-slate-900 text-white rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
                      <div className="flex items-center gap-3">
                        <div className="px-3 py-1.5 rounded-xl bg-white/15 font-mono-tabular font-extrabold text-lg tracking-widest">
                          CODE : {room.roomCode}
                        </div>
                        <div className="text-xs">
                          <div className="font-bold text-white">
                            {room.players.length} joueur{room.players.length > 1 ? 's' : ''} connecté
                            {room.players.length > 1 ? 's' : ''}
                          </div>
                          <div className="text-slate-300 truncate max-w-[180px] sm:max-w-[240px]">
                            {room.players.map((p) => p.name).join(', ')}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleShareInviteNative(room.roomCode)}
                          className="px-3 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          <span>Inviter</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopyInviteLink(room.roomCode)}
                          className="px-2.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1 transition-colors"
                        >
                          {copiedInviteLink ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Copié !</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Lien</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setMultiScreenRole('COACH')}
                          className="px-2.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1 transition-colors"
                          title="Voir toutes les grilles du salon (Écran Coach)"
                        >
                          <Tv className="w-3.5 h-3.5" />
                          <span>TV</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 1. Compact Player Header + Scaling Badge + Voice Coach Toggle */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-2.5 shadow-2xs">
                    {room.mode === 'PASS_AND_PLAY' ? (
                      <div className="flex items-center gap-1.5 overflow-x-auto">
                        {room.players.map((p, idx) => {
                          const isActive = idx === room.activePlayerIndex;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => setRoom({ ...room, activePlayerIndex: idx })}
                              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                                isActive
                                  ? 'bg-slate-900 text-white shadow-2xs'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                            >
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: p.color }}
                              />
                              <span>{p.name}</span>
                              {p.teamId !== 'SOLO' && (
                                <span className="opacity-75 text-[10px]">
                                  ({p.teamId === 'ALPHA' ? 'Alpha' : 'Bravo'})
                                </span>
                              )}
                              <span className="font-mono-tabular opacity-85">
                                {p.completedCells.length}/20
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <span className="font-display font-bold text-xl uppercase text-slate-900 truncate">
                          {currentActivePlayer.name} ({currentActivePlayer.completedCells.length}/20)
                        </span>
                        {currentActivePlayer.teamId !== 'SOLO' && (
                          <span className="text-xs font-bold text-red-600">
                            · {getTeamDisplayName(currentActivePlayer.teamId)}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Right Utility Controls: Scaling Button + Voice Coach + Sound */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={handleCyclePlayerScaling}
                        title="Changer votre multiplicateur de répétitions (Débutant ×0.5 / RX ×1.0 / Élite ×1.5)"
                        className="px-2.5 py-1.5 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 font-mono-tabular font-bold text-xs text-slate-900"
                      >
                        {SCALING_DEFINITIONS[currentActivePlayer.scalingLevel || 'RX'].shortBadge}
                      </button>

                      <button
                        type="button"
                        onClick={toggleVoiceCoach}
                        title={
                          voiceCoachEnabled
                            ? 'Coach Vocal actif (Cliquer pour couper)'
                            : 'Activer le Coach Vocal'
                        }
                        className={`p-2 rounded-xl border transition-colors ${
                          voiceCoachEnabled
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                            : 'border-slate-200 bg-slate-50 text-slate-400'
                        }`}
                      >
                        {voiceCoachEnabled ? (
                          <Mic className="w-4 h-4" />
                        ) : (
                          <MicOff className="w-4 h-4" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={toggleMute}
                        aria-label="Activer ou couper les effets sonores"
                        className="p-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700"
                      >
                        {soundMuted ? (
                          <VolumeX className="w-4 h-4 text-slate-400" />
                        ) : (
                          <Volume2 className="w-4 h-4 text-slate-800" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Live Multi-Phone Rivals Score Bar when connected on multiple phones */}
                  {room.mode === 'MULTI_SCREEN' && room.players.length > 1 && (
                    <div className="bg-white border border-slate-200 rounded-xl px-3.5 py-2 flex items-center gap-3 overflow-x-auto text-xs">
                      <span className="font-bold text-slate-500 uppercase shrink-0">En direct :</span>
                      {room.players.map((p) => (
                        <span
                          key={p.id}
                          className={`font-mono-tabular whitespace-nowrap ${
                            p.id === currentActivePlayer.id
                              ? 'font-extrabold text-slate-900'
                              : 'text-slate-600'
                          }`}
                        >
                          {p.name} ({p.completedCells.length}/20)
                        </span>
                      ))}
                    </div>
                  )}

                  {/* 2. FOCUSED SINGLE-STEP ACTION CARD */}
                  {currentActivePlayer.turn.phase === 'IDLE' ? (
                    <D20Roller
                      diceRoll={currentActivePlayer.turn.diceRoll}
                      secondaryDiceRoll={currentActivePlayer.turn.secondaryDiceRoll}
                      doubleDiceActive={currentActivePlayer.turn.doubleDiceActive}
                      canRoll={true}
                      onRollVirtual={handleRollVirtual}
                      onSelectManualRoll={handleSelectManualRoll}
                      canActivateDoubleDe={currentActivePlayer.hand.some(
                        (c) => c.cardId === 'DOUBLE_DE'
                      )}
                      onActivateDoubleDe={() => {
                        const inst = currentActivePlayer.hand.find(
                          (c) => c.cardId === 'DOUBLE_DE'
                        );
                        if (inst) handlePlayTacticalCard(inst.instanceId, 'DOUBLE_DE');
                      }}
                    />
                  ) : currentActivePlayer.turn.phase === 'EXECUTING_PENALTY' ? (
                    <div className="bg-white border-2 border-amber-500 rounded-3xl p-6 sm:p-8 text-center shadow-sm space-y-6">
                      <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-amber-100 text-amber-900 text-xs font-bold uppercase">
                        <Flame className="w-4 h-4" />
                        <span>Pénalité Active · Nouvelle Carte</span>
                      </div>

                      <div>
                        <div className="font-mono-tabular font-extrabold text-7xl text-slate-900 leading-none">
                          {room.config.penaltyValue}
                        </div>
                        <div className="font-display font-extrabold text-3xl uppercase text-amber-800 mt-2">
                          {room.config.penaltyExercise}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleCompleteDuplicatePenalty}
                        className="w-full min-h-[64px] rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-display font-extrabold text-2xl uppercase tracking-wide flex items-center justify-center gap-2.5 shadow-sm"
                      >
                        <CheckCircle2 className="w-7 h-7" />
                        Pénalité Terminée · Piocher ma Carte
                      </button>
                    </div>
                  ) : currentActivePlayer.turn.isDuplicate ? (
                    <div className="bg-white border-2 border-amber-400 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
                      <div className="text-center">
                        <div className="inline-flex items-center gap-1.5 text-amber-700 font-bold text-xs uppercase tracking-wider mb-1">
                          <AlertTriangle className="w-4 h-4" />
                          <span>Dé verrouillé sur {currentActivePlayer.turn.diceRoll}</span>
                        </div>
                        <h2 className="font-display font-extrabold text-4xl uppercase text-slate-900">
                          Case {currentActivePlayer.turn.diceRoll} déjà cochée !
                        </h2>
                        <p className="text-sm text-slate-600 mt-1">
                          Choisissez l’une des 2 actions ci-dessous :
                        </p>
                      </div>

                      {currentActivePlayer.turn.secondaryDiceRoll !== null && (
                        <div className="p-3 rounded-2xl bg-slate-100 flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-700">
                            Double Dé disponible :
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleChooseDoubleDieResult(
                                currentActivePlayer.turn.secondaryDiceRoll!
                              )
                            }
                            className="px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold"
                          >
                            Prendre le 2e dé ({currentActivePlayer.turn.secondaryDiceRoll})
                          </button>
                        </div>
                      )}

                      <div className="space-y-2.5">
                        {currentActivePlayer.turn.reboundOptions.map((rebCell) => {
                          const exName = getExerciseForCell(rebCell, room.config);
                          const scaledReps = computeScaledReps(
                            rebCell,
                            currentActivePlayer.scalingLevel
                          );
                          return (
                            <button
                              key={rebCell}
                              type="button"
                              onClick={() => handleSelectReboundCell(rebCell)}
                              className="w-full min-h-[68px] p-4 rounded-2xl border-2 border-sky-600 bg-sky-50 hover:bg-sky-100 active:scale-[0.99] text-sky-950 flex items-center justify-between gap-4 transition-all"
                            >
                              <div className="flex items-center gap-3 text-left">
                                <div className="w-12 h-12 rounded-xl bg-sky-600 text-white font-mono-tabular font-extrabold text-xl flex items-center justify-center shrink-0">
                                  {rebCell}
                                </div>
                                <div>
                                  <div className="font-display font-extrabold text-2xl uppercase leading-none flex items-center gap-1.5">
                                    <CornerDownRight className="w-5 h-5 text-sky-700" />
                                    <span>Rebond Case {rebCell}</span>
                                  </div>
                                  <div className="text-xs font-semibold text-sky-800 mt-1">
                                    Faire {scaledReps} {exName}
                                  </div>
                                </div>
                              </div>
                              <span className="px-3.5 py-2 rounded-xl bg-sky-600 text-white font-display font-bold text-base uppercase shrink-0">
                                Choisir
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      <div className="text-center text-xs font-bold uppercase text-slate-400">
                        — OU —
                      </div>

                      <button
                        type="button"
                        onClick={handleStartDuplicatePenalty}
                        className="w-full min-h-[64px] p-4 rounded-2xl border-2 border-amber-500 bg-amber-50 hover:bg-amber-100 active:scale-[0.99] text-amber-950 flex items-center justify-between gap-4 transition-all"
                      >
                        <div className="flex items-center gap-3 text-left">
                          <div className="w-12 h-12 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0">
                            <Sparkles className="w-6 h-6" />
                          </div>
                          <div>
                            <div className="font-display font-extrabold text-2xl uppercase leading-none">
                              Pénalité Active (+1 Carte)
                            </div>
                            <div className="text-xs font-semibold text-amber-800 mt-1">
                              {room.config.penaltyType === 'TIMER'
                                ? `${room.config.penaltyValue}s ${room.config.penaltyExercise}`
                                : `${room.config.penaltyValue} ${room.config.penaltyExercise}`}
                            </div>
                          </div>
                        </div>
                        <span className="px-3.5 py-2 rounded-xl bg-amber-600 text-white font-display font-bold text-base uppercase shrink-0">
                          Piocher
                        </span>
                      </button>
                    </div>
                  ) : (
                    /* STEP 3: FOCUSED EXERCISE EXECUTION CARD */
                    (() => {
                      const primaryCell =
                        currentActivePlayer.turn.selectedTargetCells[0] ||
                        currentActivePlayer.turn.diceRoll ||
                        1;
                      const visuals = getTargetTierVisuals(primaryCell);
                      const exerciseName = getExerciseForCell(primaryCell, room.config);

                      return (
                        <div
                          className={`bg-white border-2 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6 text-center ${visuals.bg}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`px-3 py-1 rounded-xl font-mono-tabular font-bold text-xs uppercase ${visuals.badgeBg}`}
                            >
                              {currentActivePlayer.turn.selectedTargetCells.length > 1
                                ? `Cases ${currentActivePlayer.turn.selectedTargetCells.join(' + ')}`
                                : `Case #${primaryCell}`}
                            </span>
                            <span className="text-xs font-semibold text-slate-600">
                              Dé verrouillé jusqu’à la fin de la série
                            </span>
                          </div>

                          {currentActivePlayer.turn.secondaryDiceRoll !== null && (
                            <div className="p-2.5 rounded-2xl bg-white/90 border border-slate-200 flex items-center justify-between gap-2">
                              <span className="text-xs font-bold text-slate-700 pl-2">
                                Double Dé :
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleChooseDoubleDieResult(currentActivePlayer.turn.diceRoll!)
                                  }
                                  className="px-3 py-1.5 rounded-lg bg-slate-900 text-white font-mono-tabular font-bold text-xs"
                                >
                                  Dé {currentActivePlayer.turn.diceRoll} (Actif)
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleChooseDoubleDieResult(
                                      currentActivePlayer.turn.secondaryDiceRoll!
                                    )
                                  }
                                  className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 font-mono-tabular font-bold text-xs"
                                >
                                  Basculer sur Dé {currentActivePlayer.turn.secondaryDiceRoll}
                                </button>
                              </div>
                            </div>
                          )}

                          <div className="py-3">
                            <div className="font-mono-tabular font-extrabold text-8xl tracking-tight text-slate-900 leading-none">
                              {currentActivePlayer.turn.finalReps}
                            </div>
                            <div
                              className={`font-display font-extrabold text-4xl sm:text-5xl uppercase tracking-tight mt-2 ${visuals.accentText}`}
                            >
                              {exerciseName}
                            </div>
                          </div>

                          {currentActivePlayer.turn.notes.length > 0 && (
                            <div className="p-3 rounded-2xl bg-white/80 border border-slate-200/80 text-xs font-semibold text-slate-700 space-y-1">
                              {currentActivePlayer.turn.notes.map((n, i) => (
                                <div key={i}>{n}</div>
                              ))}
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={handleValidateSetAndCheckCells}
                            className="w-full min-h-[68px] py-4 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-display font-extrabold text-2xl sm:text-3xl uppercase tracking-wide flex items-center justify-center gap-3 shadow-md transition-all"
                          >
                            <CheckCircle2 className="w-8 h-8 shrink-0" />
                            <span>Série Terminée — Valider</span>
                          </button>
                        </div>
                      );
                    })()
                  )}

                  {/* 3. TACTICAL DECK (3 CARDS) & COMPACT 1-20 STRIP */}
                  <div className="space-y-3">
                    {showCardsDrawer && (
                      <TacticalCardHand
                        player={currentActivePlayer}
                        allPlayers={room.players}
                        onPlayCard={handlePlayTacticalCard}
                        onDiscardCard={handleDiscardCard}
                      />
                    )}

                    <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-2xs">
                      <div className="grid grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          onClick={() => setShowCardsDrawer((v) => !v)}
                          className={`min-h-[44px] px-4 py-2 rounded-xl border font-display font-bold text-base uppercase flex items-center justify-center gap-2 transition-colors ${
                            showCardsDrawer
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-900'
                          }`}
                        >
                          <Sparkles className="w-4 h-4 text-amber-500" />
                          <span>
                            {showCardsDrawer ? 'Masquer Cartes' : 'Afficher Cartes'} (
                            {currentActivePlayer.hand.length}/3)
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setShowFullGridModal(true)}
                          className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-900 font-display font-bold text-base uppercase flex items-center justify-center gap-2 transition-colors"
                        >
                          <Grid className="w-4 h-4 text-slate-700" />
                          <span>Grille ({currentActivePlayer.completedCells.length}/20)</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-10 gap-1">
                        {Array.from({ length: 20 }, (_, i) => i + 1).map((cell) => {
                          const done = currentActivePlayer.completedCells.includes(cell);
                          const isTarget =
                            currentActivePlayer.turn.selectedTargetCells.includes(cell);
                          const tier = getCellTier(cell);

                          let style = 'bg-slate-100 text-slate-400 border-slate-200';
                          if (done) {
                            style =
                              tier === 'GREEN'
                                ? 'bg-emerald-600 text-white border-emerald-700'
                                : tier === 'YELLOW'
                                ? 'bg-amber-500 text-slate-950 border-amber-600'
                                : 'bg-red-600 text-white border-red-700';
                          } else if (isTarget) {
                            style = 'bg-slate-900 text-white border-slate-900 ring-2 ring-red-400';
                          }

                          return (
                            <div
                              key={cell}
                              className={`h-7 rounded-md border font-mono-tabular font-bold text-xs flex items-center justify-center ${style}`}
                            >
                              {cell}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )
            )}
          </>
        )}
      </main>

      {/* Full Athlete Grid Modal */}
      {showFullGridModal && currentActivePlayer && room && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-3xl bg-slate-50 border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-xl my-auto max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="font-display font-extrabold text-2xl uppercase text-slate-900">
                  Grille de {currentActivePlayer.name} ({currentActivePlayer.completedCells.length}/20)
                </h3>
                <p className="text-xs text-slate-500">
                  Vert : {room.config.greenExercise} · Jaune : {room.config.yellowExercise} · Rouge :{' '}
                  {room.config.redExercise}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowFullGridModal(false)}
                className="px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <X className="w-4 h-4" />
                Fermer
              </button>
            </div>

            <AthleteGrid
              completedCells={currentActivePlayer.completedCells}
              config={room.config}
              selectedTargetCells={currentActivePlayer.turn.selectedTargetCells}
              reboundOptions={
                currentActivePlayer.turn.isDuplicate
                  ? currentActivePlayer.turn.reboundOptions
                  : []
              }
              rolledDuplicateCell={
                currentActivePlayer.turn.isDuplicate ? currentActivePlayer.turn.diceRoll : null
              }
              interactiveMode={
                currentActivePlayer.turn.isDuplicate ? 'REBOUND_CHOICE' : 'NONE'
              }
              onSelectCell={(cellNum) => {
                if (currentActivePlayer.turn.isDuplicate) {
                  handleSelectReboundCell(cellNum);
                  setShowFullGridModal(false);
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Priority Timer Overlay for 45s Freeze (Gel) or Timed Active Penalty (30s Gainage) */}
      {activeTimerOverlay && (
        <TimerOverlay
          mode={activeTimerOverlay.mode}
          durationSeconds={activeTimerOverlay.durationSeconds}
          title={activeTimerOverlay.title}
          subtitle={activeTimerOverlay.subtitle}
          attackerName={activeTimerOverlay.attackerName}
          onComplete={() => {
            const mode = activeTimerOverlay.mode;
            const targetPlayerId = activeTimerOverlay.playerId;
            setActiveTimerOverlay(null);

            if (mode === 'PENALTY_TIMER') {
              handleCompleteDuplicatePenalty();
            } else if (mode === 'FREEZE_45S' && room) {
              const target = room.players.find((p) => p.id === targetPlayerId);
              if (target) {
                const cleared: PlayerState = {
                  ...target,
                  freezeUntilTimestamp: null,
                  frozenByPlayerName: null,
                  stats: {
                    ...target.stats,
                    penaltySeconds: target.stats.penaltySeconds + 45,
                  },
                };
                commitPlayerUpdate(cleared);
              }
            }
          }}
        />
      )}

      {/* Mobile Bottom Navigation Bar */}
      <div className="md:hidden sticky bottom-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-4 items-center h-14 px-2">
        <button
          type="button"
          onClick={() => setActiveNav('ARENA')}
          className={`flex flex-col items-center justify-center py-1 text-[11px] font-semibold ${
            activeNav === 'ARENA' ? 'text-red-600' : 'text-slate-600'
          }`}
        >
          <Dices className="w-4 h-4" />
          <span>Arène</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveNav('MULTI_ROOM')}
          className={`flex flex-col items-center justify-center py-1 text-[11px] font-semibold ${
            activeNav === 'MULTI_ROOM' ? 'text-red-600' : 'text-slate-600'
          }`}
        >
          <Tv className="w-4 h-4" />
          <span>Salle TV</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveNav('CARDS_CATALOG')}
          className={`flex flex-col items-center justify-center py-1 text-[11px] font-semibold ${
            activeNav === 'CARDS_CATALOG' ? 'text-red-600' : 'text-slate-600'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>10 Cartes</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveNav('RULES')}
          className={`flex flex-col items-center justify-center py-1 text-[11px] font-semibold ${
            activeNav === 'RULES' ? 'text-red-600' : 'text-slate-600'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Règles</span>
        </button>
      </div>
    </div>
  );
}
