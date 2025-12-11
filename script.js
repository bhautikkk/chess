
const game = new ChessGame();
const socket = io(); // Connect to server

// UI Elements
const boardElement = document.getElementById('board');
const statusElement = document.getElementById('status');
const resetBtn = document.getElementById('reset-btn');
const flipBtn = document.getElementById('flip-btn');
const roomInfoElement = document.getElementById('room-info');
const playerTopElement = document.getElementById('player-top');
const playerBottomElement = document.getElementById('player-bottom');
const menuErrorElement = document.getElementById('menu-error');

// Screens
const menuScreen = document.getElementById('menu-screen');
const gameScreen = document.getElementById('game-screen');
const waitingScreen = document.getElementById('waiting-screen');

// Logic State
let selectedSquare = null;
let validMoves = [];
let isFlipped = false;
let gameMode = 'local'; // 'local', 'multiplayer'
let playerColor = 'w'; // 'w' or 'b' (for multiplayer)
let currentRoomCode = null;
let navElements = {
    myName: "Me",
    opponentName: "Opponent",
    whiteName: "White",
    blackName: "Black"
};

// Screen Handling
function showScreen(screen) {
    [menuScreen, gameScreen, waitingScreen].forEach(s => {
        s.classList.add('hidden');
        s.classList.remove('active');
    });
    screen.classList.remove('hidden');
    screen.classList.add('active');

    // Clear error when switching screens
    if (menuErrorElement) menuErrorElement.innerText = '';
}

function showError(msg) {
    if (menuErrorElement) {
        menuErrorElement.innerText = msg;
        // Optionally auto-clear after a few seconds
        setTimeout(() => {
            menuErrorElement.innerText = '';
        }, 3000);
    } else {
        alert(msg); // Fallback
    }
}

// --- Menu Events ---

// Play Local
document.getElementById('play-local-btn').addEventListener('click', () => {
    const name = document.getElementById('name-input').value.trim() || "Player 1";
    gameMode = 'local';
    playerColor = 'w';
    game.reset();
    isFlipped = false;
    currentRoomCode = null;

    // Set Local Names
    navElements.whiteName = name;
    navElements.blackName = "Player 2";

    updateGameInfoHeader(true);
    showScreen(gameScreen);
    renderBoardSimple();
    resetBtn.style.display = 'inline-block';
});

// Create Room
document.getElementById('create-room-btn').addEventListener('click', () => {
    const name = document.getElementById('name-input').value.trim();
    if (!name) {
        showError("Please enter your name first!");
        return;
    }
    socket.emit('createRoom', name);
});

// Join Room
document.getElementById('join-room-btn').addEventListener('click', () => {
    const name = document.getElementById('name-input').value.trim();
    if (!name) {
        showError("Please enter your name first!");
        return;
    }
    const code = document.getElementById('room-code-input').value;
    if (code && code.length === 6) {
        socket.emit('joinRoom', { code: code, name: name });
    } else {
        showError("Please enter a valid 6-digit code.");
    }
});

// Back Buttons
document.getElementById('back-menu-btn').addEventListener('click', () => {
    if (gameMode === 'multiplayer') {
        location.reload();
    } else {
        showScreen(menuScreen);
    }
});
document.getElementById('cancel-wait-btn').addEventListener('click', () => {
    location.reload();
});

// Copy Code Button
document.getElementById('copy-code-btn').addEventListener('click', () => {
    const code = document.getElementById('display-room-code').innerText;
    if (code) {
        navigator.clipboard.writeText(code).then(() => {
            const btn = document.getElementById('copy-code-btn');
            const originalText = btn.innerText;
            btn.innerText = "Copied!";
            setTimeout(() => btn.innerText = originalText, 2000);
        }).catch(err => {
            console.error('Failed to copy: ', err);
            showError("Failed to copy code.");
        });
    }
});

// --- Audio ---
const moveSound = new Audio('move.mp3');

function playMoveSound() {
    moveSound.currentTime = 0;
    moveSound.play().catch(e => console.log("Audio play failed: ", e));
}

// --- Socket Events ---

socket.on('roomCreated', (roomCode) => {
    currentRoomCode = roomCode;
    gameMode = 'multiplayer';
    playerColor = 'w';
    document.getElementById('display-room-code').innerText = roomCode;
    showScreen(waitingScreen);
});

socket.on('gameStart', (data) => {
    // data = { white: socketId, whiteName, black: socketId, blackName }
    gameMode = 'multiplayer';
    currentRoomCode = currentRoomCode || document.getElementById('room-code-input').value;

    // Store Names
    navElements.whiteName = data.whiteName || "White";
    navElements.blackName = data.blackName || "Black";

    if (socket.id === data.black) {
        playerColor = 'b';
        isFlipped = true;
    } else {
        playerColor = 'w';
        isFlipped = false;
    }

    game.reset();
    updateGameInfoHeader(false);
    resetBtn.style.display = 'none';
    showScreen(gameScreen);
    renderBoardSimple();
});

