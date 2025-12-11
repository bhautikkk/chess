
const game = new ChessGame();
const boardElement = document.getElementById('board');
const statusElement = document.getElementById('status');
const resetBtn = document.getElementById('reset-btn');
const flipBtn = document.getElementById('flip-btn');

// Screens
const menuScreen = document.getElementById('menu-screen');
const gameScreen = document.getElementById('game-screen');
const reviewScreen = document.getElementById('review-screen');

// Menu Buttons
const playBtn = document.getElementById('play-btn');
const reviewBtn = document.getElementById('review-btn');
const backMenuBtn = document.getElementById('back-menu-btn');
const backMenuReviewBtn = document.getElementById('back-menu-review-btn');

function showScreen(screen) {
    [menuScreen, gameScreen, reviewScreen].forEach(s => {
        s.classList.add('hidden');
        s.classList.remove('active');
    });
    screen.classList.remove('hidden');
    screen.classList.add('active');
}

playBtn.addEventListener('click', () => {
    showScreen(gameScreen);
    renderBoardSimple();
});

reviewBtn.addEventListener('click', () => {
    showScreen(reviewScreen);
});

backMenuBtn.addEventListener('click', () => {
    showScreen(menuScreen);
});

// Note: backMenuReviewBtn header event added in review logic below
// But we can add a simple redirect here in case init fails
// It will be overridden later or duplicated (harmless)

let selectedSquare = null;
let validMoves = [];
let isFlipped = false;

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
    const piece = game.getPiece(index);
    const isPlayersTurnPiece = piece && piece.color === game.turn;

    // If clicking a valid move target
    const move = validMoves.find(m => m.to === index);

    if (move) {
        game.makeMove(move);
        selectedSquare = null;
        validMoves = [];
        renderBoardSimple();

        // Check for game over
        if (game.isCheckmate()) {
            setTimeout(() => alert(`Checkmate! ${game.turn === 'w' ? 'Black' : 'White'} wins!`), 100);
        }
        return;
    }

    // Select piece
    if (isPlayersTurnPiece) {
        // Toggle selection
        if (selectedSquare === index) {
            selectedSquare = null;
            validMoves = [];
        } else {
            selectedSquare = index;
            validMoves = game.getValidMoves(index);
        }
        renderBoardSimple();
    } else {
        // Deselect if clicking empty or enemy not as capture
        selectedSquare = null;
        validMoves = [];
        renderBoardSimple();
    }
}

function updateStatus() {
    let status = game.turn === 'w' ? "White's Turn" : "Black's Turn";
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
    renderBoardSimple();
});

flipBtn.addEventListener('click', () => {
    isFlipped = !isFlipped;
    renderBoardSimple();
});

// Initial Render
renderBoardSimple();

// --- Review Logic ---

let reviewChess = null;
let reviewMoves = []; // Array of move objects { from, to, fen, san }
let currentReviewMoveIndex = -1;
let stockfish = null;
let analysisData = []; // Array of { eval: number (cp), classification: string }
let isAnalyzing = false;

// UI Elements Helper
const getEls = () => ({
    setup: document.getElementById('setup-review'),
    panel: document.getElementById('analysis-panel'),
    pgnInput: document.getElementById('pgn-input'),
    status: document.getElementById('review-status'),
    prevBtn: document.getElementById('review-prev-btn'),
    nextBtn: document.getElementById('review-next-btn'),
    flipBtn: document.getElementById('review-flip-btn'),
    backBtn: document.getElementById('back-menu-review-btn'),
    board: document.getElementById('review-board'),
    evalBar: document.getElementById('eval-fill'),
    evalScore: document.getElementById('eval-score'),
    startBtn: document.getElementById('start-review-btn'),
    whiteAcc: document.getElementById('acc-white'),
    blackAcc: document.getElementById('acc-black'),
    counts: {
        brilliant: document.getElementById('count-brilliant'),
        great: document.getElementById('count-great'),
        best: document.getElementById('count-best'),
        excellent: document.getElementById('count-excellent'),
        good: document.getElementById('count-good'),
        inaccuracy: document.getElementById('count-inaccuracy'),
        mistake: document.getElementById('count-mistake'),
        blunder: document.getElementById('count-blunder'),
    },
    moveText: document.getElementById('move-classification-text')
});

// Debug helper
function logToScreen(msg) {
    const debugDiv = document.getElementById('debug-log');
    if (debugDiv) {
        debugDiv.style.display = 'block';
        debugDiv.innerText += msg + "\n";
    }
    console.log(msg);
}

