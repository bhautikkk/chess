
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
    // Maybe reset game or not? typical flow is play -> starts game
    // game.reset(); // Optional: auto reset
    renderBoardSimple();
});

reviewBtn.addEventListener('click', () => {
    showScreen(reviewScreen);
});

backMenuBtn.addEventListener('click', () => {
    showScreen(menuScreen);
});

backMenuReviewBtn.addEventListener('click', () => {
    showScreen(menuScreen);
});

let selectedSquare = null;
let validMoves = [];
let isFlipped = false;

function renderBoard() {
    boardElement.innerHTML = '';

    // Board rotation logic
    const startRow = isFlipped ? 7 : 0;
    const endRow = isFlipped ? -1 : 8;
    const stepRow = isFlipped ? -1 : 1;

    // We render based on visual rows/cols
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            // Actual board coordinates
            const row = isFlipped ? 7 - r : r;
            const col = isFlipped ? 7 - c : c;
            const index = row * 8 + col;

            const square = document.createElement('div');
            square.classList.add('square');
            square.classList.add((row + col) % 2 === 0 ? 'light' : 'dark');
            square.dataset.index = index;

            // Highlight selected
            if (selectedSquare === index) {
                square.classList.add('selected');
            }

            // Highlight moves
            const move = validMoves.find(m => m.to === index);
            if (move) {
                if (game.board[index]) {
                    square.classList.add('highlight-capture');
                } else {
                    square.classList.add('highlight');
                }
            }

            const piece = game.getPiece(index);
            if (piece) {
                const pieceElement = document.createElement('div');
                pieceElement.classList.add('piece');
                const key = `${piece.color}-${piece.type}`;
                pieceElement.style.backgroundImage = `url('${PIECE_IMAGES[key]}')`;

                // Rotate pieces back if board is flipped so they are upright
                if (isFlipped) {
                    pieceElement.style.transform = 'rotate(180deg)';
                }

                square.appendChild(pieceElement);
            }

            square.addEventListener('click', () => onSquareClick(index));
            boardElement.appendChild(square);
        }
    }

    game.isFlippedLocal = isFlipped; // hack for styling if needed
    if (isFlipped) {
        boardElement.style.transform = 'rotate(180deg)';
        // But we handle this in rendering order mostly, let's just stick to grid rendering order for simplicity
        // Actually, CSS transform rotate(180) is easier than reordering the grid if we rotate pieces back.
        // Let's try the CSS transform approach for the board container.
    } else {
        boardElement.style.transform = 'none';
    }

    updateStatus();
}

// Better Flip approach: Pure CSS transform on container, counter-transform on pieces
// Redoing render to be simple 0-63 loop and letting CSS handle visual flip
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

let reviewChess = null; // The chess.js instance for logic
let reviewMoves = [];
let currentReviewMoveIndex = -1; // -1 = start position
let stockfish = null;
let evaluations = {}; // Map moveIndex -> score string

// Initialize Stockfish
try {
    if (typeof Stockfish === 'function') {
        Stockfish().then(sf => {
            stockfish = sf;
            stockfish.addMessageListener(handleStockfishMessage);
            console.log("Stockfish initialized");
            document.getElementById('review-status').innerText = "Engine ready!";
        }).catch(err => {
            console.error("Stockfish Init Error:", err);
            alert("Stockfish failed to load: " + err);
        });
    } else {
        console.error("Stockfish variable not found.");
        // alert("Stockfish not loaded. Check console."); 
        // Commented alert to avoid annoyance if it loads late, but crucial for debugging now.
    }
} catch (e) {
    console.error("Stockfish Critical Error:", e);
}

function handleStockfishMessage(line) {
    // console.log("SF:", line);
    if (line.startsWith('info depth') && line.includes('score')) {
        // Parse score
        // format: info depth 10 ... score cp 50 ...
        const parts = line.split(' ');
        let scoreIndex = parts.indexOf('score');
        if (scoreIndex !== -1) {
            let type = parts[scoreIndex + 1]; // cp or mate
            let val = parseInt(parts[scoreIndex + 2]);

            let evalText = "";
            if (type === 'cp') {
                evalText = (val / 100).toFixed(2);
                if (val > 0) evalText = "+" + evalText;
            } else if (type === 'mate') {
                evalText = "M" + Math.abs(val);
                if (val > 0) evalText = "+" + evalText;
            }

            // Update UI if looking at this move
            if (currentReviewMoveIndex >= -1) {
                // Determine which move we are analyzing. 
                // Simple approach: we only analyze the *current* position displayed
                document.getElementById('eval-score').innerText = evalText;
            }
        }
    }
}

