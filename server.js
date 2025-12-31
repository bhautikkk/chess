
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

// Determine OS and select appropriate binary
const isWindows = process.platform === 'win32';
const stockfishBinary = isWindows ? 'stockfish-windows-x86-64-avx2.exe' : 'stockfish-ubuntu-x86-64-avx2';
const stockfishPath = path.join(__dirname, 'stockfish_engine', 'stockfish', stockfishBinary);

// Ensure executable permission on Linux
if (!isWindows && fs.existsSync(stockfishPath)) {
    try {
        fs.chmodSync(stockfishPath, '755');
    } catch (err) {
        console.error("Failed to set chmod for Stockfish:", err);
    }
}

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

    // Stockfish Process for this user
    let stockfishProcess = null;

    socket.on('startVsComputer', () => {
        if (stockfishProcess) {
            try { stockfishProcess.kill(); } catch (e) { }
        }

        console.log(`Starting Stockfish for ${socket.id} at ${stockfishPath}`);
        try {
            stockfishProcess = spawn(stockfishPath);

            stockfishProcess.stdin.write('uci\n');
            stockfishProcess.stdin.write('ucinewgame\n');
            stockfishProcess.stdin.write('isready\n');

            stockfishProcess.stdout.on('data', (data) => {
                const output = data.toString();
                // console.log(`SF OUT: ${output}`); // Verbose

                const lines = output.split('\n');
                for (const line of lines) {
                    if (line.startsWith('bestmove')) {
                        const parts = line.split(' ');
                        const move = parts[1];
                        if (move && move !== '(none)') {
                            socket.emit('computerMove', { bestmove: move });
                        }
                    }
                    // Analysis Output
                    // info depth 10 seldepth 15 multipv 1 score cp 35 nodes ...
                    if (line.startsWith('info') && line.includes('score')) {
                        // Extract score
                        const parts = line.split(' ');
                        const scoreIndex = parts.indexOf('score');
                        if (scoreIndex !== -1) {
                            const type = parts[scoreIndex + 1]; // cp or mate
                            const value = parts[scoreIndex + 2];
                            socket.emit('analysisResult', { type, value });
                        }
                    }
                }
            });

            stockfishProcess.stderr.on('data', (data) => {
                console.error(`SF ERR: ${data}`);
            });

        } catch (e) {
            console.error("Stockfish Spawn Error:", e);
            socket.emit('error', "Failed to start Chess Engine.");
        }
    });

    socket.on('analyze', (data) => {
        if (!stockfishProcess) return;
        const fen = data.fen;
        if (fen) {
            stockfishProcess.stdin.write(`position fen ${fen}\n`);
            stockfishProcess.stdin.write(`go depth 15\n`); // Analyze to depth 15
        }
    });

    socket.on('computerMove', (data) => {
        if (!stockfishProcess) return;
        // data.fen contains current board state
        // We instruct engine to search from this state
        const fen = data.fen;
        if (fen) {
            stockfishProcess.stdin.write(`position fen ${fen}\n`);
            stockfishProcess.stdin.write(`go movetime 800\n`); // 0.8s think time for responsiveness
        }
    });

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

        // Randomize Colors
        if (Math.random() < 0.5) {
            // Joiner gets White, Creator gets Black
            room.black = room.white; // Old White (Creator) becomes Black
            room.blackName = room.whiteName;

            room.white = socket.id; // Joiner becomes White
            room.whiteName = data.name;
        } else {
            // Creator stays White, Joiner gets Black
            room.black = socket.id;
            room.blackName = data.name;
        }

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

        // Prevent moves if game is over
        if (room.gameEnded) return;

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
            const room = rooms[data.roomCode];
            if (room) room.gameEnded = true; // Mark game as ended
            io.to(data.roomCode).emit('gameOver', { reason: 'draw', details: 'Agreed Draw' });
        } else {
            socket.to(data.roomCode).emit('drawRejected');
        }
    });

    // Resign
    socket.on('resign', (roomCode) => {
        const room = rooms[roomCode];
        if (room) room.gameEnded = true; // Mark game as ended

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
            room.gameEnded = false; // Reset game ended flag for new game

            // Randomize colors for rematch
            if (Math.random() < 0.5) {
                // Swap
                const temp = room.white;
                room.white = room.black;
                room.black = temp;

                const tempName = room.whiteName;
                room.whiteName = room.blackName;
                room.blackName = tempName;
            }
            // Else keep same (effectively random since we start from random state or just 50/50 chance to flip)

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

    // Chat Message
    socket.on('sendMessage', (data) => {
        // data = { roomCode, message, senderName }
        socket.to(data.roomCode).emit('receiveMessage', {
            message: data.message,
            senderName: data.senderName
        });
    });



    socket.on('disconnect', () => {
        console.log('user disconnected', socket.id);

        if (stockfishProcess) {
            try { stockfishProcess.kill(); } catch (e) { }
        }

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
