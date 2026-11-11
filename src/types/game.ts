export type ExerciseTier = 'GREEN' | 'YELLOW' | 'RED';

export type ScalingLevel = 'SCALED' | 'RX' | 'ELITE';

export type TeamMode = 'INDIVIDUAL' | 'COOP_RELAY' | 'TEAMS_VERSUS';

export type TeamId = 'SOLO' | 'ALPHA' | 'BRAVO';

export type TacticalCardId =
  | 'PASSE_DROIT'
  | 'DEMI_TARIF'
  | 'DOUBLE_DE'
  | 'GLISSADE'
  | 'GEL'
  | 'SCISSION'
  | 'DOUBLE_MISE'
  | 'LEST_TACTIQUE'
  | 'PARTAGE_CHARGE'
  | 'BALLE_DE_MATCH';

export interface TacticalCardDefinition {
  id: TacticalCardId;
  number: number;
  name: string;
  impactFormula: string;
  shortDesc: string;
  fullDesc: string;
  timing: 'BEFORE_ROLL' | 'AFTER_ROLL' | 'ATTACK_ANYTIME';
  requiresTargetPlayer?: boolean;
  category: 'BOOST' | 'TACTICAL' | 'OFFENSIVE';
}

export interface TacticalCardInstance {
  instanceId: string;
  cardId: TacticalCardId;
}

export interface WorkoutConfig {
  greenExercise: string;   // Cases 1 to 6
  yellowExercise: string;  // Cases 7 to 13
  redExercise: string;     // Cases 14 to 20
  penaltyType: 'TIMER' | 'REPS';
  penaltyExercise: string; // e.g., "Gainage Planche" or "Burpees Pénalité"
  penaltyValue: number;    // e.g., 30 (seconds) or 5 (reps)
  startingCardsCount: number; // Always 3
  teamMode: TeamMode;
}

export interface PlayerStats {
  totalRepsExecuted: number;
  greenReps: number;
  yellowReps: number;
  redReps: number;
  penaltyReps: number;
  penaltySeconds: number;
  cardsPlayed: number;
  duplicatesHit: number;
  rollsCount: number;
}

export interface ActiveTurnState {
  phase: 'IDLE' | 'ROLLED' | 'EXECUTING_REPS' | 'EXECUTING_PENALTY';
  diceRoll: number | null;
  secondaryDiceRoll: number | null;
  doubleDiceActive: boolean;
  isDuplicate: boolean;
  reboundOptions: number[];
  selectedTargetCells: number[];
  baseReps: number;
  finalReps: number;
  activeCardUsed: TacticalCardId | null;
  notes: string[];
}

export interface PlayerState {
  id: string;
  name: string;
  color: string;
  scalingLevel: ScalingLevel;
  teamId: TeamId;
  completedCells: number[]; // Numbers from 1 to 20
  hand: TacticalCardInstance[]; // Always 3 cards
  stats: PlayerStats;
  turn: ActiveTurnState;
  freezeUntilTimestamp: number | null;
  frozenByPlayerName: string | null;
  pendingExtraReps: number;
  pendingExtraRepsFrom: string[];
  finishedAtTimestamp: number | null;
}

export interface GameLogEntry {
  id: string;
  timestamp: number;
  playerName: string;
  message: string;
  type: 'ROLL' | 'VALIDATE' | 'CARD' | 'ATTACK' | 'PENALTY' | 'VICTORY';
}

export interface RoomState {
  roomCode: string;
  mode: 'PASS_AND_PLAY' | 'MULTI_SCREEN';
  status: 'LOBBY' | 'PLAYING' | 'GAME_OVER';
  config: WorkoutConfig;
  players: PlayerState[];
  activePlayerIndex: number;
  winnerId: string | null;
  logs: GameLogEntry[];
  createdAt: number;
}

export const SCALING_DEFINITIONS: Record<
  ScalingLevel,
  { label: string; shortBadge: string; multiplier: number; desc: string }
> = {
  SCALED: {
    label: 'Débutant (×0.5)',
    shortBadge: '×0.5 Débutant',
    multiplier: 0.5,
    desc: 'Répétitions divisées par 2 (minimum 1 rép.)',
  },
  RX: {
    label: 'RX Standard (×1)',
    shortBadge: '×1.0 RX',
    multiplier: 1.0,
    desc: 'Volume officiel D20 (1 case = son numéro en rép.)',
  },
  ELITE: {
    label: 'Élite (×1.5)',
    shortBadge: '×1.5 Élite',
    multiplier: 1.5,
    desc: 'Volume majoré de +50% pour athlètes confirmés',
  },
};

