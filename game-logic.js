
// Basic Chess Engine

const PIECES = {
    p: 'pawn',
    n: 'knight',
    b: 'bishop',
    r: 'rook',
    q: 'queen',
    k: 'king'
};

const SYMBOLS = {
    w: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' },
    b: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' }
};

// SVG data uris for pieces for a better look
// Using Wikimedia Commons standard chess pieces
const PIECE_IMAGES = {
    'w-p': 'https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg',
    'w-n': 'https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg',
    'w-b': 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg',
    'w-r': 'https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg',
    'w-q': 'https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg',
    'w-k': 'https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg',
    'b-p': 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg',
    'b-n': 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg',
    'b-b': 'https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg',
    'b-r': 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg',
    'b-q': 'https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg',
    'b-k': 'https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg',
};

class ChessGame {
    constructor() {
        this.board = [];
        this.turn = 'w'; // 'w' or 'b'
        this.castling = { w: { k: true, q: true }, b: { k: true, q: true } };
        this.enPassantTarget = null; // Square like 'e3' if available
        this.halfMoveClock = 0;
        this.fullMoveNumber = 1;
        this.history = []; // History of moves for undo? or just state to check repetition
        this.reset();
    }

    reset() {
        // Standard starting FEN
        this.loadFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    }

    loadFEN(fen) {
        const parts = fen.split(' ');
        
        // 1. Board
        this.board = new Array(64).fill(null);
        let rows = parts[0].split('/');
        for (let r = 0; r < 8; r++) {
            let c = 0;
            for (let char of rows[r]) {
                if (char >= '1' && char <= '8') {
                    c += parseInt(char);
                } else {
                    const color = (char === char.toUpperCase()) ? 'w' : 'b';
                    const type = char.toLowerCase();
                    this.board[r * 8 + c] = { type, color };
                    c++;
                }
            }
        }

        // 2. Turn
        this.turn = parts[1];

        // 3. Castling
        this.castling = { w: { k: false, q: false }, b: { k: false, q: false } };
        if (parts[2] !== '-') {
            if (parts[2].includes('K')) this.castling.w.k = true;
            if (parts[2].includes('Q')) this.castling.w.q = true;
            if (parts[2].includes('k')) this.castling.b.k = true;
            if (parts[2].includes('q')) this.castling.b.q = true;
        }

        // 4. En Passant
        this.enPassantTarget = parts[3] === '-' ? null : this.squareToIndex(parts[3]);

        // 5. Clocks
        this.halfMoveClock = parseInt(parts[4]) || 0;
        this.fullMoveNumber = parseInt(parts[5]) || 1;
    }

    getPiece(index) {
        return this.board[index];
    }

    squareToIndex(sq) {
        const file = sq.charCodeAt(0) - 'a'.charCodeAt(0);
        const rank = 8 - parseInt(sq[1]);
        return rank * 8 + file;
    }
    
    indexToSquare(index) {
        const rank = Math.floor(index / 8);
        const file = index % 8;
        return String.fromCharCode('a'.charCodeAt(0) + file) + (8 - rank);
    }

    // Move Generation
    getValidMoves(index) {
        // Generate pseudo-legal moves then filter illegal ones (checking king safety)
        const piece = this.getPiece(index);
        if (!piece || piece.color !== this.turn) return [];

        const moves = this.getPseudoLegalMoves(index, piece);
        
        // Filter moves that leave king in check
        return moves.filter(move => {
            // Apply move temporarily
            const savedState = this.saveState();
            this.makeMoveInternal(move);
            const isCheck = this.isKingInCheck(piece.color);
            this.restoreState(savedState);
            return !isCheck;
        });
    }

