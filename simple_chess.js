document.addEventListener('DOMContentLoaded', () => {
    // Initialize Game from existing logic
    if (typeof ChessGame === 'undefined') {
        alert("Error: Game logic not loaded.");
        return;
    }

    const game = new ChessGame();
    const boardElement = document.getElementById('board');
    const turnIndicator = document.getElementById('turn-indicator');
    const resetBtn = document.getElementById('reset-btn');

    let selectedSquare = null;
    let validMoves = [];

    function updateStatus() {
        let status = game.turn === 'w' ? "White's Turn" : "Black's Turn";
        if (game.isKingInCheck(game.turn)) {
            if (game.isCheckmate()) {
                status = `Checkmate! ${game.turn === 'w' ? 'Black' : 'White'} Wins!`;
                alert(status); // Simple alert for game over
            } else {
                status += " (Check!)";
            }
        }
        turnIndicator.innerText = status;
    }

    function renderBoard() {
        boardElement.innerHTML = '';

        for (let i = 0; i < 64; i++) {
            const square = document.createElement('div');
            square.classList.add('square');

            // Determine color
            const row = Math.floor(i / 8);
            const col = i % 8;
            const isLight = (row + col) % 2 === 0;
            square.classList.add(isLight ? 'light' : 'dark');

            square.dataset.index = i;

            // Selection & Highlights
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

            // Render Piece
            const piece = game.board[i];
            if (piece) {
                const pieceDiv = document.createElement('div');
                pieceDiv.classList.add('piece');
                const key = `${piece.color}-${piece.type}`;
                // Using the PIECE_IMAGES from game-logic.js (global)
                if (typeof PIECE_IMAGES !== 'undefined') {
                    pieceDiv.style.backgroundImage = `url('${PIECE_IMAGES[key]}')`;
                } else {
                    pieceDiv.innerText = piece.type; // Fallback
                }
                square.appendChild(pieceDiv);
            }

            // Click Handler
            square.addEventListener('click', () => onSquareClick(i));

            boardElement.appendChild(square);
        }
    }

    function onSquareClick(index) {
        // If clicking a valid move square for the selected piece
        const move = validMoves.find(m => m.to === index);

        if (move) {
            // Check Promotion
            const piece = game.getPiece(selectedSquare);
            if (piece.type === 'p' && (Math.floor(move.to / 8) === 0 || Math.floor(move.to / 8) === 7)) {
                // Auto-promote to Queen for simplicity in this version
                move.promotion = 'q';
            }

            game.makeMove(move);
            selectedSquare = null;
            validMoves = [];
            renderBoard();
            updateStatus();
            return;
        }

        // Selection Logic
        const piece = game.getPiece(index);
        if (piece && piece.color === game.turn) {
            // Select friendly piece
            if (selectedSquare === index) {
                // Deselect
                selectedSquare = null;
                validMoves = [];
            } else {
                selectedSquare = index;
                validMoves = game.getValidMoves(index);
            }
            renderBoard();
        } else {
            // Clicked empty or enemy piece without valid move -> Deselect
            selectedSquare = null;
            validMoves = [];
            renderBoard();
        }
    }

    resetBtn.addEventListener('click', () => {
        game.reset();
        selectedSquare = null;
        validMoves = [];
        renderBoard();
        updateStatus();
    });

    // Initial Render
    renderBoard();
    updateStatus();
});