export function computeScaledReps(rawCellSum: number, scalingLevel: ScalingLevel = 'RX'): number {
  const mult = SCALING_DEFINITIONS[scalingLevel]?.multiplier ?? 1.0;
  return Math.max(1, Math.round(rawCellSum * mult));
}

export function getTeamDisplayName(teamId: TeamId): string {
  if (teamId === 'ALPHA') return 'Équipe Alpha';
  if (teamId === 'BRAVO') return 'Équipe Bravo';
  return 'Solo';
}

export const PLAYER_COLORS = [
  '#dc2626', // Rouge Athlétique
  '#2563eb', // Bleu Olympique
  '#16a34a', // Vert Émeraude
  '#d97706', // Ambre Dynamique
  '#7c3aed', // Violet Puissance
  '#0891b2', // Cyan Vitesse
  '#db2777', // Magenta Énergie
  '#4f46e5', // Indigo Tactique
];

export const MAX_HAND_SIZE = 3;

export const WORKOUT_PRESETS: { label: string; subtitle: string; config: WorkoutConfig }[] = [
  {
    label: 'Classique CrossFit',
    subtitle: 'Burpees · Pompes · Air Squats',
    config: {
      greenExercise: 'Burpees',
      yellowExercise: 'Pompes',
      redExercise: 'Air Squats',
      penaltyType: 'TIMER',
      penaltyExercise: 'Gainage Planche',
      penaltyValue: 30,
      startingCardsCount: 3,
      teamMode: 'INDIVIDUAL',
    },
  },
  {
    label: 'Cardio Haute Intensité',
    subtitle: 'Tuck Jumps · Mountain Climbers · Fentes Sautées',
    config: {
      greenExercise: 'Tuck Jumps',
      yellowExercise: 'Mountain Climbers (x2)',
      redExercise: 'Fentes Sautées',
      penaltyType: 'REPS',
      penaltyExercise: 'Burpees Explosifs',
      penaltyValue: 5,
      startingCardsCount: 3,
      teamMode: 'INDIVIDUAL',
    },
  },
  {
    label: 'Renfo & Core Athlétique',
    subtitle: 'Pompes Diamant · V-Ups Abdo · Squat Jumps',
    config: {
      greenExercise: 'Pompes Diamant',
      yellowExercise: 'V-Ups Abdominaux',
      redExercise: 'Squat Jumps',
      penaltyType: 'TIMER',
      penaltyExercise: 'Chaise Contre le Mur',
      penaltyValue: 30,
      startingCardsCount: 3,
      teamMode: 'INDIVIDUAL',
    },
  },
];