    getPseudoLegalMoves(index, piece) {
        const moves = [];
        const r = Math.floor(index / 8);
        const c = index % 8;
        
        const directions = {
            'b': [[1, 1], [1, -1], [-1, 1], [-1, -1]],
            'r': [[1, 0], [-1, 0], [0, 1], [0, -1]],
            'q': [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]],
            'n': [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]],
            'k': [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]
        };

        const addMove = (to) => {
            moves.push({ from: index, to: to });
        };
        
        // Sliding pieces
        if (['b', 'r', 'q'].includes(piece.type)) {
            for (let d of directions[piece.type]) {
                for (let i = 1; i < 8; i++) {
                    const tr = r + d[0] * i;
                    const tc = c + d[1] * i;
                    if (tr < 0 || tr > 7 || tc < 0 || tc > 7) break;
                    
                    const targetIndex = tr * 8 + tc;
                    const targetPiece = this.board[targetIndex];
                    
                    if (!targetPiece) {
                        addMove(targetIndex);
                    } else {
                        if (targetPiece.color !== piece.color) {
                            addMove(targetIndex);
                        }
                        break; // Blocked
                    }
                }
            }
        }
        
        // Knight
        if (piece.type === 'n') {
            for (let d of directions['n']) {
                const tr = r + d[0];
                const tc = c + d[1];
                if (tr >= 0 && tr <= 7 && tc >= 0 && tc <= 7) {
                    const targetIndex = tr * 8 + tc;
                    const targetPiece = this.board[targetIndex];
                    if (!targetPiece || targetPiece.color !== piece.color) {
                        addMove(targetIndex);
                    }
                }
            }
        }

        // King
        if (piece.type === 'k') {
            for (let d of directions['k']) {
                const tr = r + d[0];
                const tc = c + d[1];
                if (tr >= 0 && tr <= 7 && tc >= 0 && tc <= 7) {
                    const targetIndex = tr * 8 + tc;
                    const targetPiece = this.board[targetIndex];
                    if (!targetPiece || targetPiece.color !== piece.color) {
                        addMove(targetIndex);
                    }
                }
            }
            // Castling (Not fully implemented in this basic version for simplicity, but stubbed)
            // TODO: Add Castling Logic
        }

        // Pawn
        if (piece.type === 'p') {
            const dir = piece.color === 'w' ? -1 : 1;
            const startRank = piece.color === 'w' ? 6 : 1;
            
            // Forward 1
            const f1r = r + dir;
            const f1c = c;
            if (f1r >= 0 && f1r <= 7 && !this.board[f1r * 8 + f1c]) {
                addMove(f1r * 8 + f1c);
                // Forward 2
                if (r === startRank) {
                    const f2r = r + dir * 2;
                    if (!this.board[f2r * 8 + c]) {
                        addMove(f2r * 8 + c);
                    }
                }
            }

            // Capture
            for (let dc of [-1, 1]) {
                const cr = r + dir;
                const cc = c + dc;
                if (cr >= 0 && cr <= 7 && cc >= 0 && cc <= 7) {
                    const targetIndex = cr * 8 + cc;
                    const targetPiece = this.board[targetIndex];
                    if (targetPiece && targetPiece.color !== piece.color) {
                        addMove(targetIndex);
                    }
                    // En Passant
                    if (targetIndex === this.enPassantTarget) {
                        addMove(targetIndex); // Note: Special handling for execution needed
                    }
                }
            }
        }

        return moves;
    }

    makeMove(move) {
        // Validates and executes a move
        const validMoves = this.getValidMoves(move.from);
        const actualMove = validMoves.find(m => m.to === move.to); // Check if requested move is in valid list
        
        if (actualMove) {
            this.makeMoveInternal(actualMove);
            return true;
        }
        return false;
    }

    makeMoveInternal(move) {
        const piece = this.board[move.from];
        const target = this.board[move.to];
        
        // Update board
        this.board[move.to] = piece;
        this.board[move.from] = null;

        // Handle En Passant Capture
        if (piece.type === 'p' && move.to === this.enPassantTarget) {
            const dir = piece.color === 'w' ? -1 : 1;
            // The pawn being captured is 'behind' the target square
            this.board[move.to - dir * 8] = null; 
        }

        // Reset En Passant Target
        this.enPassantTarget = null;
        
        // Set En Passant Target for double pawn push
        if (piece.type === 'p' && Math.abs(Math.floor(move.from/8) - Math.floor(move.to/8)) === 2) {
             this.enPassantTarget = (move.from + move.to) / 2;
        }

        // Promotion (Auto-promote to Queen for simplicity)
        if (piece.type === 'p' && (Math.floor(move.to/8) === 0 || Math.floor(move.to/8) === 7)) {
            piece.type = 'q';
        }

        // Switch Turn
        this.turn = this.turn === 'w' ? 'b' : 'w';
    }

    isKingInCheck(color) {
        // Find King
        let kingIndex = -1;
        for (let i = 0; i < 64; i++) {
            if (this.board[i] && this.board[i].type === 'k' && this.board[i].color === color) {
                kingIndex = i;
                break;
            }
        }

        // Check if any opponent piece attacks king position
        const opponentColor = color === 'w' ? 'b' : 'w';
        for (let i = 0; i < 64; i++) {
            const piece = this.board[i];
            if (piece && piece.color === opponentColor) {
               const moves = this.getPseudoLegalMoves(i, piece);
               if (moves.some(m => m.to === kingIndex)) {
                   return true;
               }
            }
        }
        return false;
    }
    
    // Helpers for State saving (simplified)
    saveState() {
        return {
            board: [...this.board],
            turn: this.turn,
            ep: this.enPassantTarget,
            // ... castling, etc
        };
    }
    
    restoreState(state) {
        this.board = state.board;
        this.turn = state.turn;
        this.enPassantTarget = state.ep;
    }
    
    isCheckmate() {
        // if check and no valid moves
        if (!this.isKingInCheck(this.turn)) return false;
        
        for (let i = 0; i < 64; i++) {
            if (this.board[i] && this.board[i].color === this.turn) {
                if (this.getValidMoves(i).length > 0) return false;
            }
        }
        return true;
    }
}