const startReviewBtn = document.getElementById('start-review-btn');
const pgnInput = document.getElementById('pgn-input');
const reviewBoardElement = document.getElementById('review-board');
const reviewStatus = document.getElementById('review-status');

startReviewBtn.addEventListener('click', () => {
    console.log("Analyze Game clicked"); // Debug log
    const pgn = pgnInput.value;
    if (!pgn) {
        alert("Please enter a PGN");
        return;
    }

    try {
        reviewChess = new Chess();
        if (!reviewChess.load_pgn(pgn)) {
            alert("Invalid PGN");
            return;
        }

        reviewMoves = reviewChess.history({ verbose: true });
        currentReviewMoveIndex = -1;

        document.getElementById('setup-review').classList.add('hidden');
        document.getElementById('review-board-container').classList.remove('hidden');

        renderReviewBoard();
        analyzeCurrentPosition();

    } catch (e) {
        console.error(e);
        alert("Error parsing PGN: " + e.message);
    }
});

document.getElementById('review-prev-btn').addEventListener('click', () => {
    if (currentReviewMoveIndex > -1) {
        currentReviewMoveIndex--;
        reviewChess.undo();
        renderReviewBoard();
        analyzeCurrentPosition();
    }
});

document.getElementById('review-next-btn').addEventListener('click', () => {
    if (currentReviewMoveIndex < reviewMoves.length - 1) {
        currentReviewMoveIndex++;
        const move = reviewMoves[currentReviewMoveIndex];
        reviewChess.move(move);
        renderReviewBoard();
        analyzeCurrentPosition();
    }
});

let isReviewFlipped = false;
document.getElementById('review-flip-btn').addEventListener('click', () => {
    isReviewFlipped = !isReviewFlipped;
    renderReviewBoard();
});

function renderReviewBoard() {
    reviewBoardElement.innerHTML = '';

    // We can map chess.js board to our visual board
    const boardData = reviewChess.board(); // 8x8 array

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            // Logic coords
            const row = r;
            const col = c;

            const squareIndex = row * 8 + col;
            const square = document.createElement('div');
            square.classList.add('square');
            square.classList.add((row + col) % 2 === 0 ? 'light' : 'dark');

            // Piece
            const cell = boardData[row][col];
            if (cell) {
                const pieceElement = document.createElement('div');
                pieceElement.classList.add('piece');
                const key = `${cell.color}-${cell.type}`;
                pieceElement.style.backgroundImage = `url('${PIECE_IMAGES[key]}')`;

                if (isReviewFlipped) {
                    pieceElement.style.transform = 'rotate(180deg)';
                }
                square.appendChild(pieceElement);
            }

            // Highlight last move
            if (currentReviewMoveIndex >= 0) {
                const lastMove = reviewMoves[currentReviewMoveIndex];
                // chess.js 'to' and 'from' are algebraic 'e4'
                // We need to convert to index if we want to highlight? 
                // Or just use class checks?
                // Let's skip move highlighting for MVP or calculate indices
            }

            reviewBoardElement.appendChild(square);
        }
    }

    if (isReviewFlipped) {
        reviewBoardElement.style.transform = 'rotate(180deg)';
    } else {
        reviewBoardElement.style.transform = 'none';
    }

    // Update Status
    const turn = reviewChess.turn() === 'w' ? "White" : "Black";
    const moveNum = Math.floor(currentReviewMoveIndex / 2) + 1;
    reviewStatus.innerText = `Move ${currentReviewMoveIndex + 1} - ${turn} to move`;
}

function analyzeCurrentPosition() {
    if (!stockfish) return;

    const fen = reviewChess.fen();
    stockfish.postMessage("position fen " + fen);
    stockfish.postMessage("go depth 15");
    document.getElementById('eval-score').innerText = "...";
}

// Back to menu from review also needs to reset UI
backMenuReviewBtn.addEventListener('click', () => {
    showScreen(menuScreen);
    // Optional: reset review state
    document.getElementById('setup-review').classList.remove('hidden');
    document.getElementById('review-board-container').classList.add('hidden');
    pgnInput.value = '';
});
