import Peer, { DataConnection } from 'peerjs';
import {
  RoomState,
  WorkoutConfig,
  PlayerState,
  ScalingLevel,
  TeamId,
  GameLogEntry,
  createPlayer,
} from '../types/game';

const PEER_PREFIX = 'd20-fitness-battle-v2-';

const PEER_CONFIG = {
  debug: 1,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
    ],
  },
};

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * Construit le lien d'invitation complet en conservant le sous-dossier GitHub Pages
 * (ex: https://pseudo.github.io/FitnessGame/?room=K7X9) pour éviter toute erreur 404.
 */
export function buildShareableRoomUrl(roomCode: string): string {
  if (typeof window === 'undefined') {
    return `?room=${roomCode}`;
  }
  const cleanCode = roomCode.trim().toUpperCase();
  const basePath = window.location.origin + window.location.pathname;
  const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}`;
  return `${normalizedBase}?room=${encodeURIComponent(cleanCode)}`;
}

export interface SyncCallbacks {
  onRoomCreated: (room: RoomState, myPlayerId: string | null) => void;
  onRoomJoined: (room: RoomState, myPlayerId: string | null) => void;
  onRoomStateUpdated: (room: RoomState) => void;
  onError: (message: string) => void;
  onConnectionStatusChange?: (status: 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED') => void;
}

/**
 * Envoie un message de manière fiable sur une DataConnection PeerJS,
 * même si le canal WebRTC achève encore son ouverture.
 */
function safeSend(conn: DataConnection, payload: Record<string, unknown>) {
  if (conn.open) {
    try {
      conn.send(payload);
    } catch (e) {
      console.error('PeerJS send error:', e);
    }
  } else {
    conn.once('open', () => {
      try {
        conn.send(payload);
      } catch (e) {
        console.error('PeerJS delayed send error:', e);
      }
    });
  }
}

export class P2PRoomManager {
  private peer: Peer | null = null;
  private isHost: boolean = false;
  private hostRoom: RoomState | null = null;
  private guestConnections: Set<DataConnection> = new Set();
  private hostConnection: DataConnection | null = null;
  private callbacks: SyncCallbacks;
  private wakeLock: WakeLockSentinel | null = null;
  private joinRetryTimer: ReturnType<typeof setInterval> | null = null;
  private joinTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private clientSessionId: string = `client_${Math.random().toString(36).slice(2, 10)}`;

  constructor(callbacks: SyncCallbacks) {
    this.callbacks = callbacks;
  }

  public async requestWakeLock() {
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      try {
        this.wakeLock = await navigator.wakeLock.request('screen');
      } catch {
        // Ignore if battery saver blocks wakeLock
      }
    }
  }

  private clearTimers() {
    if (this.joinRetryTimer) {
      clearInterval(this.joinRetryTimer);
      this.joinRetryTimer = null;
    }
    if (this.joinTimeoutTimer) {
      clearTimeout(this.joinTimeoutTimer);
      this.joinTimeoutTimer = null;
    }
  }

  public destroy() {
    this.clearTimers();
    this.guestConnections.forEach((conn) => {
      try {
        conn.close();
      } catch {}
    });
    this.guestConnections.clear();
    if (this.hostConnection) {
      try {
        this.hostConnection.close();
      } catch {}
      this.hostConnection = null;
    }
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {}
      this.peer = null;
    }
    if (this.wakeLock) {
      this.wakeLock.release().catch(() => {});
      this.wakeLock = null;
    }
  }

  /**
   * Crée un Salon Hôte avec un code à 4 caractères.
   * Si hostPlayerName est fourni, l'hôte est automatiquement ajouté comme joueur #1.
   */
  public createHostRoom(
    config: WorkoutConfig,
    hostPlayerName?: string,
    scalingLevel: ScalingLevel = 'RX',
    teamId: TeamId = 'SOLO'
  ) {
    this.destroy();
    this.isHost = true;
    this.requestWakeLock();
    this.callbacks.onConnectionStatusChange?.('CONNECTING');

    const code = generateRoomCode();
    const peerId = `${PEER_PREFIX}${code}`;

    const cleanHostName = (hostPlayerName || '').trim();
    const effectiveTeam: TeamId =
      config.teamMode === 'COOP_RELAY' || config.teamMode === 'TEAMS_VERSUS'
        ? teamId === 'SOLO'
          ? 'ALPHA'
          : teamId
        : teamId;

    const initialPlayers = cleanHostName
      ? [createPlayer(cleanHostName, 0, config.startingCardsCount, scalingLevel, effectiveTeam)]
      : [];

    const newRoom: RoomState = {
      roomCode: code,
      mode: 'MULTI_SCREEN',
      status: 'PLAYING',
      config,
      players: initialPlayers,
      activePlayerIndex: 0,
      winnerId: null,
      logs: [
        {
          id: `log_${Date.now()}`,
          timestamp: Date.now(),
          playerName: cleanHostName || 'Coach',
          message: `Salon ${code} ouvert ! Partagez le code ou le lien aux participants.`,
          type: 'ROLL',
        },
      ],
      createdAt: Date.now(),
    };

    this.hostRoom = newRoom;

    const peer = new Peer(peerId, PEER_CONFIG);
    this.peer = peer;

    peer.on('open', () => {
      this.callbacks.onConnectionStatusChange?.('CONNECTED');
      if (initialPlayers.length > 0) {
        this.callbacks.onRoomJoined(newRoom, initialPlayers[0].id);
      } else {
        this.callbacks.onRoomCreated(newRoom, null);
      }
    });

    peer.on('connection', (conn) => {
      this.guestConnections.add(conn);

      conn.on('open', () => {
        if (this.hostRoom) {
          safeSend(conn, {
            type: 'host:ready',
            roomCode: this.hostRoom.roomCode,
          });
        }
      });

      conn.on('data', (rawData) => {
        this.handleHostIncomingMessage(conn, rawData);
      });

      conn.on('close', () => {
        this.guestConnections.delete(conn);
      });

      conn.on('error', () => {
        this.guestConnections.delete(conn);
      });
    });

    peer.on('error', (err) => {
      console.error('PeerJS Host error:', err);
      if (err.type === 'unavailable-id') {
        this.createHostRoom(config, hostPlayerName, scalingLevel, teamId);
        return;
      }
      this.callbacks.onError(
        `Erreur réseau lors de l'ouverture du salon (${err.type || 'réseau'}). Vérifiez votre connexion Internet.`
      );
      this.callbacks.onConnectionStatusChange?.('DISCONNECTED');
    });
  }

  /**
   * Rejoint le salon d'un Hôte via le code à 4 lettres avec relance automatique
   * du handshake pour garantir la connexion sur mobile 4G/5G et Wi-Fi.
   */
  public joinHostRoom(
    roomCode: string,
    playerName: string,
    scalingLevel: ScalingLevel = 'RX',
    teamId: TeamId = 'SOLO'
  ) {
    this.destroy();
    this.isHost = false;
    this.requestWakeLock();
    this.callbacks.onConnectionStatusChange?.('CONNECTING');

    const cleanCode = roomCode.toUpperCase().trim();
    const targetPeerId = `${PEER_PREFIX}${cleanCode}`;
    const cleanName = playerName.trim() || 'Athlète';

    const peer = new Peer(PEER_CONFIG);
    this.peer = peer;

    let hasJoinedRoom = false;

    const sendJoinRequest = (conn: DataConnection) => {
      if (hasJoinedRoom) return;
      safeSend(conn, {
        type: 'room:join',
        roomCode: cleanCode,
        clientSessionId: this.clientSessionId,
        role: 'ATHLETE',
        playerName: cleanName,
        scalingLevel,
        teamId,
      });
    };

    this.joinTimeoutTimer = setTimeout(() => {
      if (!hasJoinedRoom) {
        this.clearTimers();
        this.callbacks.onConnectionStatusChange?.('DISCONNECTED');
        this.callbacks.onError(
          `Impossible de rejoindre le salon "${cleanCode}". Vérifiez que le téléphone de l'Hôte affiche bien le code ${cleanCode} et que son écran est allumé.`
        );
      }
    }, 12000);

    peer.on('open', () => {
      const conn = peer.connect(targetPeerId, {
        reliable: true,
      });
      this.hostConnection = conn;

      conn.on('open', () => {
        sendJoinRequest(conn);
        // Relance toutes les 1.2s tant que la confirmation room:joined n'a pas été reçue
        this.joinRetryTimer = setInterval(() => {
          if (hasJoinedRoom) {
            this.clearTimers();
            return;
          }
          sendJoinRequest(conn);
        }, 1200);
      });

      conn.on('data', (rawData) => {
        const data = typeof rawData === 'string' ? JSON.parse(rawData) : (rawData as Record<string, any>);
        if (!data) return;

        if (data.type === 'host:ready' && !hasJoinedRoom) {
          sendJoinRequest(conn);
        } else if (data.type === 'room:joined') {
          hasJoinedRoom = true;
          this.clearTimers();
          this.callbacks.onConnectionStatusChange?.('CONNECTED');
          this.callbacks.onRoomJoined(data.room, data.playerId);
        } else if (data.type === 'room:state') {
          if (!hasJoinedRoom && data.room) {
            const matched = (data.room as RoomState).players.find(
              (p) => p.name.toLowerCase() === cleanName.toLowerCase()
            );
            if (matched) {
              hasJoinedRoom = true;
              this.clearTimers();
              this.callbacks.onConnectionStatusChange?.('CONNECTED');
              this.callbacks.onRoomJoined(data.room, matched.id);
              return;
            }
          }
          this.callbacks.onRoomStateUpdated(data.room);
        } else if (data.type === 'room:error') {
          this.clearTimers();
          this.callbacks.onError(data.message);
        }
      });

      conn.on('close', () => {
        if (!hasJoinedRoom) {
          this.clearTimers();
        }
        this.callbacks.onConnectionStatusChange?.('DISCONNECTED');
      });
    });

    peer.on('error', (err) => {
      this.clearTimers();
      this.callbacks.onConnectionStatusChange?.('DISCONNECTED');
      if (err.type === 'peer-unavailable') {
        this.callbacks.onError(
          `Aucun salon actif trouvé avec le code "${cleanCode}". Vérifiez que l'Hôte a bien créé le salon et garde la page ouverte.`
        );
      } else {
        this.callbacks.onError(
          `Erreur de connexion (${err.type || 'réseau'}). Réessayez dans quelques secondes.`
        );
      }
    });
  }

  private broadcastFromHost() {
    if (!this.hostRoom) return;
    const snapshot: RoomState = JSON.parse(JSON.stringify(this.hostRoom));
    this.callbacks.onRoomStateUpdated(snapshot);
    const msg = {
      type: 'room:state',
      room: snapshot,
    };
    for (const conn of this.guestConnections) {
      safeSend(conn, msg);
    }
  }

  private handleHostIncomingMessage(conn: DataConnection, rawData: unknown) {
    if (!this.hostRoom) return;
    const msg = typeof rawData === 'string' ? JSON.parse(rawData) : (rawData as Record<string, any>);
    if (!msg) return;

    if (msg.type === 'room:join') {
      const name = (msg.playerName || '').trim() || `Athlète ${this.hostRoom.players.length + 1}`;
      let player = this.hostRoom.players.find(
        (p) => p.name.toLowerCase() === name.toLowerCase()
      );

      if (!player) {
        const scaling: ScalingLevel = msg.scalingLevel || 'RX';
        const defaultTeam: TeamId =
          this.hostRoom.config.teamMode === 'COOP_RELAY'
            ? 'ALPHA'
            : this.hostRoom.config.teamMode === 'TEAMS_VERSUS'
            ? msg.teamId && msg.teamId !== 'SOLO'
              ? msg.teamId
              : this.hostRoom.players.length % 2 === 0
              ? 'ALPHA'
              : 'BRAVO'
            : msg.teamId || 'SOLO';

        player = createPlayer(
          name,
          this.hostRoom.players.length,
          this.hostRoom.config.startingCardsCount,
          scaling,
          defaultTeam
        );

        if (defaultTeam !== 'SOLO') {
          const teammate = this.hostRoom.players.find((p) => p.teamId === defaultTeam);
          if (teammate) {
            player.completedCells = [...teammate.completedCells];
          }
        }

        this.hostRoom.players = [...this.hostRoom.players, player];
        const joinLog: GameLogEntry = {
          id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          timestamp: Date.now(),
          playerName: player.name,
          message: `${player.name} a rejoint le salon !`,
          type: 'ROLL',
        };
        this.hostRoom.logs = [joinLog, ...this.hostRoom.logs].slice(0, 40);
      }

      const snapshot: RoomState = JSON.parse(JSON.stringify(this.hostRoom));
      safeSend(conn, {
        type: 'room:joined',
        room: snapshot,
        playerId: player.id,
      });

      this.broadcastFromHost();
    } else if (msg.type === 'player:sync') {
      this.applyPlayerSyncOnHost(msg.player, msg.targetUpdate, msg.logEntry);
    } else if (msg.type === 'room:update_state' && msg.room) {
      this.hostRoom = msg.room;
      this.broadcastFromHost();
    }
  }

  public syncPlayerAction(
    updatedPlayer: PlayerState,
    targetUpdate?: {
      targetPlayerId: string;
      freezeSeconds?: number;
      addExtraReps?: number;
    },
    logEntry?: GameLogEntry
  ) {
    if (this.isHost && this.hostRoom) {
      this.applyPlayerSyncOnHost(updatedPlayer, targetUpdate, logEntry);
    } else if (this.hostConnection) {
      safeSend(this.hostConnection, {
        type: 'player:sync',
        player: updatedPlayer,
        targetUpdate,
        logEntry,
      });
    }
  }

  public syncFullRoomState(nextRoom: RoomState) {
    if (this.isHost) {
      this.hostRoom = nextRoom;
      this.broadcastFromHost();
    } else if (this.hostConnection) {
      safeSend(this.hostConnection, {
        type: 'room:update_state',
        room: nextRoom,
      });
    }
  }

  private applyPlayerSyncOnHost(
    updatedPlayer: PlayerState,
    targetUpdate?: {
      targetPlayerId: string;
      freezeSeconds?: number;
      addExtraReps?: number;
    },
    logEntry?: GameLogEntry
  ) {
    if (!this.hostRoom) return;

    const sharedTeamCells =
      updatedPlayer.teamId && updatedPlayer.teamId !== 'SOLO'
        ? Array.from(
            new Set([
              ...updatedPlayer.completedCells,
              ...this.hostRoom.players
                .filter((p) => p.teamId === updatedPlayer.teamId)
                .flatMap((p) => p.completedCells),
            ])
          ).sort((a, b) => a - b)
        : null;

    const nextPlayers = this.hostRoom.players.map((p) => {
      if (p.id === updatedPlayer.id) {
        return sharedTeamCells
          ? { ...updatedPlayer, completedCells: sharedTeamCells }
          : updatedPlayer;
      }

      let copy = { ...p };
      if (sharedTeamCells && p.teamId === updatedPlayer.teamId) {
        copy.completedCells = sharedTeamCells;
      }

      if (targetUpdate && p.id === targetUpdate.targetPlayerId) {
        copy = { ...copy, turn: { ...copy.turn, notes: [...copy.turn.notes] } };
        if (targetUpdate.freezeSeconds) {
          copy.freezeUntilTimestamp = Date.now() + targetUpdate.freezeSeconds * 1000;
          copy.frozenByPlayerName = updatedPlayer.name;
        }
        if (targetUpdate.addExtraReps) {
          copy.pendingExtraReps += targetUpdate.addExtraReps;
          copy.pendingExtraRepsFrom = [...copy.pendingExtraRepsFrom, updatedPlayer.name];
          if (copy.turn.phase === 'ROLLED' || copy.turn.phase === 'EXECUTING_REPS') {
            copy.turn.finalReps += targetUpdate.addExtraReps;
            copy.turn.notes.push(`+${targetUpdate.addExtraReps} rép. (${updatedPlayer.name})`);
          }
        }
      }
      return copy;
    });

    let nextLogs: GameLogEntry[] = logEntry
      ? [logEntry, ...this.hostRoom.logs].slice(0, 40)
      : [...this.hostRoom.logs];

    const finishedPlayer = nextPlayers.find((p) => p.completedCells.length >= 20);
    let nextStatus = this.hostRoom.status;
    let nextWinnerId = this.hostRoom.winnerId;

    if (finishedPlayer && this.hostRoom.status !== 'GAME_OVER') {
      nextStatus = 'GAME_OVER';
      nextWinnerId = finishedPlayer.id;
      const winEntry: GameLogEntry = {
        id: `log_win_${Date.now()}`,
        timestamp: Date.now(),
        playerName: finishedPlayer.name,
        message: `VICTOIRE ! ${finishedPlayer.name} a complété les 20 cases !`,
        type: 'VICTORY',
      };
      nextLogs = [winEntry, ...nextLogs];
    }

    this.hostRoom = {
      ...this.hostRoom,
      status: nextStatus,
      winnerId: nextWinnerId,
      players: nextPlayers,
      logs: nextLogs,
    };

    this.broadcastFromHost();
  }
}