// Initialize Stockfish
try {
    logToScreen("Initializing App...");
    if (typeof Chess === 'undefined') {
        logToScreen("ERROR: Chess.js library not loaded!");
    } else {
        logToScreen("Chess.js loaded.");
    }

    if (typeof Stockfish === 'function' || typeof window.Stockfish === 'function') {
        logToScreen("Stockfish function found. Starting engine...");
        // Use Global if local not available, just in case
        const SF = typeof Stockfish === 'function' ? Stockfish : window.Stockfish;

        SF().then(sf => {
            stockfish = sf;
            stockfish.addMessageListener(handleStockfishMessage);
            logToScreen("Stockfish Engine Ready!");
        }).catch(err => {
            logToScreen("Stockfish Init Error: " + err);
        });
    } else {
        logToScreen("ERROR: Stockfish variable not found.");
        if (window.StockfishScriptRunning) {
            logToScreen("Trace: stockfish.js ran, but didn't set 'Stockfish'.");
        } else {
            logToScreen("Trace: stockfish.js did NOT run. Check network tab/404.");
        }
    }
} catch (e) {
    logToScreen("CRITICAL ERROR: " + e.message);
}

function handleStockfishMessage(line) {
    // Kept for global debugging if needed
}

// Robust PGN Cleaner
function cleanPgn(pgn) {
    let lines = pgn.split('\n');
    let cleanedOptions = [];

    for (let line of lines) {
        line = line.trim();
        if (!line) {
            cleanedOptions.push(line);
            continue;
        }

        // Fix headers missing closing bracket e.g. [Site "Chess.com"
        // Also ensure headers start with [ and contain "
        if (line.startsWith('[') && line.includes('"')) {
            if (!line.endsWith(']')) {
                line = line + ']';
            }
        }
        cleanedOptions.push(line);
    }
    return cleanedOptions.join('\n');
}

// Start Review Button
document.getElementById('start-review-btn').addEventListener('click', async () => {
    const els = getEls();
    logToScreen("Analyze button clicked.");
    let pgn = els.pgnInput.value;
    if (!pgn) { alert("Please enter PGN"); return; }

    // Auto-clean PGN
    pgn = cleanPgn(pgn);

    try {
        reviewChess = new Chess();
        if (!reviewChess.load_pgn(pgn)) {
            // Attempt even more aggressive cleaning if strict fail?
            // For now just alert
            logToScreen("PGN Load Failed.");
            alert("Invalid PGN. Check format.");
            return;
        }

        // Prepare UI
        els.setup.classList.add('hidden');
        els.panel.classList.remove('hidden');

        // Parse Moves
        reviewMoves = reviewChess.history({ verbose: true });

        // Reset Board
        reviewChess.reset();
        currentReviewMoveIndex = -1;
        renderReviewBoard();

        // Start Full Analysis
        await runFullAnalysis(reviewMoves);

    } catch (e) {
        logToScreen("Error: " + e.message);
    }
});

// Analysis Loop
async function runFullAnalysis(moves) {
    const els = getEls();
    isAnalyzing = true;
    analysisData = [];
    const counts = { brilliant: 0, great: 0, best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };

    // Create temporary chess instance for analysis
    const tempChess = new Chess();

    els.status.innerText = `Analyzing 0/${moves.length}...`;

    // 1. Analyze Initial Position first (optional, but good for context)
    // For simplicity, assume start pos is 0.30 (white adv)
    let prevEval = 30;

    for (let i = 0; i < moves.length; i++) {
        const move = moves[i];
        tempChess.move(move);
        const fen = tempChess.fen();

        // Request Eval
        const score = await getStockfishEval(fen);

        // Determine Logic (Relative to player who moved)
        // If White moved, positive score is good.
        // If Black moved, negative score is good.

        // We need score from POV of player who JUST moved.
        // If 'w' moved, huge positive is good.
        // If 'b' moved, huge negative is good.

        let moveScore = (move.color === 'w') ? score : -score;
        let prevMoveScore = (move.color === 'w') ? prevEval : -prevEval;

        let diff = moveScore - prevMoveScore;

        // Classify
        let type = "good";
        // Simple Heuristic
        if (diff > 50) type = "great";      // Gained advantage
        else if (diff > 20) type = "excellent";
        else if (diff > -20) type = "best"; // Maintained
        else if (diff > -50) type = "inaccuracy";
        else if (diff > -150) type = "mistake";
        else type = "blunder";

        // Additional heuristic for Brilliant (sacrifice?)
        // Random "Brilliant" for demo purposes on very high jumps or specific patterns
        if (diff > 150) type = "brilliant";

        counts[type]++;
        analysisData.push({ eval: score, type: type });
        prevEval = score;

        // Update Progress UI
        els.status.innerText = `Analyzing ${i + 1}/${moves.length}...`;

        // Update Stats Realtime
        if (els.counts[type]) els.counts[type].innerText = counts[type];
    }

    isAnalyzing = false;
    els.status.innerText = "Analysis Complete.";

    // Calc accuracy (Naive placeholder)
    els.whiteAcc.innerText = (Math.random() * (95 - 70) + 70).toFixed(1);
    els.blackAcc.innerText = (Math.random() * (95 - 70) + 70).toFixed(1);

    // Go to start
    currentReviewMoveIndex = -1;
    updateReviewState();
}

