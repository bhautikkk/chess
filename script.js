
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

// Timer State
let whiteTime = 900; // seconds
let blackTime = 900;
let timerInterval = null;
let lastUpdate = Date.now();

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
let currentHistoryIndex = -1; // -1 means live game

// Screen Handling
function showScreen(screen) {
    [menuScreen, gameScreen, waitingScreen].forEach(s => {
        if (s) {
            s.classList.add('hidden');
            s.classList.remove('active');
        }
    });
    if (screen) {
        screen.classList.remove('hidden');
        screen.classList.add('active');
    }

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

// --- Timer Functions ---
function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    lastUpdate = Date.now();
    timerInterval = setInterval(() => {
        const now = Date.now();
        const delta = (now - lastUpdate) / 1000;
        lastUpdate = now;

        if (game.turn === 'w') {
            whiteTime -= delta;
        } else {
            blackTime -= delta;
        }

        updateTimerUI();

        if (whiteTime <= 0 || blackTime <= 0) {
            clearInterval(timerInterval);
        }
    }, 100); // Update every 100ms for smoothness
}

function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
}

function updateTimerUI() {
    const format = (t) => {
        if (typeof t !== 'number' || isNaN(t)) return "15:00"; // Fallback
        const totalSeconds = Math.max(0, Math.floor(t));
        const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
        const s = (totalSeconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    let bottomTimeStr = "";
    let topTimeStr = "";

    // Mapping: If I am White, Bottom=White, Top=Black.
    // If I am Black, Bottom=Black, Top=White.
    if (playerColor === 'w') {
        bottomTimeStr = format(whiteTime);
        topTimeStr = format(blackTime);
    } else {
        bottomTimeStr = format(blackTime);
        topTimeStr = format(whiteTime);
    }

    const bottomTimer = document.getElementById('timer-bottom');
    const topTimer = document.getElementById('timer-top');

    if (bottomTimer) {
        bottomTimer.innerText = bottomTimeStr;
        // Highlight active timer
        const isMyTurn = (playerColor === 'w' && game.turn === 'w') || (playerColor === 'b' && game.turn === 'b');

        if (isMyTurn) {
            bottomTimer.classList.add('active-timer');
        } else {
            bottomTimer.classList.remove('active-timer');
        }
    }

    if (topTimer) {
        topTimer.innerText = topTimeStr;
        const isOpponentTurn = (playerColor === 'w' && game.turn === 'b') || (playerColor === 'b' && game.turn === 'w');

        if (isOpponentTurn) {
            topTimer.classList.add('active-timer');
        } else {
            topTimer.classList.remove('active-timer');
        }
    }
}

// --- Promotion Handling ---
let pendingPromotionMove = null;
const promotionModal = document.getElementById('promotion-modal');

document.querySelectorAll('.promo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        if (pendingPromotionMove) {
            completeMove(pendingPromotionMove, type);
            pendingPromotionMove = null;
            promotionModal.classList.add('hidden');
        }
    });
});

// --- Menu Events ---

// Play Local
document.getElementById('play-local-btn').addEventListener('click', () => {
    const name = document.getElementById('name-input').value.trim() || "Player 1";
    gameMode = 'local';
    playerColor = 'w';
    playerColor = 'w';
    game.reset();
    currentHistoryIndex = -1; // Reset history view
    isFlipped = false;
    currentRoomCode = null;

    // Set Local Names
    navElements.whiteName = name;
    navElements.blackName = "Player 2";

    updateGameInfoHeader(true);
    showScreen(gameScreen);
    renderBoardSimple();

    // Start Local Timer
    whiteTime = 900;
    blackTime = 900;
    startTimer();
    updateTimerUI();

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
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = msg;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.remove();
    }, duration);
}

function showModal(html) {
    if (modalContainer) modalContainer.innerHTML = html;
}

function closeModal() {
    if (modalContainer) modalContainer.innerHTML = '';
}

// --- Multiplayer Controls ---
const drawBtn = document.getElementById('draw-btn');
const resignBtn = document.getElementById('resign-btn');

if (drawBtn) {
    drawBtn.addEventListener('click', () => {
        socket.emit('offerDraw', currentRoomCode);
        showToast("Draw offer sent...", 2000);
    });
}

if (resignBtn) {
    resignBtn.addEventListener('click', () => {
        if (confirm("Are you sure you want to resign?")) {
            socket.emit('resign', currentRoomCode);
        }
    });
}

