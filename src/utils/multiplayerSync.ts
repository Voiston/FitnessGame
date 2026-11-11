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

const PEER_PREFIX = 'd20-fitness-battle-v1-';

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export interface SyncCallbacks {
  onRoomCreated: (room: RoomState, myPlayerId: string | null) => void;
  onRoomJoined: (room: RoomState, myPlayerId: string | null) => void;
  onRoomStateUpdated: (room: RoomState) => void;
  onError: (message: string) => void;
  onConnectionStatusChange?: (status: 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED') => void;
}

/**
 * Moteur de synchronisation hybride Peer-to-Peer (WebRTC via PeerJS) :
 * Fonctionne à 100% sur un hébergement statique gratuit comme GitHub Pages,
 * sans nécessiter de serveur Node.js en production.
 */
export class P2PRoomManager {
  private peer: Peer | null = null;
  private isHost: boolean = false;
  private hostRoom: RoomState | null = null;
  private guestConnections: Set<DataConnection> = new Set();
  private hostConnection: DataConnection | null = null;
  private callbacks: SyncCallbacks;
  private wakeLock: WakeLockSentinel | null = null;

  constructor(callbacks: SyncCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Active le maintien de l'écran allumé (Screen Wake Lock API) sur mobile
   * pour éviter que le smartphone ne coupe la connexion en se mettant en veille.
   */
  public async requestWakeLock() {
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      try {
        this.wakeLock = await navigator.wakeLock.request('screen');
      } catch {
        // Ignore if battery saver blocks wakeLock
      }
    }
  }

  public destroy() {
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
   * Crée une salle P2P sur le téléphone Hôte (ou l'écran Coach TV) avec un Code à 4 lettres.
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
          message: `Salle directe ${code} ouverte en Peer-to-Peer !`,
          type: 'ROLL',
        },
      ],
      createdAt: Date.now(),
    };

    this.hostRoom = newRoom;

    const peer = new Peer(peerId);
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
        // Retry with a fresh 4-letter code if collision
        this.createHostRoom(config, hostPlayerName, scalingLevel, teamId);
        return;
      }
      // Fallback: still allow local room creation even if offline
      this.callbacks.onConnectionStatusChange?.('CONNECTED');
      if (initialPlayers.length > 0) {
        this.callbacks.onRoomJoined(newRoom, initialPlayers[0].id);
      } else {
        this.callbacks.onRoomCreated(newRoom, null);
      }
    });
  }

  /**
   * Rejoint la salle d'un téléphone Hôte à partir du Code à 4 lettres.
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

    const peer = new Peer();
    this.peer = peer;

    peer.on('open', () => {
      const conn = peer.connect(targetPeerId, { reliable: true });
      this.hostConnection = conn;

      const timeout = setTimeout(() => {
        if (!conn.open) {
          this.callbacks.onConnectionStatusChange?.('DISCONNECTED');
          this.callbacks.onError(
            `Impossible de joindre la salle "${cleanCode}". Vérifiez que le téléphone Hôte est bien allumé avec ce code.`
          );
        }
      }, 7000);

      conn.on('open', () => {
        clearTimeout(timeout);
        this.callbacks.onConnectionStatusChange?.('CONNECTED');
        conn.send({
          type: 'room:join',
          roomCode: cleanCode,
          role: 'ATHLETE',
          playerName: playerName.trim() || 'Athlète',
          scalingLevel,
          teamId,
        });
      });

      conn.on('data', (rawData) => {
        const data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
        if (data.type === 'room:joined') {
          this.callbacks.onRoomJoined(data.room, data.playerId);
        } else if (data.type === 'room:state') {
          this.callbacks.onRoomStateUpdated(data.room);
        } else if (data.type === 'room:error') {
          this.callbacks.onError(data.message);
        }
      });

      conn.on('close', () => {
        this.callbacks.onConnectionStatusChange?.('DISCONNECTED');
      });
    });

    peer.on('error', (err) => {
      this.callbacks.onConnectionStatusChange?.('DISCONNECTED');
      if (err.type === 'peer-unavailable') {
        this.callbacks.onError(
          `Aucune salle active avec le code "${cleanCode}". Vérifiez les 4 caractères sur le téléphone Hôte.`
        );
      } else {
        this.callbacks.onError('Erreur de connexion Peer-to-Peer. Vérifiez votre connexion Internet.');
      }
    });
  }

  private broadcastFromHost() {
    if (!this.hostRoom) return;
    this.callbacks.onRoomStateUpdated({ ...this.hostRoom });
    const msg = {
      type: 'room:state',
      room: this.hostRoom,
    };
    for (const conn of this.guestConnections) {
      if (conn.open) {
        conn.send(msg);
      }
    }
  }

  private handleHostIncomingMessage(conn: DataConnection, rawData: unknown) {
    if (!this.hostRoom) return;
    const msg = typeof rawData === 'string' ? JSON.parse(rawData) : (rawData as Record<string, any>);

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
          message: `${player.name} a rejoint la salle !`,
          type: 'ROLL',
        };
        this.hostRoom.logs = [joinLog, ...this.hostRoom.logs].slice(0, 40);
      }

      conn.send({
        type: 'room:joined',
        room: this.hostRoom,
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
    } else if (this.hostConnection && this.hostConnection.open) {
      this.hostConnection.send({
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
    } else if (this.hostConnection && this.hostConnection.open) {
      this.hostConnection.send({
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

    let nextPlayers = this.hostRoom.players.map((p) => {
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