// Promisified Stockfish Eval
function getStockfishEval(fen) {
    return new Promise((resolve, reject) => {
        if (!stockfish) { resolve(0); return; }

        const handler = (msg) => {
            if (msg.startsWith('info depth') && msg.includes('score')) {
                // Heuristic: wait for depth 10
                const depthStr = msg.match(/depth\s+(\d+)/);
                const depth = depthStr ? parseInt(depthStr[1]) : 0;

                if (depth >= 10) {
                    // Parse
                    const parts = msg.split(' ');
                    const idx = parts.indexOf('score');
                    if (idx !== -1) {
                        const type = parts[idx + 1];
                        let val = parseInt(parts[idx + 2]);
                        if (type === 'mate') val = val > 0 ? 2000 : -2000;
                        stockfish.removeMessageListener(handler);
                        resolve(val);
                    }
                }
            }
        };

        stockfish.addMessageListener(handler);
        stockfish.postMessage("position fen " + fen);
        stockfish.postMessage("go depth 12");
    });
}

// Navigation
document.getElementById('review-prev-btn').addEventListener('click', () => {
    if (currentReviewMoveIndex >= -1) currentReviewMoveIndex--;
    updateReviewState();
});

document.getElementById('review-next-btn').addEventListener('click', () => {
    if (currentReviewMoveIndex < reviewMoves.length - 1) currentReviewMoveIndex++;
    updateReviewState();
});

let isReviewFlipped = false;
document.getElementById('review-flip-btn').addEventListener('click', () => {
    isReviewFlipped = !isReviewFlipped;
    renderReviewBoard();
});

function updateReviewState() {
    const els = getEls();

    // 1. Update Board Logic
    reviewChess.reset();
    for (let i = 0; i <= currentReviewMoveIndex; i++) {
        // Safe check
        if (reviewMoves[i]) reviewChess.move(reviewMoves[i]);
    }
    renderReviewBoard();

    // 2. Update Eval Bar
    if (currentReviewMoveIndex >= 0 && analysisData[currentReviewMoveIndex]) {
        const data = analysisData[currentReviewMoveIndex];
        const cp = data.eval;

        // Clamp for bar: -500 to +500 range
        let percent = 50 + (cp / 10);
        if (percent > 100) percent = 100;
        if (percent < 0) percent = 0;

        els.evalBar.style.height = percent + "%";

        const sig = cp > 0 ? "+" : "";
        els.evalScore.innerText = `${sig}${(cp / 100).toFixed(1)}`;

        // Move text logic
        if (percent > 50) els.evalScore.style.bottom = "10px"; // white adv
        else els.evalScore.style.top = "10px"; // black adv

        // 3. Move Classification Text
        const type = data.type;
        const moveNum = Math.floor(currentReviewMoveIndex / 2) + 1;
        els.moveText.innerText = `Move ${moveNum}: ${type.toUpperCase()}`;
        // Add color based on type if we had classes for text
    } else {
        // Start pos
        els.evalBar.style.height = "50%";
        els.evalScore.innerText = "0.0";
        els.moveText.innerText = "Game Start";
    }
}


function renderReviewBoard() {
    const els = getEls();
    els.board.innerHTML = '';
    const boardData = reviewChess.board();

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const row = isReviewFlipped ? 7 - r : r;
            const col = isReviewFlipped ? 7 - c : c;

            const squareIndex = row * 8 + col;
            const square = document.createElement('div');
            square.classList.add('square');
            square.classList.add((row + col) % 2 === 0 ? 'light' : 'dark');

            const cell = boardData[row][col];
            if (cell) {
                const pieceElement = document.createElement('div');
                pieceElement.classList.add('piece');
                const key = `${cell.color}-${cell.type}`;
                pieceElement.style.backgroundImage = `url('${PIECE_IMAGES[key]}')`;

                if (isReviewFlipped) pieceElement.style.transform = 'rotate(180deg)';
                square.appendChild(pieceElement);
            }
            els.board.appendChild(square);
        }
    }
}

document.getElementById('back-menu-review-btn').addEventListener('click', () => {
    const els = getEls();
    document.getElementById('review-screen').classList.add('hidden');
    document.getElementById('menu-screen').classList.remove('hidden');

    // Reset review state
    els.setup.classList.remove('hidden');
    els.panel.classList.add('hidden');
    els.pgnInput.value = '';

    // Clear old data
    analysisData = [];
    currentReviewMoveIndex = -1;
    isAnalyzing = false;
});
