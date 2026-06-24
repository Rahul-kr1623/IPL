/**
 * gameServer.js
 * Socket.io server for Cricket Blitz multiplayer.
 * Attach to the existing Express HTTP server via initGameServer(httpServer).
 *
 * Events (server → client):
 *   game:state     — full game state sync
 *   game:ball      — ball result (runs/wicket/wide)
 *   game:over      — innings/match over
 *   room:joined    — confirmed room join with role
 *   room:ready     — both players connected, game starts
 *   queue:waiting  — in matchmaking queue
 *   queue:matched  — matched with stranger
 *   error          — error message string
 *
 * Events (client → server):
 *   room:create    — create a friend room
 *   room:join      — join a friend room by code
 *   queue:join     — join stranger matchmaking
 *   queue:leave    — leave matchmaking queue
 *   game:shot      — player plays a shot (timing value 0-1)
 *   game:ready     — player ready to start next ball
 */

import { Server } from 'socket.io';

// ─── In-memory state ─────────────────────────────────────────────────────────
const rooms   = new Map();   // roomCode → RoomState
const queue   = [];          // socket ids waiting for stranger match
const players = new Map();   // socketId → { roomCode, role }

// ─── Helpers ─────────────────────────────────────────────────────────────────
const genCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();

const freshInnings = () => ({
  runs: 0, wickets: 0, balls: 0, overs: 0,
  batsmen: [
    { name: 'Player 1', runs: 0, balls: 0 },
    { name: 'Player 2', runs: 0, balls: 0 },
  ],
  activeBat: 0,
  partnerships: [],
  extras: 0,
  ballLog: [],   // array of { run, wicket, wide, noball, label }
});

const freshGame = (totalOvers = 2) => ({
  phase:      'toss',         // toss | batting | bowling | innings_break | result
  totalOvers,
  innings:    1,
  target:     null,
  inn1:       freshInnings(),
  inn2:       freshInnings(),
  tossWinner: null,
  tossChoice: null,           // bat | bowl
  waitingBall: false,         // true while waiting for bowler ready
});

const currentInnings = (game) => game.innings === 1 ? game.inn1 : game.inn2;

// Determine ball result from batter timing (0-1) and bowler variation (0-1)
const resolveBall = (batTiming, bowlVariation, difficulty = 'normal') => {
  // Perfect timing window narrows on harder difficulty
  const windows = {
    easy:   { perfect: 0.25, good: 0.45, edge: 0.65 },
    normal: { perfect: 0.15, good: 0.32, edge: 0.55 },
    hard:   { perfect: 0.10, good: 0.22, edge: 0.48 },
  };
  const w = windows[difficulty] || windows.normal;

  // bowler gets a deviation bonus — the further from center, the harder to time
  const bowlOffset = Math.abs(bowlVariation - 0.5) * 0.3;
  const diff = Math.abs(batTiming - 0.5);     // 0 = perfect center timing
  const adjusted = diff + bowlOffset;

  // Wide / No-ball chance (bot bowler only)
  if (Math.random() < 0.04) return { runs: 1, wide: true,   label: 'WD' };
  if (Math.random() < 0.015) return { runs: 1, noball: true, label: 'NB' };

  if (adjusted < w.perfect) {
    const r = Math.random();
    if (r < 0.12) return { runs: 6, label: '6' };
    if (r < 0.32) return { runs: 4, label: '4' };
    if (r < 0.52) return { runs: 3, label: '3' };
    if (r < 0.75) return { runs: 2, label: '2' };
    return { runs: 1, label: '1' };
  }
  if (adjusted < w.good) {
    const r = Math.random();
    if (r < 0.06) return { runs: 6, label: '6' };
    if (r < 0.18) return { runs: 4, label: '4' };
    if (r < 0.36) return { runs: 2, label: '2' };
    if (r < 0.65) return { runs: 1, label: '1' };
    return { runs: 0, label: '·' };
  }
  if (adjusted < w.edge) {
    const r = Math.random();
    if (r < 0.35) return { runs: 0, wicket: true, label: 'W' };
    if (r < 0.55) return { runs: 4, label: '4' };
    return { runs: 0, label: '·' };
  }
  // Missed / dot / wicket
  if (Math.random() < 0.55) return { runs: 0, wicket: true, label: 'W' };
  return { runs: 0, label: '·' };
};

