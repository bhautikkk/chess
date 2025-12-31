const https = require('https');

const options = {
    hostname: 'api.github.com',
    path: '/repos/official-stockfish/Stockfish/releases/tags/sf_16',
    headers: { 'User-Agent': 'Mozilla/5.0' }
};

https.get(options, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            if (json.assets) {
                console.log("Assets found:");
                json.assets.forEach(a => console.log(`- ${a.name}: ${a.browser_download_url}`));
            } else {
                console.log("No assets found or error:", json);
            }
        } catch (e) {
            console.error("Parse error:", e);
        }
    });
}).on('error', (e) => console.error(e));
