
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

        // Notify both players
        io.to(roomCode).emit('gameStart', {
            white: room.white,
            whiteName: room.whiteName,
            black: room.black,
            blackName: room.blackName
        });
        console.log(`User ${socket.id} joined room ${roomCode}`);
    });

    // Move
    socket.on('move', (data) => {
        // data = { roomCode, move: {from, to}, fen }
        // Broadcast to others in room
        socket.to(data.roomCode).emit('move', data.move);
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

    // WebRTC Signaling
    socket.on('signal', (data) => {
        // data = { roomCode, signalData }
        socket.to(data.roomCode).emit('signal', data.signalData);
    });

    socket.on('disconnect', () => {
        console.log('user disconnected', socket.id);
        // Handle cleanup if needed, or notify opponent
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`listening on *:${PORT}`);
});
