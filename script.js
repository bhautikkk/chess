
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
// Screens
const menuScreen = document.getElementById('menu-screen');
const gameScreen = document.getElementById('game-screen');

// Menu Sections
const menuPrimary = document.getElementById('menu-primary');
const menuJoin = document.getElementById('menu-join');
const menuWaiting = document.getElementById('menu-waiting');

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
let lastMove = null; // Track last move for highlighting {from: index, to: index}
let navElements = {
    myName: "Me",
    opponentName: "Opponent",
    whiteName: "White",
    blackName: "Black"
};
let currentHistoryIndex = -1; // -1 means live game
let isGameOver = false; // Track if game has ended
let isAnimating = false; // Track if a move animation is in progress

// Screen Handling
function showScreen(screen) {
    [menuScreen, gameScreen].forEach(s => {
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

function showMenuSection(section) {
    [menuPrimary, menuJoin, menuWaiting].forEach(s => {
        if (s) s.classList.add('hidden');
    });
    if (section) section.classList.remove('hidden');
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
    isGameOver = false; // Reset game over state
    lastMove = null; // Reset last move

    // Set Local Names
    navElements.whiteName = name;
    navElements.blackName = "Player 2";

    updateGameInfoHeader(true);
    showScreen(gameScreen);
    renderBoardSimple();

    // Start Local Timer
    // User requested NO timer for local mode
    // whiteTime = 900;
    // blackTime = 900;
    // startTimer();
    // updateTimerUI();
    document.querySelectorAll('.player-timer').forEach(el => el.style.display = 'none');

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
    // UI update handled in socket.on('roomCreated')
});

// Join Options (Drill-down)
const joinOptionsBtn = document.getElementById('join-options-btn');
if (joinOptionsBtn) {
    joinOptionsBtn.addEventListener('click', () => {
        const name = document.getElementById('name-input').value.trim();
        if (!name) {
            showError("Please enter your name first!");
            return;
        }
        showMenuSection(menuJoin);
    });
}

// Join Room Confirm
document.getElementById('join-room-confirm-btn').addEventListener('click', () => {
    const name = document.getElementById('name-input').value.trim();
    const code = document.getElementById('room-code-input').value;

    // Name check again just in case (though should be entered to get here)
    if (!name) {
        showError("Please enter your name.");
        return;
    }

    if (code && code.length === 6) {
        socket.emit('joinRoom', { code: code, name: name });
    } else {
        showError("Please enter a valid 6-digit code.");
    }
});

// Back from Join
const joinBackBtn = document.getElementById('join-back-btn');
if (joinBackBtn) {
    joinBackBtn.addEventListener('click', () => {
        showMenuSection(menuPrimary);
    });
}


// Back Buttons (Game -> Menu)
document.getElementById('back-menu-btn').addEventListener('click', () => {
    if (gameMode === 'multiplayer') {
        location.reload();
    } else {
        showScreen(menuScreen);
        showMenuSection(menuPrimary);
    }
});

// Cancel Wait
document.getElementById('cancel-wait-btn').addEventListener('click', () => {
    // Resetting mostly means just going back. 
    // Socket doesn't have explicit 'cancel room', but reloading is safest to clear state on server if strictly needed,
    // but cleaner UI is just going back. 
    // Ideally we should tell server "I left".
    // For now, reload is safest for network state, BUT user wants "yhi lobby rhe".
    // If we just hide, the socket room is still active.
    // Let's reload to be safe, OR emit leave.
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

const rematchControlBtn = document.createElement('button');
rematchControlBtn.id = 'control-rematch-btn';
rematchControlBtn.innerHTML = '⚔️ Rematch';
rematchControlBtn.style.display = 'none';
rematchControlBtn.classList.add('btn-secondary'); // Style like other controls
document.querySelector('.controls').appendChild(rematchControlBtn);

rematchControlBtn.addEventListener('click', () => {
    socket.emit('requestRematch', currentRoomCode);
    rematchControlBtn.innerText = "Waiting...";
    rematchControlBtn.disabled = true;
});


function showGameOverModal(title, message, isRematch = false) {
    if (isRematch) {
        // If it's a rematch request, we still need a modal or toast to accept it.
        // User asked for "Checkmate logic" to be temporary. Rematch request is different.
        // Let's keep Rematch Request as a modal or persistent notification because user needs to ACT.
        // But for "CHECKMATE" result, we use the temporary popup.

        const html = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <h2>${title}</h2>
                    <p>${message}</p>
                    <div class="modal-actions">
                         <button id="rematch-btn">Accept Rematch</button>
                    </div>
                </div>
            </div>
        `;
        showModal(html);
        const rematchBtn = document.getElementById('rematch-btn');
        if (rematchBtn) {
            rematchBtn.addEventListener('click', () => {
                socket.emit('requestRematch', currentRoomCode);
                closeModal();
            });
        }
        return;
    }

    // Temporary Popup for Result
    const popup = document.createElement('div');
    popup.style.position = 'fixed';
    popup.style.top = '50%';
    popup.style.left = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
    popup.style.background = 'rgba(0, 0, 0, 0.9)';
    popup.style.color = '#ffd700'; // Gold
    popup.style.padding = '30px';
    popup.style.borderRadius = '15px';
    popup.style.zIndex = '3000';
    popup.style.textAlign = 'center';
    popup.style.boxShadow = '0 0 20px rgba(255, 215, 0, 0.5)';

    popup.innerHTML = `<h1>${title}</h1><h2 style="color:white;">${message}</h2>`;

    document.body.appendChild(popup);

    // Show Rematch button in controls
    if (gameMode === 'multiplayer') {
        rematchControlBtn.style.display = 'inline-block';
        rematchControlBtn.innerHTML = '⚔️ Rematch';
        rematchControlBtn.disabled = false;
    }

    // Remove after 2 seconds
    setTimeout(() => {
        if (popup && popup.parentElement) {
            popup.remove();
        }
    }, 2000);
}

function crackKing(winnerColor) {
    // winnerColor is the color who won. Loser is the one whose turn it was (game.turn).
    // game.turn is the loser's color in checkmate context because checkmate is detected when it's your turn but you have no moves.
    const loserColor = game.turn; // 'w' or 'b'

    for (let i = 0; i < 64; i++) {
        const piece = game.board[i];
        if (piece && piece.type === 'k' && piece.color === loserColor) {
            // Find the square element
            const square = document.querySelector(`.square[data-index="${i}"]`);
            if (square) {
                // Highlight Square Background Red
                square.classList.add('result-highlight');

                // Animate King
                const pieceElem = square.querySelector('.piece');
                if (pieceElem) {
                    pieceElem.classList.add('cracked');
                    // Add POV specific animation class
                    if (isFlipped) {
                        pieceElem.classList.add('flipped');
                    } else {
                        pieceElem.classList.add('normal');
                    }
                }
            }
            break;
        }
    }
}

// --- Audio ---
// --- Audio ---
const moveSound = new Audio('move.mp3');
const checkSound = new Audio('check.mp3');
const takeSound = new Audio('take.mp3');

function playMoveSound(isCapture = false) {
    // Determine sound based on current state (called after move)
    // game.turn is the side that just received the move.
    const isCheck = game.isKingInCheck(game.turn);
    let soundToPlay = isCapture ? takeSound : moveSound;

    if (isCheck) {
        if (gameMode === 'multiplayer') {
            // If I am the one in check (It is now MY turn), play check sound.
            // If I am the one who GAVE check (It is NOT my turn), play move sound (or take sound if captured).
            // Actually, usually check implies a "warning" sound for the victim.
            // For the attacker, they might want to hear the capture.
            // Let's implement: Victim hears 'check', Attacker hears 'take' (if capture) or 'move'.

            if (playerColor === game.turn) {
                // I am the victim (it's my turn now)
                soundToPlay = checkSound;
            } else {
                // I am the attacker
                soundToPlay = isCapture ? takeSound : moveSound;
            }
        } else {
            // Local game: Always play check sound on check
            // Or maybe check sound should override capture in local?
            // Usually check sound is more important.
            soundToPlay = checkSound;
        }
    }

    soundToPlay.currentTime = 0;
    soundToPlay.play().catch(e => console.log("Audio play failed: ", e));
}


// --- Socket Events ---

socket.on('roomCreated', (roomCode) => {
    currentRoomCode = roomCode;
    gameMode = 'multiplayer';
    playerColor = 'w';
    document.getElementById('display-room-code').innerText = roomCode;
    // Switch to waiting/created section
    showMenuSection(menuWaiting);
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
        isGameOver = false; // Reset game over state
        currentHistoryIndex = -1;
        lastMove = null; // Reset last move

        // Timer Reset
        if (data.whiteTime !== undefined) whiteTime = data.whiteTime / 1000;
        else whiteTime = 900;

        if (data.blackTime !== undefined) blackTime = data.blackTime / 1000;
        else blackTime = 900;

        updateTimerUI(); // Ensure initial state is rendered correctly
        // Ensure timers are visible for multiplayer
        document.querySelectorAll('.player-timer').forEach(el => el.style.display = 'block');
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

    // Detect Capture (Remote)
    // We must check BEFORE making the move
    const piece = game.board[moveData.from];
    // Check standard capture or en passant
    const isCapture = (game.board[moveData.to] !== null) ||
        (piece && piece.type === 'p' && moveData.to === game.enPassantTarget);

    // Execute Animation then Move
    animateMove(moveData.from, moveData.to).then(() => {
        game.makeMoveInternal(moveData);

        // Update Last Move for Highlight (Remote)
        lastMove = { from: moveData.from, to: moveData.to };

        // Auto-jump to live if viewing history
        if (currentHistoryIndex !== -1) {
            currentHistoryIndex = -1;
            showToast("New Move! Jumped to live.");
        }

        playMoveSound(isCapture);
        renderBoardSimple();

        // Sync Time
        if (data.whiteTime !== undefined) whiteTime = data.whiteTime / 1000;
        if (data.blackTime !== undefined) blackTime = data.blackTime / 1000;
        updateTimerUI();

        checkGameOver();
    });
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
    isGameOver = true; // Mark game as ended
    stopTimer(); // Stop the timer immediately

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

// --- Animation Helper (Floating Clone) ---
function animateMove(fromIndex, toIndex) {
    return new Promise((resolve) => {
        isAnimating = true; // Lock interaction
        const fromSquare = document.querySelector(`.square[data-index="${fromIndex}"]`);
        const toSquare = document.querySelector(`.square[data-index="${toIndex}"]`);

        if (!fromSquare || !toSquare) {
            resolve();
            return;
        }

        const piece = fromSquare.querySelector('.piece');
        if (!piece) {
            resolve();
            return;
        }

        // Create Clone for animation
        const clone = piece.cloneNode(true);
        const fromRect = fromSquare.getBoundingClientRect();
        const toRect = toSquare.getBoundingClientRect();

        // Style clone to float above everything
        clone.style.position = 'fixed'; // Fixed to viewport to avoid overflow clipping
        clone.style.left = `${fromRect.left}px`;
        clone.style.top = `${fromRect.top}px`;
        clone.style.width = `${fromRect.width * 0.9}px`; // Match 90% size logic
        clone.style.height = `${fromRect.height * 0.9}px`;
        clone.style.zIndex = '1000';
        clone.style.pointerEvents = 'none'; // Don't block clicks
        clone.style.transform = 'none'; // Reset rotation (so it doesn't look upside down when appended to body)
        clone.style.transition = 'all 0.15s ease-out'; // Quick "quick se move"

        document.body.appendChild(clone);

        // Hide original to prevent duplicate visual
        piece.style.opacity = '0';

        // Trigger Animation (Next Frame)
        requestAnimationFrame(() => {
            clone.style.left = `${toRect.left}px`;
            clone.style.top = `${toRect.top}px`;
        });

        // Cleanup after animation
        clone.addEventListener('transitionend', () => {
            clone.remove();
            isAnimating = false; // Unlock
            resolve();
        }, { once: true });

        // Fallback
        setTimeout(() => {
            if (document.body.contains(clone)) clone.remove();
            isAnimating = false; // Unlock (safety net)
            resolve();
        }, 200);
    });
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

        // Highlight Last Move
        if (lastMove && i === lastMove.to) {
            square.classList.add('highlight-move');
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

            // HIGHLIGHT CHECK (Not Checkmate)
            // Only for live game (no customState)
            if (!customState && piece.type === 'k' && piece.color === game.turn) {
                // If this king is in check And NOT checkmate
                if (game.isKingInCheck(game.turn) && !game.isCheckmate()) {
                    square.classList.add('check-highlight');
                }
            }
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

    // Detect Capture (Local/Self)
    // Check BEFORE making the move on the board
    const piece = game.board[move.from];
    const isCapture = (game.board[move.to] !== null) ||
        (piece && piece.type === 'p' && move.to === game.enPassantTarget);

    // Animate -> Move -> Sound -> Render
    animateMove(move.from, move.to).then(() => {
        game.makeMove(move);

        // Update Last Move for Highlight (Local)
        lastMove = { from: move.from, to: move.to };

        currentHistoryIndex = -1;
        playMoveSound(isCapture);

        if (gameMode === 'multiplayer') {
            socket.emit('move', {
                roomCode: currentRoomCode,
                move: move,
                turn: game.turn === 'w' ? 'b' : 'w'
            });
        }

        selectedSquare = null;
        validMoves = [];
        renderBoardSimple();
        checkGameOver();
    });

}


function onSquareClick(index) {
    // Prevent interaction during animation
    if (isAnimating) return;

    // Disable interaction if viewing history
    if (currentHistoryIndex !== -1) {
        showToast("Jump to live to make a move.");
        // Optional: Jump to live?
        // currentHistoryIndex = -1; 
        // renderBoardSimple();
        return;
    }

    if (isGameOver) return; // Prevent moves if game is over

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

function checkGameOver() {
    // Note: Timeouts are handled by server event, but we can double check locally? 
    // Server has authority.
    if (game.isCheckmate()) {
        isGameOver = true; // Local checkmate
        stopTimer();
        const winnerColor = game.turn === 'w' ? 'Black' : 'White';
        const winnerName = winnerColor === 'White' ? navElements.whiteName : navElements.blackName;
        // Verify who is the loser to crack their king
        // Logic: if turn is 'w', it means 'w' has no moves -> 'w' is checkmated.
        // Wait, game.isCheckmate() returns true if the CURRENT side (game.turn) is in checkmate.
        // So if game.turn is 'w', White is checkmated.

        crackKing(winnerColor);

        // Replaced alert with Custom Modal
        showGameOverModal("Checkmate!", `${winnerName} wins!`);
    } else if (game.in_draw && game.in_draw()) { // Checking generic 50-move or stalemate if supported by logic
        isGameOver = true;
        stopTimer();
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
    isGameOver = false; // Reset
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
