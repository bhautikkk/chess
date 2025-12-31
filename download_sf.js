const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const url = "https://github.com/official-stockfish/Stockfish/releases/download/sf_16/stockfish-ubuntu-x86-64.tar";
const tarDest = path.join(__dirname, 'stockfish.tar');
const finalDest = path.join(__dirname, 'stockfish_engine', 'stockfish', 'stockfish-ubuntu-x86-64');

console.log("Downloading from:", url);

const downloadFile = (url, dest, cb) => {
    const file = fs.createWriteStream(dest);
    const request = https.get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
            console.log("Redirecting to:", response.headers.location);
            downloadFile(response.headers.location, dest, cb);
            return;
        }
        response.pipe(file);
        file.on('finish', () => {
            file.close(cb);
        });
    }).on('error', (err) => {
        fs.unlink(dest, () => { });
        console.error('Error downloading:', err.message);
    });
};

downloadFile(url, tarDest, () => {
    console.log("Download completed. Extracting...");

    // Use system tar (available on Win10+ and Linux)
    // -x: extract, -f: file
    exec(`tar -xf ${tarDest}`, { cwd: __dirname }, (error, stdout, stderr) => {
        if (error) {
            console.error(`Exec error: ${error}`);
            // Fallback for missing tar? 
            console.log("Please install tar or extract 'stockfish.tar' manually.");
            return;
        }
        console.log("Extraction complete.");

        // Find the extracted file. It usually extracts to 'stockfish-ubuntu-x86-64/stockfish-ubuntu-x86-64'
        // We'll search for the file
        const findAndMove = (dir) => {
            const files = fs.readdirSync(dir);
            for (const f of files) {
                const fullPath = path.join(dir, f);
                const stat = fs.statSync(fullPath);

                // Skip node_modules and .git to save time
                if (f === 'node_modules' || f === '.git' || f === 'stockfish_engine') continue;

                if (stat.isDirectory()) {
                    findAndMove(fullPath);
                } else if (f === 'stockfish-ubuntu-x86-64' || f === 'stockfish-ubuntu-x86-64-avx2') {
                    console.log("Found binary:", fullPath);
                    // Ensure destination dir exists
                    const destDir = path.dirname(finalDest);
                    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

                    // If moving to same location (rare), skip
                    if (path.resolve(fullPath) === path.resolve(finalDest)) {
                        console.log("Binary already in place.");
                        return;
                    }

                    // Move (Rename)
                    // If target exists, delete it first (Windows rename issue sometimes)
                    if (fs.existsSync(finalDest)) fs.unlinkSync(finalDest);

                    fs.renameSync(fullPath, finalDest);
                    console.log("Moved to:", finalDest);

                    // Cleanup tar and extracted folder?
                    // We can leave them for now or try to clean up the parent folder of the binary if it was a temp one.
                    return;
                }
            }
        };

        try {
            findAndMove(__dirname);
            if (fs.existsSync(finalDest)) {
                console.log("Setup successfully!");
                try { fs.unlinkSync(tarDest); } catch (e) { }
            } else {
                console.error("Critical: Could not find extracted binary!");
            }
        } catch (e) {
            console.error("Error moving file:", e);
        }
    });
});
