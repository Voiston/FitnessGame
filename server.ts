import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import {
  RoomState,
  WorkoutConfig,
  createPlayer,
  WORKOUT_PRESETS,
} from './src/types/game.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

interface ConnectedClient {
  ws: WebSocket;
  roomCode: string | null;
  playerId: string | null;
  role: 'COACH' | 'ATHLETE' | null;
}

const rooms = new Map<string, RoomState>();
const clients = new Set<ConnectedClient>();

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (rooms.has(code));
  return code;
}

function broadcastRoomState(roomCode: string) {
  const room = rooms.get(roomCode);
  if (!room) return;
  const payload = JSON.stringify({
    type: 'room:state',
    room,
  });
  for (const client of clients) {
    if (client.roomCode === roomCode && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', activeRooms: rooms.size });
  });

  app.get('/api/rooms/:code', (req, res) => {
    const code = (req.params.code || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) {
      res.status(404).json({ error: 'Salle introuvable' });
      return;
    }
    res.json({ room });
  });

  wss.on('connection', (ws) => {
    const client: ConnectedClient = {
      ws,
      roomCode: null,
      playerId: null,
      role: null,
    };
    clients.add(client);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        switch (msg.type) {
          case 'room:create': {
            const config: WorkoutConfig = msg.config || WORKOUT_PRESETS[0].config;
            const roomCode = generateRoomCode();
            const hostPlayerName = (msg.hostPlayerName || '').trim();
            const hostScaling = msg.scalingLevel || 'RX';
            const hostTeam =
              config.teamMode === 'COOP_RELAY' || config.teamMode === 'TEAMS_VERSUS'
                ? msg.teamId || 'ALPHA'
                : 'SOLO';

            const initialPlayers = hostPlayerName
              ? [createPlayer(hostPlayerName, 0, config.startingCardsCount, hostScaling, hostTeam)]
              : [];

            const newRoom: RoomState = {
              roomCode,
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
                  playerName: hostPlayerName || 'Coach',
                  message: `Salle ${roomCode} ouverte en direct !`,
                  type: 'ROLL',
                },
              ],
              createdAt: Date.now(),
            };
            rooms.set(roomCode, newRoom);
            client.roomCode = roomCode;
            if (initialPlayers.length > 0) {
              client.role = 'ATHLETE';
              client.playerId = initialPlayers[0].id;
              ws.send(
                JSON.stringify({
                  type: 'room:joined',
                  room: newRoom,
                  playerId: initialPlayers[0].id,
                })
              );
            } else {
              client.role = 'COACH';
              ws.send(JSON.stringify({ type: 'room:created', room: newRoom }));
            }
            break;
          }

          case 'room:join': {
            const code = (msg.roomCode || '').toUpperCase().trim();
            const room = rooms.get(code);
            if (!room) {
              ws.send(
                JSON.stringify({
                  type: 'room:error',
                  message: `Aucune salle active avec le code "${code}". Vérifiez les 4 caractères.`,
                })
              );
              return;
            }

            client.roomCode = code;
            client.role = msg.role || 'ATHLETE';

            if (client.role === 'ATHLETE') {
              const existingPlayerId = msg.playerId;
              let player = room.players.find((p) => p.id === existingPlayerId);

              if (!player) {
                const name = (msg.playerName || '').trim() || `Athlète ${room.players.length + 1}`;
                const byName = room.players.find(
                  (p) => p.name.toLowerCase() === name.toLowerCase()
                );
                if (byName) {
                  player = byName;
                } else {
                  const scaling = msg.scalingLevel || 'RX';
                  const defaultTeam =
                    room.config.teamMode === 'COOP_RELAY'
                      ? 'ALPHA'
                      : room.config.teamMode === 'TEAMS_VERSUS'
                      ? msg.teamId || (room.players.length % 2 === 0 ? 'ALPHA' : 'BRAVO')
                      : msg.teamId || 'SOLO';

                  player = createPlayer(
                    name,
                    room.players.length,
                    room.config.startingCardsCount,
                    scaling,
                    defaultTeam
                  );

                  // If joining an active team that already has completed cells, sync with teammates' grid!
                  if (defaultTeam !== 'SOLO') {
                    const teammate = room.players.find((p) => p.teamId === defaultTeam);
                    if (teammate) {
                      player.completedCells = [...teammate.completedCells];
                    }
                  }

                  room.players.push(player);
                  room.logs.unshift({
                    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                    timestamp: Date.now(),
                    playerName: player.name,
                    message: `${player.name} a rejoint l'arène !`,
                    type: 'ROLL',
                  });
                }
              }

              client.playerId = player.id;
              ws.send(
                JSON.stringify({
                  type: 'room:joined',
                  room,
                  playerId: player.id,
                })
              );
            } else {
              ws.send(
                JSON.stringify({
                  type: 'room:joined',
                  room,
                  playerId: null,
                })
              );
            }

            broadcastRoomState(code);
            break;
          }

          case 'room:update_state': {
            const code = (msg.roomCode || client.roomCode || '').toUpperCase().trim();
            const room = rooms.get(code);
            if (!room || !msg.room) return;
            const updated: RoomState = msg.room;
            rooms.set(code, updated);
            broadcastRoomState(code);
            break;
          }

          case 'player:sync': {
            const code = (msg.roomCode || client.roomCode || '').toUpperCase().trim();
            const room = rooms.get(code);
            if (!room || !msg.player) return;

            const idx = room.players.findIndex((p) => p.id === msg.player.id);
            if (idx !== -1) {
              room.players[idx] = msg.player;
            }

            // If player belongs to a shared team (ALPHA or BRAVO), sync completedCells across all teammates!
            if (msg.player.teamId && msg.player.teamId !== 'SOLO') {
              const mergedCells = Array.from(
                new Set([
                  ...msg.player.completedCells,
                  ...room.players
                    .filter((p) => p.teamId === msg.player.teamId)
                    .flatMap((p) => p.completedCells),
                ])
              ).sort((a, b) => a - b);

              room.players = room.players.map((p) =>
                p.teamId === msg.player.teamId
                  ? { ...p, completedCells: mergedCells }
                  : p
              );
            }

            // Apply any targeted effects on another rival (Gel, Lest Tactique, Partage Charge)
            if (msg.targetUpdate && msg.targetUpdate.targetPlayerId) {
              const targetIdx = room.players.findIndex(
                (p) => p.id === msg.targetUpdate.targetPlayerId
              );
              if (targetIdx !== -1) {
                const target = room.players[targetIdx];
                if (msg.targetUpdate.freezeSeconds) {
                  target.freezeUntilTimestamp = Date.now() + msg.targetUpdate.freezeSeconds * 1000;
                  target.frozenByPlayerName = msg.player.name;
                }
                if (msg.targetUpdate.addExtraReps) {
                  target.pendingExtraReps += msg.targetUpdate.addExtraReps;
                  target.pendingExtraRepsFrom.push(msg.player.name);
                  // If target is already in ROLLED or EXECUTING_REPS phase, update their finalReps immediately
                  if (target.turn.phase === 'ROLLED' || target.turn.phase === 'EXECUTING_REPS') {
                    target.turn.finalReps += msg.targetUpdate.addExtraReps;
                    target.turn.notes.push(
                      `+${msg.targetUpdate.addExtraReps} rép. (${msg.player.name})`
                    );
                  }
                }
              }
            }

            if (msg.logEntry) {
              room.logs.unshift(msg.logEntry);
              if (room.logs.length > 40) {
                room.logs = room.logs.slice(0, 40);
              }
            }

            // Check victory condition (20 cells completed)
            const finishedPlayer = room.players.find((p) => p.completedCells.length >= 20);
            if (finishedPlayer && room.status !== 'GAME_OVER') {
              room.status = 'GAME_OVER';
              room.winnerId = finishedPlayer.id;
              finishedPlayer.finishedAtTimestamp = Date.now();
              room.logs.unshift({
                id: `log_win_${Date.now()}`,
                timestamp: Date.now(),
                playerName: finishedPlayer.name,
                message: `VICTOIRE ! ${finishedPlayer.name} a complété les 20 cases de sa grille !`,
                type: 'VICTORY',
              });
            }

            broadcastRoomState(code);
            break;
          }
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    });

    ws.on('close', () => {
      clients.delete(client);
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`D20 Fitness Battle server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