export const TACTICAL_CARDS: TacticalCardDefinition[] = [
  {
    id: 'PASSE_DROIT',
    number: 1,
    name: 'Passe-Droit',
    impactFormula: '0 RÉP. · VALIDATION AUTO',
    shortDesc: 'Coche la case sans faire les répétitions.',
    fullDesc: 'Valide instantanément la case du dé (ou la case libre de votre choix en cas de doublon) avec 0 répétition à effectuer.',
    timing: 'AFTER_ROLL',
    category: 'BOOST',
  },
  {
    id: 'DEMI_TARIF',
    number: 2,
    name: 'Demi-Tarif',
    impactFormula: '÷ 2 RÉPÉTITIONS',
    shortDesc: 'Divise par 2 votre série en cours.',
    fullDesc: 'Réduit de moitié la série à réaliser sur ce tour (arrondi à l’unité inférieure) tout en validant la case.',
    timing: 'AFTER_ROLL',
    category: 'BOOST',
  },
  {
    id: 'DOUBLE_DE',
    number: 3,
    name: 'Double Dé',
    impactFormula: '2 DÉS · GARDEZ LE MEILLEUR',
    shortDesc: 'Lance 2 D20 et choisit le résultat.',
    fullDesc: 'Permet de lancer simultanément 2 dés D20 et de sélectionner le résultat le plus avantageux pour votre grille.',
    timing: 'BEFORE_ROLL',
    category: 'TACTICAL',
  },
  {
    id: 'GLISSADE',
    number: 4,
    name: 'Glissade Libératrice',
    impactFormula: 'CIBLE LIBRE (CASE 1–20)',
    shortDesc: 'Choisissez n’importe quelle case libre.',
    fullDesc: 'Ignore la valeur tirée pour cibler n’importe quelle case libre de votre grille (1 à 20) et réaliser ses répétitions.',
    timing: 'AFTER_ROLL',
    category: 'TACTICAL',
  },
  {
    id: 'GEL',
    number: 5,
    name: 'Gel Cryo',
    impactFormula: 'RIVAL : 45s GAINAGE',
    shortDesc: 'Bloque un rival en planche 45s.',
    fullDesc: 'Déclenche immédiatement un compte à rebours prioritaire de 45 secondes de gainage statique chez l’adversaire choisi.',
    timing: 'ATTACK_ANYTIME',
    requiresTargetPlayer: true,
    category: 'OFFENSIVE',
  },
  {
    id: 'SCISSION',
    number: 6,
    name: 'Scission',
    impactFormula: '1 DÉ = 2 CASES COCHÉES',
    shortDesc: 'Divise le dé en 2 cases libres.',
    fullDesc: 'Coche 2 cases libres d’un coup (ex: Dé 15 → Cases 6 + 9) en réalisant le total de répétitions correspondant au dé.',
    timing: 'AFTER_ROLL',
    category: 'TACTICAL',
  },
  {
    id: 'DOUBLE_MISE',
    number: 7,
    name: 'Double Mise',
    impactFormula: 'COCHE CASE N + CASE N+1',
    shortDesc: 'Valide 2 cases consécutives d’un coup.',
    fullDesc: 'Permet de valider la case ciblée ainsi que la case libre supérieure suivante (+1) en additionnant leurs répétitions.',
    timing: 'AFTER_ROLL',
    category: 'BOOST',
  },
  {
    id: 'LEST_TACTIQUE',
    number: 8,
    name: 'Lest Tactique',
    impactFormula: 'RIVAL : +4 RÉPÉTITIONS',
    shortDesc: 'Ajoute +4 rép. sur la série d’un rival.',
    fullDesc: 'Alourdit immédiatement la série en cours ou le prochain tour d’un adversaire avec +4 répétitions supplémentaires.',
    timing: 'ATTACK_ANYTIME',
    requiresTargetPlayer: true,
    category: 'OFFENSIVE',
  },
  {
    id: 'PARTAGE_CHARGE',
    number: 9,
    name: 'Partage Charge',
    impactFormula: '50% VOUS / 50% RIVAL',
    shortDesc: 'Transfère la moitié des rép. à un rival.',
    fullDesc: 'Vous n’effectuez que la moitié de votre série actuelle et transférez l’autre moitié en dette immédiate à un adversaire.',
    timing: 'AFTER_ROLL',
    requiresTargetPlayer: true,
    category: 'OFFENSIVE',
  },
  {
    id: 'BALLE_DE_MATCH',
    number: 10,
    name: 'Balle de Match',
    impactFormula: '≤ 3 CASES : RELANCE / COPIE',
    shortDesc: 'Relance le dé ou cible une case finale.',
    fullDesc: 'Jouable uniquement lorsqu’il vous reste 3 cases libres ou moins : relancez le D20 ou validez une case déjà cochée par un adversaire.',
    timing: 'AFTER_ROLL',
    category: 'TACTICAL',
  },
];

export function getCardDefinition(cardId: TacticalCardId): TacticalCardDefinition {
  const found = TACTICAL_CARDS.find((c) => c.id === cardId);
  if (!found) {
    return TACTICAL_CARDS[0];
  }
  return found;
}

export function getCellTier(cellNumber: number): ExerciseTier {
  if (cellNumber <= 6) return 'GREEN';
  if (cellNumber <= 13) return 'YELLOW';
  return 'RED';
}

export function getExerciseForCell(cellNumber: number, config: WorkoutConfig): string {
  const tier = getCellTier(cellNumber);
  if (tier === 'GREEN') return config.greenExercise;
  if (tier === 'YELLOW') return config.yellowExercise;
  return config.redExercise;
}

export function getFreeCells(completedCells: number[]): number[] {
  const all = Array.from({ length: 20 }, (_, i) => i + 1);
  return all.filter((c) => !completedCells.includes(c));
}