// Apply ball result to innings state, return updated innings + event flags
const applyBall = (inn, result, totalOvers) => {
  const isLegal = !result.wide && !result.noball;

  inn.runs += result.runs;
  if (result.wide)   inn.extras++;
  if (result.noball) inn.extras++;

  if (isLegal) {
    inn.balls++;
    const bat = inn.batsmen[inn.activeBat];
    bat.runs  += result.runs;
    bat.balls++;

    if (result.wicket) {
      inn.wickets++;
      // Rotate strike: swap batsmen, reset new one
      inn.batsmen[inn.activeBat] = { name: `Player ${inn.wickets + 2}`, runs: 0, balls: 0 };
    } else if (result.runs % 2 === 1) {
      inn.activeBat = inn.activeBat === 0 ? 1 : 0;
    }
  }

  inn.overs = Math.floor(inn.balls / 6) + (inn.balls % 6) / 10;
  inn.ballLog.push(result.label);

  const oversCompleted = Math.floor(inn.balls / 6);
  const allOut = inn.wickets >= 10;
  const inningsOver = allOut || oversCompleted >= totalOvers;

  return { inn, inningsOver, allOut };
};

// ─── Room broadcast ───────────────────────────────────────────────────────────
const broadcastState = (io, roomCode) => {
  const room = rooms.get(roomCode);
  if (!room) return;
  io.to(roomCode).emit('game:state', {
    game: room.game,
    roles: { bat: room.batSocketId, bowl: room.bowlSocketId },
  });
};

