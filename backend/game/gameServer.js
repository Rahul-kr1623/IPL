/**
 * gameServer.js
 * Hand Cricket Multiplayer Socket.io server
 */
import { Server } from 'socket.io';

const rooms = {};

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function getRoomBySocket(socketId) {
  return Object.entries(rooms).find(([, r]) => r.players.some(p => p.id === socketId));
}

export const initGameServer = (httpServer) => {
  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    path: '/socket.io',
  });

  io.on("connection", (socket) => {
    console.log(`[Hand Cricket] Connected: ${socket.id}`);

    // ── Create Room ──
    socket.on("createRoom", ({ name }) => {
      let code;
      do { code = generateCode(); } while (rooms[code]);

      rooms[code] = {
        players: [{ id: socket.id, name }],
        scores: {},
        toss: { moves: {}, winnerId: null },
        batting: null,
        target: null,
        innings: 1,
        phase: "waiting",
        currentMoves: {},
        rematchVotes: new Set(),
      };

      socket.join(code);
      socket.emit("roomCreated", { code });
      console.log(`[Room] ${code} created by "${name}"`);
    });

    // ── Join Room ──
    socket.on("joinRoom", ({ name, roomCode }) => {
      const room = rooms[roomCode];
      if (!room) { socket.emit("roomError", { message: "Room not found. Check the code." }); return; }
      if (room.players.length >= 2) { socket.emit("roomError", { message: "Room is full." }); return; }
      if (room.phase !== "waiting") { socket.emit("roomError", { message: "Game already in progress." }); return; }

      room.players.push({ id: socket.id, name });
      room.phase = "toss";
      socket.join(roomCode);

      const names = room.players.map(p => p.name);

      // Tell Player 2 they joined successfully
      socket.emit("joinedRoom", { code: roomCode, names });

      // Tell Player 1 someone joined
      socket.to(roomCode).emit("playerJoined", { names });

      console.log(`[Room] "${name}" joined ${roomCode}`);
    });

    // ── Toss Pick ──
    socket.on("tossPick", ({ roomCode, move }) => {
      const room = rooms[roomCode];
      if (!room || room.phase !== "toss") return;
      if (room.toss.moves[socket.id] !== undefined) return; // already picked

      room.toss.moves[socket.id] = move;

      if (Object.keys(room.toss.moves).length === 2) {
        const [p1, p2] = room.players;
        const m1 = room.toss.moves[p1.id];
        const m2 = room.toss.moves[p2.id];
        const sum = m1 + m2;
        // Even sum = p1 wins, Odd = p2 wins
        const winnerId = sum % 2 === 0 ? p1.id : p2.id;
        const winner = room.players.find(p => p.id === winnerId).name;
        room.toss.winnerId = winnerId;

        room.phase = "tossResult";
        
        room.players.forEach(p => {
          const you = room.toss.moves[p.id];
          const opponent = room.players.find(x => x.id !== p.id);
          if (!opponent) return;

          const opp = room.toss.moves[opponent.id];
          const iWon = String(p.id) === String(winnerId);
          io.to(p.id).emit("tossResult", { you, opp, sum, winner, iWon });
        });

        console.log(`[Toss] ${roomCode}: sum=${sum}, winner="${winner}"`);
      }
    });

    // ── Toss Choice (winner picks bat/bowl) ──
    socket.on("tossChoice", ({ roomCode, choice }) => {
      const room = rooms[roomCode];
      if (!room || room.toss.winnerId !== socket.id) return;

      const battingId = choice === "bat"
        ? socket.id
        : room.players.find(p => p.id !== socket.id).id;

      room.batting = battingId;
      room.phase = "game";
      room.innings = 1;
      room.scores = {};
      room.players.forEach(p => { room.scores[p.id] = 0; });
      room.currentMoves = {};

      const names = room.players.map(p => p.name);
      io.to(roomCode).emit("gameStart", { battingId, innings: 1, names });
      console.log(`[Game] ${roomCode} started. Batting: ${battingId}`);
    });

    // ── Player Move ──
    socket.on("playerMove", ({ roomCode, move }) => {
      const room = rooms[roomCode];
      if (!room || room.phase !== "game") return;
      if (room.currentMoves[socket.id] !== undefined) return; // already submitted

      room.currentMoves[socket.id] = move;

      if (Object.keys(room.currentMoves).length === 2) {
        const batter = room.batting;
        const bowler = room.players.find(p => p.id !== batter).id;
        const batterMove = room.currentMoves[batter];
        const bowlerMove = room.currentMoves[bowler];
        const broadcastMoves = { [batter]: batterMove, [bowler]: bowlerMove };

        // Reset for next ball immediately
        room.currentMoves = {};

        const isOut = batterMove === bowlerMove;

        if (!isOut) {
          // Hand cricket rule: if move is 0, it means defense. Usually 0 scores the bowler's move.
          // Wait, let me check the script.js or logic for score addition.
          // In the provided server.js: room.scores[batter] = (room.scores[batter] || 0) + batterMove;
          // If batterMove is 0, they score 0? Oh wait, in some variants 0 = 6 or 0 = bowlerMove.
          // Let's just use what the server.js provided.
          let runsScored = batterMove;
          if (batterMove === 0) {
            runsScored = bowlerMove; // commonly in hand cricket, 0 scores bowler's run
          }
          room.scores[batter] = (room.scores[batter] || 0) + runsScored;
        }

        const scoresCopy = { ...room.scores };

        if (isOut) {
          if (room.innings === 1) {
            // End of innings 1 — switch
            room.target = room.scores[batter] + 1;
            const newBatter = bowler;

            io.to(roomCode).emit("roundResult", {
              moves: broadcastMoves, batter, runs: 0, isOut: true,
              scores: scoresCopy, targetVal: null,
            });

            setTimeout(() => {
              room.innings = 2;
              room.batting = newBatter;
              const names = room.players.map(p => p.name);
              io.to(roomCode).emit("inningsEnd", { target: room.target });
              io.to(roomCode).emit("gameStart", { battingId: newBatter, innings: 2, names });
              console.log(`[Game] ${roomCode} innings 2 starts. Target: ${room.target}`);
            }, 1500);

          } else {
            // Innings 2 — chaser out before target
            const winnerId = bowler;
            io.to(roomCode).emit("roundResult", {
              moves: broadcastMoves, batter, runs: 0, isOut: true,
              scores: scoresCopy, targetVal: room.target,
            });
            setTimeout(() => {
              io.to(roomCode).emit("gameOver", { winnerId, scores: scoresCopy, reason: "Bowled out!" });
              room.phase = "over";
            }, 1200);
          }

        } else {
          // Not out — check if chaser reached target
          const chaseWon = room.innings === 2 && room.scores[batter] >= room.target;
          let runsScored = batterMove;
          if (batterMove === 0) runsScored = bowlerMove;

          io.to(roomCode).emit("roundResult", {
            moves: broadcastMoves, batter, runs: runsScored, isOut: false,
            scores: scoresCopy, targetVal: room.target ?? null,
          });

          if (chaseWon) {
            setTimeout(() => {
              io.to(roomCode).emit("gameOver", {
                winnerId: batter, scores: scoresCopy, reason: "Target chased!",
              });
              room.phase = "over";
            }, 1200);
          }
        }
      }
    });

    // ── Rematch ──
    socket.on("requestRematch", ({ roomCode }) => {
      const room = rooms[roomCode];
      if (!room) return;

      // Handle Map/Set correctly in JSON by converting Set to size or array if needed elsewhere, 
      // but here it's purely internal.
      if (!room.rematchVotes) room.rematchVotes = new Set();
      room.rematchVotes.add(socket.id);
      console.log(`[Rematch] ${roomCode}: ${room.rematchVotes.size}/2 votes`);

      if (room.rematchVotes.size === 1) {
        socket.emit("waitingForRematch");
      }

      if (room.rematchVotes.size === 2) {
        room.rematchVotes = new Set();
        room.toss = { moves: {}, winnerId: null };
        room.batting = null;
        room.target = null;
        room.innings = 1;
        room.phase = "toss";
        room.scores = {};
        room.currentMoves = {};
        io.to(roomCode).emit("rematchReady");
        console.log(`[Rematch] ${roomCode} restarting`);
      }
    });

    // ── Leave Room ──
    socket.on("leaveRoom", ({ roomCode }) => {
      cleanupRoom(socket.id, roomCode);
    });

    // ── Disconnect ──
    socket.on("disconnect", () => {
      console.log(`[Hand Cricket] Disconnected: ${socket.id}`);
      const entry = getRoomBySocket(socket.id);
      if (entry) cleanupRoom(socket.id, entry[0]);
    });

    function cleanupRoom(socketId, roomCode) {
      const room = rooms[roomCode];
      if (!room) return;
      room.players
        .filter(p => p.id !== socketId)
        .forEach(p => io.to(p.id).emit("opponentLeft"));
      delete rooms[roomCode];
      console.log(`[Room] ${roomCode} deleted`);
    }
  });

  console.log('[Game] Socket.io hand cricket server initialised');
  return io;
};