const https = require('https');
const fs = require('fs');
const path = require('path');

const url = "https://github.com/official-stockfish/Stockfish/releases/download/sf_16/stockfish-ubuntu-x86-64";
const dest = path.join(__dirname, 'stockfish_engine', 'stockfish', 'stockfish-ubuntu-x86-64');

console.log("Downloading from:", url);
console.log("Saving to:", dest);

const file = fs.createWriteStream(dest);

https.get(url, (response) => {
    if (response.statusCode === 302 || response.statusCode === 301) {
        console.log("Redirecting to:", response.headers.location);
        https.get(response.headers.location, (res) => {
            res.pipe(file);
            file.on('finish', () => {
                file.close(() => console.log('Download completed.'));
            });
        });
    } else {
        response.pipe(file);
        file.on('finish', () => {
            file.close(() => console.log('Download completed.'));
        });
    }
}).on('error', (err) => {
    fs.unlink(dest, () => { }); // Delete the file async. (But we don't check result)
    console.error('Error downloading file:', err.message);
});