// ─── Main initialiser ─────────────────────────────────────────────────────────
export const initGameServer = (httpServer) => {
  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    path: '/socket.io',
  });

  io.on('connection', (socket) => {
    console.log(`[Game] Socket connected: ${socket.id}`);

    // ── CREATE friend room ────────────────────────────────────────────────────
    socket.on('room:create', ({ overs = 2, name = 'Player 1' } = {}) => {
      const code = genCode();
      rooms.set(code, {
        code,
        game:         freshGame(overs),
        player1:      { id: socket.id, name },
        player2:      null,
        batSocketId:  null,
        bowlSocketId: null,
        mode:         'friend',
      });
      players.set(socket.id, { roomCode: code, role: 'host' });
      socket.join(code);
      socket.emit('room:joined', { code, role: 'host', playerNum: 1 });
      console.log(`[Game] Room created: ${code} by ${socket.id}`);
    });

    // ── JOIN friend room ──────────────────────────────────────────────────────
    socket.on('room:join', ({ code, name = 'Player 2' } = {}) => {
      const room = rooms.get(code?.toUpperCase());
      if (!room) { socket.emit('error', 'Room not found'); return; }
      if (room.player2) { socket.emit('error', 'Room is full'); return; }

      room.player2 = { id: socket.id, name };
      players.set(socket.id, { roomCode: code, role: 'guest' });
      socket.join(code);
      socket.emit('room:joined', { code, role: 'guest', playerNum: 2 });
      io.to(code).emit('room:ready', {
        player1: room.player1.name,
        player2: room.player2.name,
      });
      console.log(`[Game] ${socket.id} joined room ${code}`);
    });

    // ── JOIN stranger queue ───────────────────────────────────────────────────
    socket.on('queue:join', ({ overs = 2, name = 'Stranger' } = {}) => {
      if (queue.length > 0) {
        const opponent = queue.shift();
        const code = genCode();
        const oppSocket = io.sockets.sockets.get(opponent.id);

        rooms.set(code, {
          code,
          game:         freshGame(overs),
          player1:      opponent,
          player2:      { id: socket.id, name },
          batSocketId:  null,
          bowlSocketId: null,
          mode:         'stranger',
        });

        players.set(opponent.id, { roomCode: code, role: 'host' });
        players.set(socket.id,   { roomCode: code, role: 'guest' });

        oppSocket?.join(code);
        socket.join(code);

        io.to(code).emit('queue:matched', { code });
        io.to(code).emit('room:ready', {
          player1: opponent.name,
          player2: name,
        });
        console.log(`[Game] Matched strangers in room ${code}`);
      } else {
        queue.push({ id: socket.id, name });
        socket.emit('queue:waiting');
        console.log(`[Game] ${socket.id} added to queue (length: ${queue.length})`);
      }
    });

    socket.on('queue:leave', () => {
      const idx = queue.findIndex(q => q.id === socket.id);
      if (idx !== -1) queue.splice(idx, 1);
      socket.emit('queue:left');
    });

    // ── TOSS ─────────────────────────────────────────────────────────────────
    socket.on('game:toss', ({ choice } = {}) => {
      const info = players.get(socket.id);
      if (!info) return;
      const room = rooms.get(info.roomCode);
      if (!room || room.game.phase !== 'toss') return;

      const flip = Math.random() < 0.5 ? 'heads' : 'tails';
      const won  = (choice === flip);

      room.game.tossWinner = won ? socket.id : (
        socket.id === room.player1?.id ? room.player2?.id : room.player1?.id
      );

      io.to(info.roomCode).emit('game:toss_result', {
        flip, choice, winner: room.game.tossWinner,
      });
    });

    socket.on('game:toss_choice', ({ choice } = {}) => {
      const info = players.get(socket.id);
      if (!info) return;
      const room = rooms.get(info.roomCode);
      if (!room) return;

      if (choice === 'bat') {
        room.batSocketId  = socket.id;
        room.bowlSocketId = socket.id === room.player1?.id ? room.player2?.id : room.player1?.id;
      } else {
        room.bowlSocketId = socket.id;
        room.batSocketId  = socket.id === room.player1?.id ? room.player2?.id : room.player1?.id;
      }
      room.game.phase = 'batting';
      broadcastState(io, info.roomCode);
    });

    // ── SHOT (batter plays) ───────────────────────────────────────────────────
    socket.on('game:shot', ({ timing } = {}) => {
      const info = players.get(socket.id);
      if (!info) return;
      const room = rooms.get(info.roomCode);
      if (!room || room.game.phase !== 'batting') return;
      if (socket.id !== room.batSocketId) { socket.emit('error', 'Not your turn to bat'); return; }
      if (room.pendingShot) { socket.emit('error', 'Ball already in progress'); return; }

      room.pendingTiming = Math.max(0, Math.min(1, timing ?? 0.5));
      room.pendingShot   = true;

      // If there's a bowler (multiplayer), wait for their delivery
      // If bot mode, resolve immediately
      if (!room.bowlSocketId || room.mode === 'bot') {
        const bowlVar = Math.random();
        _resolveBall(io, room, room.pendingTiming, bowlVar);
      }
      // else: wait for game:bowl event from bowler
    });

    // ── BOWL (bowler delivers) ────────────────────────────────────────────────
    socket.on('game:bowl', ({ variation = 0.5 } = {}) => {
      const info = players.get(socket.id);
      if (!info) return;
      const room = rooms.get(info.roomCode);
      if (!room || room.game.phase !== 'batting') return;
      if (socket.id !== room.bowlSocketId) { socket.emit('error', 'Not your turn to bowl'); return; }

      const bowlVar = Math.max(0, Math.min(1, variation));

      if (room.pendingShot) {
        _resolveBall(io, room, room.pendingTiming, bowlVar);
      } else {
        // Store bowl, wait for shot
        room.pendingBowl = bowlVar;
      }
    });

    // ── DISCONNECT ────────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      console.log(`[Game] Socket disconnected: ${socket.id}`);
      const info = players.get(socket.id);
      if (info?.roomCode) {
        io.to(info.roomCode).emit('game:opponent_left');
        rooms.delete(info.roomCode);
      }
      players.delete(socket.id);
      const qi = queue.findIndex(q => q.id === socket.id);
      if (qi !== -1) queue.splice(qi, 1);
    });
  });

  // ── Internal: resolve a ball and update state ─────────────────────────────
  function _resolveBall(io, room, timing, bowlVar) {
    room.pendingShot = false;
    room.pendingTiming = null;
    room.pendingBowl   = null;

    const result = resolveBall(timing, bowlVar, room.difficulty || 'normal');
    const inn    = currentInnings(room.game);
    const { inningsOver } = applyBall(inn, result, room.game.totalOvers);

    io.to(room.code).emit('game:ball', { result, inn });

    if (inningsOver) {
      if (room.game.innings === 1) {
        room.game.target  = inn.runs + 1;
        room.game.innings = 2;
        room.game.phase   = 'innings_break';
        io.to(room.code).emit('game:innings_break', {
          inn1:   inn,
          target: room.game.target,
        });

        // Swap bat/bowl for 2nd innings
        const tmp             = room.batSocketId;
        room.batSocketId      = room.bowlSocketId;
        room.bowlSocketId     = tmp;

        setTimeout(() => {
          room.game.phase = 'batting';
          broadcastState(io, room.code);
        }, 4000);
      } else {
        // Match over
        const inn1   = room.game.inn1;
        const inn2   = room.game.inn2;
        const winner = inn2.runs >= room.game.target
          ? (room.batSocketId  || 'Player 2')
          : (room.bowlSocketId || 'Player 1');
        room.game.phase = 'result';
        io.to(room.code).emit('game:over', {
          inn1, inn2, winner,
          margin: inn2.runs >= room.game.target
            ? `${10 - inn2.wickets} wickets`
            : `${room.game.target - inn2.runs - 1} runs`,
        });
      }
    } else {
      broadcastState(io, room.code);
    }
  }

  console.log('[Game] Socket.io game server initialised');
  return io;
};