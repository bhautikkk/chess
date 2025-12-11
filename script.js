
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

// --- Modal & Toast Helpers ---
const modalContainer = document.getElementById('modal-container');
const toastContainer = document.getElementById('toast-container');

function showToast(msg, duration = 2000) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = msg;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.remove();
    }, duration);
}

function showModal(html) {
    modalContainer.innerHTML = html;
}

function closeModal() {
    modalContainer.innerHTML = '';
}

// --- Multiplayer Controls ---
const drawBtn = document.getElementById('draw-btn');
const resignBtn = document.getElementById('resign-btn');

drawBtn.addEventListener('click', () => {
    socket.emit('offerDraw', currentRoomCode);
    showToast("Draw offer sent...", 2000);
});

resignBtn.addEventListener('click', () => {
    if (confirm("Are you sure you want to resign?")) {
        socket.emit('resign', currentRoomCode);
    }
});

function showGameOverModal(title, message, isRematch = false) {
    const html = `
        <div class="modal-overlay">
            <div class="modal-content">
                <h2>${title}</h2>
                <p>${message}</p>
                <div class="modal-actions">
                    <button id="rematch-btn">${isRematch ? "Accept Rematch" : "Rematch"}</button>
                    <button id="main-menu-btn" class="btn-secondary" style="background:transparent; border:1px solid #777;">Main Menu</button>
                </div>
            </div>
        </div>
    `;
    showModal(html);

    document.getElementById('rematch-btn').addEventListener('click', (e) => {
        socket.emit('requestRematch', currentRoomCode);
        e.target.innerText = "Waiting for Opponent...";
        e.target.disabled = true;
    });

    document.getElementById('main-menu-btn').addEventListener('click', () => {
        location.reload();
    });
}

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

    // UI Reset
    game.reset();
    updateGameInfoHeader(false);
    resetBtn.style.display = 'none';

    // Show Multiplayer Buttons
    drawBtn.style.display = 'inline-block';
    resignBtn.style.display = 'inline-block';

    closeModal(); // Clear any game over modals
    showScreen(gameScreen);
    renderBoardSimple();
    showToast("Game Started!");
});

socket.on('move', (move) => {
    game.makeMoveInternal(move);
    playMoveSound();
    renderBoardSimple();
    checkGameOver();
});

// New Events
socket.on('drawOffer', () => {
    const html = `
        <div class="modal-overlay">
            <div class="modal-content">
                <h2>Draw Offer</h2>
                <p>${navElements.opponentName} offered a draw.</p>
                <div class="modal-actions">
                    <button id="accept-draw">Accept</button>
                    <button id="reject-draw" class="btn-secondary" style="background:transparent; border:1px solid #777;">Reject</button>
                </div>
            </div>
        </div>
    `;
    showModal(html);

    document.getElementById('accept-draw').addEventListener('click', () => {
        socket.emit('drawResponse', { roomCode: currentRoomCode, accepted: true });
        closeModal();
    });

    document.getElementById('reject-draw').addEventListener('click', () => {
        socket.emit('drawResponse', { roomCode: currentRoomCode, accepted: false });
        closeModal();
    });
});

socket.on('drawRejected', () => {
    showToast("Opponent rejected your draw offer.", 2000);
});

socket.on('gameOver', (data) => {
    // data = { reason: 'draw' | 'resignation', details, winner }
    let title = "Game Over";
    let msg = "";

    if (data.reason === 'draw') {
        title = "Draw";
        msg = data.details || "Game ended in a draw.";
    } else if (data.reason === 'resignation') {
        const winner = data.winner === 'opponent' ? "You Won!" : "You Lost";
        msg = `${winner} (by resignation)`;
    }

    showGameOverModal(title, msg);
});

socket.on('rematchRequested', () => {
    const btn = document.getElementById('rematch-btn');
    if (btn) {
        if (btn.innerText !== "Waiting for Opponent...") {
            btn.innerText = "Opponent wants to play again!";
            btn.parentElement.parentElement.querySelector('p').innerText = "Opponent requested a rematch.";
        }
    } else {
        // In case modal was closed or not visible (shouldn't happen in flow but safe to handle)
        showGameOverModal("Rematch?", "Opponent wants to play again.", true);
    }
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
        // Replaced alert with Custom Modal
        showGameOverModal("Checkmate!", `${winnerName} wins!`);
    } else if (game.in_draw && game.in_draw()) { // Checking generic 50-move or stalemate if supported by logic
        showGameOverModal("Draw", "Game ended in a draw (Stalemate/Repetition).");
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
