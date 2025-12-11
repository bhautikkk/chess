
const game = new ChessGame();
const boardElement = document.getElementById('board');
const statusElement = document.getElementById('status');
const resetBtn = document.getElementById('reset-btn');
const flipBtn = document.getElementById('flip-btn');

// Screens
const menuScreen = document.getElementById('menu-screen');
const gameScreen = document.getElementById('game-screen');

// Menu Buttons
const playBtn = document.getElementById('play-btn');
const backMenuBtn = document.getElementById('back-menu-btn');

function showScreen(screen) {
    [menuScreen, gameScreen].forEach(s => {
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

backMenuBtn.addEventListener('click', () => {
    showScreen(menuScreen);
});

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
