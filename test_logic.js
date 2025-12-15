const vm = require('vm');
const fs = require('fs');
const path = require('path');

let code = fs.readFileSync(path.join(__dirname, 'game-logic.js'), 'utf8');
// Append assignment to global for access
code += ";\nif (typeof ChessGame !== 'undefined') { this.ChessGame = ChessGame; }";

const context = {};
vm.createContext(context);
vm.runInContext(code, context);

const ChessGame = context.ChessGame;
// console.log("ChessGame:", ChessGame); // Debug

if (!ChessGame) {
    console.error("ChessGame not found in context. Check if class is defined properly.");
    process.exit(1);
}

const game = new ChessGame();

console.log("Initial Turn:", game.turn);
// White pawn at e2 is index 52.
const piece = game.getPiece(52);
console.log("Piece at 52:", piece);

const moves = game.getValidMoves(52);

console.log("Moves for e2:", moves);

if (moves.length > 0) {
    console.log("Logic seems OK. Testing move execution.");
    // Move to e4 (index 36) -> 52 - 16 = 36.
    const move = moves.find(m => m.to === 36);
    if (move) {
        const success = game.makeMove(move);
        console.log("Move success:", success);
        console.log("New Turn:", game.turn);
        console.log("Piece at 36:", game.getPiece(36));
    } else {
        console.log("Could not find move to e4. Available:", moves.map(m => m.to));
    }
} else {
    console.error("Logic Error: No valid moves for starting pawn!");
}
