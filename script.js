
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

    // 1. Initial Position Eval
    let whiteScoreBefore = 30; // 0.30

    for (let i = 0; i < moves.length; i++) {
        const move = moves[i];
        const playerColor = tempChess.turn(); // 'w' or 'b' BEFORE move

        tempChess.move(move);
        const fen = tempChess.fen();
        const turnAfter = tempChess.turn(); // Side to move AFTER move

        // Request Eval (Score is always for side to move 'turnAfter')
        const rawScore = await getStockfishEval(fen);

        // Convert to White Perspective
        let whiteScoreAfter; // Score from White's POV
        if (turnAfter === 'w') {
            whiteScoreAfter = rawScore;
        } else {
            whiteScoreAfter = -rawScore;
        }

        // Calculate Delta (How much did the moving player value CHANGE?)
        // If White moved: We want After >= Before. Delta = After - Before.
        // If Black moved: We want After <= Before (More negative). Delta = Before - After.
        let delta;
        if (playerColor === 'w') {
            delta = whiteScoreAfter - whiteScoreBefore;
        } else {
            delta = whiteScoreBefore - whiteScoreAfter;
        }

        // Classification
        let type = "best";

        // Book moves (First 5 moves generally) - Simplistic
        if (i < 8 && delta > -30) {
            type = 'book';
        } else {
            // New thresholds
            if (delta > 50) type = "great"; // Found a winning resource?
            else if (delta >= -10) type = "best"; // Solid
            else if (delta >= -25) type = "excellent";
            else if (delta >= -50) type = "good";
            else if (delta >= -100) type = "inaccuracy"; // -1.0 pawn loss
            else if (delta >= -250) type = "mistake"; // -2.5 pawn loss
            else type = "blunder";

            // Winning cap / brilliant heuristic
            if (delta > 150) type = "brilliant";
        }

        // UI Fix: Map 'book' to 'best' styles for now if CSS missing
        if (type === 'book') type = 'best';

        if (counts[type] !== undefined) counts[type]++;

        analysisData.push({ eval: whiteScoreAfter, type: type });
        whiteScoreBefore = whiteScoreAfter;

        // Update Progress UI
        els.status.innerText = `Analyzing ${i + 1}/${moves.length}...`;

        // Update Stats Realtime
        if (els.counts[type]) els.counts[type].innerText = counts[type];
    }

    isAnalyzing = false;
    els.status.innerText = "Analysis Complete.";

    // Calculate Accuracy based on Mistakes/Blunders
    const calcAcc = (color) => {
        let demerits = 0;
        let moveCount = 0;
        analysisData.forEach((d, idx) => {
            // idx is move index. Even = White, Odd = Black
            const isWhiteKey = (idx % 2 === 0);
            if ((color === 'w' && isWhiteKey) || (color === 'b' && !isWhiteKey)) {
                moveCount++;
                if (d.type === 'blunder') demerits += 4; // Weighted penalty
                else if (d.type === 'mistake') demerits += 2;
                else if (d.type === 'inaccuracy') demerits += 0.5;
                // else if (d.type === 'good') demerits += 0;
            }
        });
        if (moveCount === 0) return "100";
        // Max demerit per move is 4. Accuracy = 100 - (avg_demerits * 25)? 
        // Let's say max penalty is 100%. 
        let avgPenalty = demerits / moveCount; // 0 to 4
        let acc = 100 - (avgPenalty * 20); // Scale: if 1 blunder every move -> 20 acc.
        if (acc < 0) acc = 0;
        if (acc > 100) acc = 100;
        return acc.toFixed(1);
    };

    els.whiteAcc.innerText = calcAcc('w');
    els.blackAcc.innerText = calcAcc('b');

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
