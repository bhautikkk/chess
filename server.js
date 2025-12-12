
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const path = require('path');

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Room state: { [roomCode]: { players: [socketId1, socketId2], boardState: ... } }
const rooms = {};

function generateRoomCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

io.on('connection', (socket) => {
    console.log('a user connected', socket.id);

    // Create Room
    socket.on('createRoom', (playerName) => {
        const roomCode = generateRoomCode();
        rooms[roomCode] = {
            players: [socket.id],
            white: socket.id,
            black: null,
            whiteName: playerName,
            blackName: null
        };
        socket.join(roomCode);
        socket.emit('roomCreated', roomCode);
        console.log(`Room created: ${roomCode} by ${socket.id} (${playerName})`);
    });

    // Join Room
    socket.on('joinRoom', (data) => {
        // data = { code, name }
        const roomCode = String(data.code).trim();
        const room = rooms[roomCode];

        if (!room) {
            socket.emit('error', 'Room not found. Please check the code.');
            return;
        }

        if (room.players.length >= 2) {
            socket.emit('error', 'Room is full. Two players already reached.');
            return;
        }

        room.players.push(socket.id);
        room.black = socket.id;
        room.blackName = data.name;
        socket.join(roomCode);

        // Initialize Timers (15 minutes = 900,000 ms)
        room.whiteTime = 900000;
        room.blackTime = 900000;
        room.lastMoveTime = Date.now(); // Start clock for White

        // Notify both players
        io.to(roomCode).emit('gameStart', {
            white: room.white,
            whiteName: room.whiteName,
            black: room.black,
            blackName: room.blackName,
            whiteTime: room.whiteTime,
            blackTime: room.blackTime
        });
        console.log(`User ${socket.id} joined room ${roomCode}`);
    });

    // Move
    socket.on('move', (data) => {
        // data = { roomCode, move: {from, to}, fen, turn }
        const room = rooms[data.roomCode];
        if (!room) return;

        // Calculate time usage
        const now = Date.now();
        const elapsed = now - room.lastMoveTime;
        room.lastMoveTime = now;

        // Note: 'turn' in data is the color that JUST moved.
        // If White moved, it was White's turn, so deduct from White.
        if (data.turn === 'w') {
            room.whiteTime -= elapsed;
        } else {
            room.blackTime -= elapsed;
        }

        // Check for Timeout
        if (room.whiteTime <= 0) {
            io.to(data.roomCode).emit('gameOver', { reason: 'timeout', winner: 'b' });
            return;
        }
        if (room.blackTime <= 0) {
            io.to(data.roomCode).emit('gameOver', { reason: 'timeout', winner: 'w' });
            return;
        }

        // Broadcast to others in room with updated times
        socket.to(data.roomCode).emit('move', {
            move: data.move,
            whiteTime: room.whiteTime,
            blackTime: room.blackTime
        });

        // Also Ack back to sender to sync their time? 
        // useful to keep server authorative time
        socket.emit('timeSync', {
            whiteTime: room.whiteTime,
            blackTime: room.blackTime
        });
    });

    // --- New Game Features ---

    // Draw Offer
    socket.on('offerDraw', (roomCode) => {
        socket.to(roomCode).emit('drawOffer');
    });

    // Draw Response
    socket.on('drawResponse', (data) => {
        // data = { roomCode, accepted: boolean }
        if (data.accepted) {
            io.to(data.roomCode).emit('gameOver', { reason: 'draw', details: 'Agreed Draw' });
        } else {
            socket.to(data.roomCode).emit('drawRejected');
        }
    });

    // Resign
    socket.on('resign', (roomCode) => {
        // The one who requests resign loses. The OTHER wins.
        // We can just tell clients "Resignation" and let them figure out who resigned based on socket.id if needed, 
        // OR just broadcast who resigned.
        socket.to(roomCode).emit('gameOver', { reason: 'resignation', winner: 'opponent' }); // Sender lost
        socket.emit('gameOver', { reason: 'resignation', winner: 'you_lost' }); // Sender lost
    });

    // Rematch Logic
    // We need to track who requested rematch
    socket.on('requestRematch', (roomCode) => {
        const room = rooms[roomCode];
        if (!room) return;

        if (!room.rematchRequests) {
            room.rematchRequests = new Set();
        }
        room.rematchRequests.add(socket.id);

        if (room.rematchRequests.size >= 2) {
            // Both accepted
            room.rematchRequests.clear();

            // Swap colors for variety? Or keep same. Let's keep same for simplicity first, or swap.
            // Let's Swap!
            const temp = room.white;
            room.white = room.black;
            room.black = temp;

            const tempName = room.whiteName;
            room.whiteName = room.blackName;
            room.blackName = tempName;

            io.to(roomCode).emit('gameStart', {
                white: room.white,
                whiteName: room.whiteName,
                black: room.black,
                blackName: room.blackName
            });
        } else {
            // Notify opponent
            socket.to(roomCode).emit('rematchRequested');
        }
    });



    socket.on('disconnect', () => {
        console.log('user disconnected', socket.id);

        // Find room and notify opponent
        for (const code in rooms) {
            const room = rooms[code];
            if (room.players.includes(socket.id)) {
                // Determine who left
                const opponentId = room.players.find(id => id !== socket.id);
                if (opponentId) {
                    io.to(opponentId).emit('opponentDisconnected');
                }

                // Clean up room immediately or wait?
                // For now, delete it to prevent re-joining ghost room
                delete rooms[code];
                console.log(`Room ${code} closed due to disconnect.`);
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`listening on *:${PORT}`);
});