socket.on('move', (move) => {
    game.makeMoveInternal(move);
    playMoveSound(); // Play sound on opponent move
    renderBoardSimple();
    checkGameOver();
});

socket.on('error', (msg) => {
    showError(msg);
});


// --- Game Logic Interface ---

function updateGameInfoHeader(isLocal) {
    if (isLocal) {
        roomInfoElement.innerText = "Room: Local";
        playerBottomElement.innerText = navElements.whiteName + " (White)";
        playerTopElement.innerText = navElements.blackName + " (Black)";
    } else {
        roomInfoElement.innerText = `Room: ${currentRoomCode}`;
        if (playerColor === 'w') {
            playerBottomElement.innerText = navElements.whiteName; // Me
            playerTopElement.innerText = navElements.blackName; // Opponent
        } else {
            playerBottomElement.innerText = navElements.blackName; // Me
            playerTopElement.innerText = navElements.whiteName; // Opponent
        }
    }
    updateStatus();
}

function renderBoardSimple() {
    boardElement.innerHTML = '';

    for (let i = 0; i < 64; i++) {
        const row = Math.floor(i / 8);
        const col = i % 8;

        const square = document.createElement('div');
        square.classList.add('square');
        square.classList.add((row + col) % 2 === 0 ? 'light' : 'dark');
        square.dataset.index = i;

        if (selectedSquare === i) {
            square.classList.add('selected');
        }

        const move = validMoves.find(m => m.to === i);
        if (move) {
            if (game.board[i]) {
                square.classList.add('highlight-capture');
            } else {
                square.classList.add('highlight');
            }
        }

        const piece = game.getPiece(i);
        if (piece) {
            const pieceElement = document.createElement('div');
            pieceElement.classList.add('piece');
            const key = `${piece.color}-${piece.type}`;
            pieceElement.style.backgroundImage = `url('${PIECE_IMAGES[key]}')`;
            if (isFlipped) {
                pieceElement.style.transform = 'rotate(180deg)';
            }
            square.appendChild(pieceElement);
        }

        square.addEventListener('click', () => onSquareClick(i));
        boardElement.appendChild(square);
    }

    if (isFlipped) {
        boardElement.style.transform = 'rotate(180deg)';
    } else {
        boardElement.style.transform = 'none';
    }
    updateStatus();
}


function onSquareClick(index) {
    if (gameMode === 'multiplayer' && game.turn !== playerColor) {
        return;
    }

    const piece = game.getPiece(index);
    const isPlayersTurnPiece = piece && piece.color === game.turn;

    if (gameMode === 'multiplayer' && isPlayersTurnPiece && piece.color !== playerColor) {
        return;
    }

    const move = validMoves.find(m => m.to === index);

    if (move) {
        game.makeMove(move);
        // playMoveSound(); // Removed as per user request (only hear opponent)

        if (gameMode === 'multiplayer') {
            socket.emit('move', {
                roomCode: currentRoomCode,
                move: move
            });
        }

        selectedSquare = null;
        validMoves = [];
        renderBoardSimple();
        checkGameOver();
        return;
    }

    if (isPlayersTurnPiece) {
        if (selectedSquare === index) {
            selectedSquare = null;
            validMoves = [];
        } else {
            selectedSquare = index;
            validMoves = game.getValidMoves(index);
        }
        renderBoardSimple();
    } else {
        selectedSquare = null;
        validMoves = [];
        renderBoardSimple();
    }
}

function checkGameOver() {
    if (game.isCheckmate()) {
        const winnerColor = game.turn === 'w' ? 'Black' : 'White';
        const winnerName = winnerColor === 'White' ? navElements.whiteName : navElements.blackName;
        setTimeout(() => alert(`Checkmate! ${winnerName} wins!`), 100);
    }
}

function updateStatus() {
    const activeColor = game.turn === 'w' ? 'White' : 'Black';
    const activeName = activeColor === 'White' ? navElements.whiteName : navElements.blackName;

    let status = `${activeName}'s Turn`;
    if (game.isKingInCheck(game.turn)) {
        status += " (Check!)";
    }
    statusElement.innerText = status;
}

resetBtn.addEventListener('click', () => {
    game.reset();
    selectedSquare = null;
    validMoves = [];
    isFlipped = false;
    currentRoomCode = null;
    renderBoardSimple();
});

flipBtn.addEventListener('click', () => {
    isFlipped = !isFlipped;
    renderBoardSimple();
});

// Initial Render
renderBoardSimple();