export function computeReboundOptions(rolledValue: number, completedCells: number[]): number[] {
  const freeCells = getFreeCells(completedCells);
  if (freeCells.length === 0) return [];
  if (freeCells.includes(rolledValue)) return [rolledValue];

  let minDistance = Infinity;
  for (const cell of freeCells) {
    const dist = Math.abs(cell - rolledValue);
    if (dist < minDistance) {
      minDistance = dist;
    }
  }

  return freeCells
    .filter((cell) => Math.abs(cell - rolledValue) === minDistance)
    .sort((a, b) => a - b);
}

export function computeScissionPairs(targetSum: number, completedCells: number[]): [number, number][] {
  const freeCells = getFreeCells(completedCells);
  const pairs: [number, number][] = [];
  for (let i = 0; i < freeCells.length; i++) {
    for (let j = i + 1; j < freeCells.length; j++) {
      const a = freeCells[i];
      const b = freeCells[j];
      if (a + b === targetSum) {
        pairs.push([a, b]);
      }
    }
  }
  return pairs;
}

export function computeDoubleMisePartner(baseCell: number, completedCells: number[]): number | null {
  const freeCells = getFreeCells(completedCells).filter((c) => c !== baseCell);
  if (freeCells.length === 0) return null;
  if (freeCells.includes(baseCell + 1)) return baseCell + 1;
  const higher = freeCells.filter((c) => c > baseCell).sort((a, b) => a - b);
  if (higher.length > 0) return higher[0];
  const lower = freeCells.filter((c) => c < baseCell).sort((a, b) => b - a);
  return lower[0] ?? null;
}

export function drawRandomCard(existingHand: TacticalCardInstance[], remainingCellsCount: number): TacticalCardInstance {
  const existingIds = new Set(existingHand.map((h) => h.cardId));
  const distinctPool = TACTICAL_CARDS.filter((card) => {
    if (card.id === 'BALLE_DE_MATCH' && remainingCellsCount > 6) return false;
    return !existingIds.has(card.id);
  });

  const fallbackPool = TACTICAL_CARDS.filter((card) => {
    if (card.id === 'BALLE_DE_MATCH' && remainingCellsCount > 6) return false;
    return true;
  });

  const pool = distinctPool.length > 0 ? distinctPool : fallbackPool;
  const chosen = pool[Math.floor(Math.random() * pool.length)] || TACTICAL_CARDS[0];
  return {
    instanceId: `${chosen.id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    cardId: chosen.id,
  };
}

export function fillHandToThree(
  existingHand: TacticalCardInstance[],
  remainingCellsCount: number
): TacticalCardInstance[] {
  const nextHand = [...existingHand];
  while (nextHand.length < MAX_HAND_SIZE) {
    nextHand.push(drawRandomCard(nextHand, remainingCellsCount));
  }
  return nextHand.slice(0, MAX_HAND_SIZE);
}

export function createInitialTurnState(): ActiveTurnState {
  return {
    phase: 'IDLE',
    diceRoll: null,
    secondaryDiceRoll: null,
    doubleDiceActive: false,
    isDuplicate: false,
    reboundOptions: [],
    selectedTargetCells: [],
    baseReps: 0,
    finalReps: 0,
    activeCardUsed: null,
    notes: [],
  };
}

export function createPlayer(
  name: string,
  index: number,
  _startingCardsCount: number = 3,
  scalingLevel: ScalingLevel = 'RX',
  teamId: TeamId = 'SOLO'
): PlayerState {
  const hand = fillHandToThree([], 20);
  const color =
    teamId === 'ALPHA'
      ? '#dc2626'
      : teamId === 'BRAVO'
      ? '#2563eb'
      : PLAYER_COLORS[index % PLAYER_COLORS.length];

  return {
    id: `player_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim() || `Athlète ${index + 1}`,
    color,
    scalingLevel,
    teamId,
    completedCells: [],
    hand,
    stats: {
      totalRepsExecuted: 0,
      greenReps: 0,
      yellowReps: 0,
      redReps: 0,
      penaltyReps: 0,
      penaltySeconds: 0,
      cardsPlayed: 0,
      duplicatesHit: 0,
      rollsCount: 0,
    },
    turn: createInitialTurnState(),
    freezeUntilTimestamp: null,
    frozenByPlayerName: null,
    pendingExtraReps: 0,
    pendingExtraRepsFrom: [],
    finishedAtTimestamp: null,
  };
}