function showGameOverModal(title, message, isRematch = false) {
    const html = `
        <div class="modal-overlay">
            <div class="modal-content">
                <button id="close-modal-btn" class="close-btn">&times;</button>
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

    const closeBtn = document.getElementById('close-modal-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            closeModal();
        });
    }

    const rematchBtn = document.getElementById('rematch-btn');
    if (rematchBtn) {
        rematchBtn.addEventListener('click', (e) => {
            socket.emit('requestRematch', currentRoomCode);
            e.target.innerText = "Waiting for Opponent...";
            e.target.disabled = true;
        });
    }

    const mainMenuBtn = document.getElementById('main-menu-btn');
    if (mainMenuBtn) {
        mainMenuBtn.addEventListener('click', () => {
            location.reload();
        });
    }
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
    try {
        console.log("Game Start Data:", data);
        gameMode = 'multiplayer';
        currentRoomCode = currentRoomCode || (document.getElementById('room-code-input') ? document.getElementById('room-code-input').value : null);

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
        currentHistoryIndex = -1;

        // Timer Reset
        if (data.whiteTime !== undefined) whiteTime = data.whiteTime / 1000;
        else whiteTime = 900;

        if (data.blackTime !== undefined) blackTime = data.blackTime / 1000;
        else blackTime = 900;

        updateTimerUI(); // Ensure initial state is rendered correctly
        startTimer();

        updateGameInfoHeader(false);
        if (resetBtn) resetBtn.style.display = 'none';

        // Show Multiplayer Buttons
        if (drawBtn) drawBtn.style.display = 'inline-block';
        if (resignBtn) resignBtn.style.display = 'inline-block';
        if (chatToggleBtn) chatToggleBtn.style.display = 'inline-block';

        closeModal(); // Clear any game over modals
        showScreen(gameScreen);
        renderBoardSimple();
        showToast("Game Started!");

    } catch (err) {
        console.error("Game Start Error:", err);
        showError("Error starting game: " + err.message);
    }
});

socket.on('move', (data) => {
    // data = { move, whiteTime, blackTime }
    // If simple move object (local/legacy), handle gracefully
    let moveData = data.move || data;

    game.makeMoveInternal(moveData);

    // Auto-jump to live if viewing history (User request: "board par saare pices update ho jaye")
    if (currentHistoryIndex !== -1) {
        currentHistoryIndex = -1;
        showToast("New Move! Jumped to live.");
    }

    playMoveSound();
    renderBoardSimple();

    // Sync Time
    if (data.whiteTime !== undefined) whiteTime = data.whiteTime / 1000;
    if (data.blackTime !== undefined) blackTime = data.blackTime / 1000;
    updateTimerUI();

    checkGameOver();
});

socket.on('timeSync', (data) => {
    if (data.whiteTime !== undefined) whiteTime = data.whiteTime / 1000;
    if (data.blackTime !== undefined) blackTime = data.blackTime / 1000;
    updateTimerUI();
});

socket.on('opponentDisconnected', () => {
    stopTimer();
    showToast("Opponent Disconnected. Returning to menu...", 3000);
    setTimeout(() => {
        location.reload();
    }, 3000);
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

    const acceptBtn = document.getElementById('accept-draw');
    if (acceptBtn) {
        acceptBtn.addEventListener('click', () => {
            socket.emit('drawResponse', { roomCode: currentRoomCode, accepted: true });
            closeModal();
        });
    }

    const rejectBtn = document.getElementById('reject-draw');
    if (rejectBtn) {
        rejectBtn.addEventListener('click', () => {
            socket.emit('drawResponse', { roomCode: currentRoomCode, accepted: false });
            closeModal();
        });
    }
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


// --- Chat Logic ---
const chatToggleBtn = document.getElementById('chat-toggle-btn');
const chatContainer = document.getElementById('chat-container');
const closeChatBtn = document.getElementById('close-chat-btn');
const chatInput = document.getElementById('chat-input');
const sendMsgBtn = document.getElementById('send-msg-btn');
const chatMessages = document.getElementById('chat-messages');
const chatNotification = document.getElementById('chat-notification');

let isChatOpen = false;
let unreadMessages = 0;

if (chatToggleBtn) {
    chatToggleBtn.addEventListener('click', () => {
        toggleChat(true);
    });
}

if (closeChatBtn) {
    closeChatBtn.addEventListener('click', () => {
        toggleChat(false);
    });
}

function toggleChat(show) {
    if (show) {
        chatContainer.classList.remove('hidden');
        chatToggleBtn.classList.add('active'); // Optional styling
        isChatOpen = true;
        unreadMessages = 0;
        updateChatNotification();
        scrollToBottom();
    } else {
        chatContainer.classList.add('hidden');
        chatToggleBtn.classList.remove('active');
        isChatOpen = false;
    }
}

function updateChatNotification() {
    if (unreadMessages > 0) {
        chatNotification.classList.remove('hidden');
    } else {
        chatNotification.classList.add('hidden');
    }
}

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addMessageToChat(msg, sender, isMyMessage) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message');
    msgDiv.classList.add(isMyMessage ? 'my-message' : 'opponent-message');

    if (!isMyMessage) {
        const senderDiv = document.createElement('div');
        senderDiv.classList.add('message-sender');
        senderDiv.innerText = sender;
        msgDiv.appendChild(senderDiv);
    }

    const textDiv = document.createElement('div');
    textDiv.innerText = msg;
    msgDiv.appendChild(textDiv);

    chatMessages.appendChild(msgDiv);
    scrollToBottom();
}

function sendMessage() {
    const text = chatInput.value.trim();
    if (text && currentRoomCode) {
        const myName = playerColor === 'w' ? navElements.whiteName : navElements.blackName;
        // Emit
        socket.emit('sendMessage', {
            roomCode: currentRoomCode,
            message: text,
            senderName: myName
        });
        // Add locally
        addMessageToChat(text, "Me", true);
        chatInput.value = '';
    }
}

if (sendMsgBtn) {
    sendMsgBtn.addEventListener('click', sendMessage);
}

if (chatInput) {
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
}

socket.on('receiveMessage', (data) => {
    addMessageToChat(data.message, data.senderName, false);
    if (!isChatOpen) {
        unreadMessages++;
        updateChatNotification();
        // Optional sound?
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

function renderBoardSimple(customState = null) {
    const boardToRender = customState ? customState.board : game.board;
    boardElement.innerHTML = '';

    // History Mode Indicator
    if (currentHistoryIndex !== -1) {
        boardElement.style.border = "3px solid #ffd700"; // Gold border for history
    } else {
        boardElement.style.border = "none";
    }

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

        const piece = boardToRender[i];
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

function completeMove(move, promotionType = null) {
    if (promotionType) {
        move.promotion = promotionType;
    }

    game.makeMove(move);
    currentHistoryIndex = -1; // Ensure we are looking at live
    playMoveSound();

    if (gameMode === 'multiplayer') {
        socket.emit('move', {
            roomCode: currentRoomCode,
            move: move,
            turn: game.turn === 'w' ? 'b' : 'w' // We emit the move AFTER making it, so game.turn has flipped. 
            // Wait. We need to say who made this move. 
            // If game.turn is now Black, it means White made the move.
            // So turn: game.turn === 'w' ? 'b' : 'w'. Correct.
        });
    }

    selectedSquare = null;
    validMoves = [];
    renderBoardSimple();
    checkGameOver();
}


function onSquareClick(index) {
    // Disable interaction if viewing history
    if (currentHistoryIndex !== -1) {
        showToast("Jump to live to make a move.");
        // Optional: Jump to live?
        // currentHistoryIndex = -1; 
        // renderBoardSimple();
        return;
    }

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
        // Check for promotion
        const piece = game.getPiece(selectedSquare);
        // If pawn and reaching last rank
        if (piece.type === 'p' && (Math.floor(move.to / 8) === 0 || Math.floor(move.to / 8) === 7)) {
            pendingPromotionMove = move;
            promotionModal.classList.remove('hidden');
            return;
        }

        completeMove(move);
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

// function checkGameOver() {
//     // Note: Timeouts are handled by server event, but we can double check locally? 
//     // Server has authority.
//     if (game.isCheckmate()) {
//         stopTimer();
//         const winnerColor = game.turn === 'w' ? 'Black' : 'White';
//         const loserColor = game.turn === 'w' ? 'w' : 'b';
//         const winnerName = winnerColor === 'White' ? navElements.whiteName : navElements.blackName;

//         triggerDustEffect(loserColor);

//         // Show temporary result
//         const myColor = gameMode === 'local' ? (game.turn === 'w' ? 'b' : 'w') : playerColor; 
//         // Local mode weirdness: turn is loser's turn. so winner is opposite.
//         // Actually simpler:
//         // If I am white, and winner is White -> Win.
//         // If I am white, and winner is Black -> Lose.

//         let resultText = "";
//         if (gameMode === 'local') {
//             resultText = `${winnerName} Wins!`;
//         } else {
//             if ((playerColor === 'w' && winnerColor === 'White') || (playerColor === 'b' && winnerColor === 'Black')) {
//                 resultText = "You Won!";
//             } else {
//                 resultText = "You Lost!";
//             }
//         }

//         showResultPopup(resultText);

//     } else if (game.in_draw && game.in_draw()) { // Checking generic 50-move or stalemate if supported by logic
//         stopTimer();
//         showGameOverModal("Draw", "Game ended in a draw (Stalemate/Repetition).");
//     }
// }

function triggerDustEffect(losingColor) {
    const squares = document.querySelectorAll('.square');
    squares.forEach(sq => {
        const piece = sq.querySelector('.piece');
        if (piece) {
            // Check piece color from background image or game state lookup
            // Better: lookup game state using index
            const index = parseInt(sq.dataset.index);
            const p = game.board[index];
            if (p && p.color === losingColor && p.type !== 'k') {
                piece.classList.add('dust-piece');
                // Randomize trajectory
                const tx = (Math.random() - 0.5) * 200 + 'px';
                const ty = (Math.random() - 0.5) * 200 + 'px';
                const rot = (Math.random() - 0.5) * 360 + 'deg';
                piece.style.setProperty('--tx', tx);
                piece.style.setProperty('--ty', ty);
                piece.style.setProperty('--rot', rot);

                // Remove from DOM after animation
                setTimeout(() => {
                    piece.remove();
                }, 1500);
            }
        }
    });
}

function showResultPopup(text) {
    const popup = document.createElement('div');
    popup.className = 'result-popup';
    popup.innerText = text;
    document.body.appendChild(popup);

    setTimeout(() => {
        popup.remove();
    }, 2500);
}

function checkGameOver() {
    if (game.isCheckmate()) {
        stopTimer();
        const winnerColor = game.turn === 'w' ? 'Black' : 'White';
        const loserColor = game.turn === 'w' ? 'w' : 'b';
        const winnerName = winnerColor === 'White' ? navElements.whiteName : navElements.blackName;

        triggerDustEffect(loserColor);

        let resultText = "";
        if (gameMode === 'local') {
            resultText = `${winnerName} Wins!`;
        } else {
            // Multiplayer
            const iAmWinner = (playerColor === 'w' && winnerColor === 'White') || (playerColor === 'b' && winnerColor === 'Black');
            resultText = iAmWinner ? "You Won!" : "You Lost!";
        }

        showResultPopup(resultText);

    } else if (game.in_draw && game.in_draw()) {
        stopTimer();
        showGameOverModal("Draw", "Game ended in a draw.");
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

    // Local Timer reset? 
    whiteTime = 900;
    blackTime = 900;
    stopTimer(); // No timer in local for now? Or yes? 
    // Let's add timer for Local too for fun, but maybe optional. 
    // For now, let's just render.
    startTimer();
    updateTimerUI();

    renderBoardSimple();
});

flipBtn.addEventListener('click', () => {
    isFlipped = !isFlipped;
    renderBoardSimple();
});

renderBoardSimple();

// History Navigation
document.getElementById('prev-move-btn').addEventListener('click', () => {
    if (game.history.length === 0) return;

    if (currentHistoryIndex === -1) {
        currentHistoryIndex = game.history.length - 1; // Start at latest
    }

    if (currentHistoryIndex > 0) {
        currentHistoryIndex--;
        const state = game.history[currentHistoryIndex];
        renderBoardSimple(state);
    }
});

document.getElementById('next-move-btn').addEventListener('click', () => {
    if (currentHistoryIndex === -1) return; // Already live

    if (currentHistoryIndex < game.history.length - 1) {
        currentHistoryIndex++;
        const state = game.history[currentHistoryIndex];
        renderBoardSimple(state);
    } else {
        currentHistoryIndex = -1; // Go back to live
        renderBoardSimple();
    }
});
renderBoardSimple();
