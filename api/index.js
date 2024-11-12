const fs = require('fs');
const WebSocket = require('ws');
const axios = require('axios');
const HttpsProxyAgent = require('https-proxy-agent');
const uuid = require('uuid');
const { randomUUID } = require('crypto');

// Load the user ID from a file
function loadUserId() {
    try {
        return fs.readFileSync('user.txt', 'utf-8').trim();
    } catch (error) {
        console.error("Error: user.txt file not found.");
        process.exit(1);
    }
}

// Fetch proxy list and save it to auto_proxies.txt
async function fetchProxies() {
    try {
        const response = await axios.get("https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&proxy_format=protocolipport&format=text");
        fs.writeFileSync('auto_proxies.txt', response.data);
        return response.data.split('\n').filter(line => line.trim());
    } catch (error) {
        console.error("Failed to download proxy list:", error);
        return [];
    }
}

// Connect to WebSocket through proxy and handle messaging
async function connectToWss(socks5Proxy, userId) {
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36';
    const deviceId = uuid.v3(socks5Proxy, uuid.v3.DNS);
    const uriList = ["wss://proxy2.wynd.network:4444/", "wss://proxy2.wynd.network:4650/"];
    const uri = uriList[Math.floor(Math.random() * uriList.length)];
    
    const agent = new HttpsProxyAgent(`socks5://${socks5Proxy}`);
    const ws = new WebSocket(uri, { agent, headers: { 'User-Agent': userAgent } });

    ws.on('open', () => {
        console.log(`Connected to ${uri} using proxy ${socks5Proxy}`);
        sendPing(ws);
    });

    ws.on('message', (data) => {
        const message = JSON.parse(data);
        console.log("Received:", message);

        if (message.action === "AUTH") {
            const authResponse = {
                id: message.id,
                origin_action: "AUTH",
                result: {
                    browser_id: deviceId,
                    user_id: userId,
                    user_agent: userAgent,
                    timestamp: Math.floor(Date.now() / 1000),
                    device_type: "desktop",
                    version: "4.28.2",
                }
            };
            ws.send(JSON.stringify(authResponse));
        } else if (message.action === "PONG") {
            const pongResponse = { id: message.id, origin_action: "PONG" };
            ws.send(JSON.stringify(pongResponse));
        }
    });

    ws.on('error', (error) => {
        console.error("WebSocket error:", error);
        removeProxy(socks5Proxy);
    });

    ws.on('close', () => {
        console.log(`Connection closed for proxy ${socks5Proxy}`);
    });
}

// Send a ping message every 5 seconds
function sendPing(ws) {
    setInterval(() => {
        const pingMessage = JSON.stringify({
            id: randomUUID(),
            version: "1.0.0",
            action: "PING",
            data: {}
        });
        ws.send(pingMessage);
    }, 5000);
}

// Remove non-working proxy from auto_proxies.txt
function removeProxy(proxyToRemove) {
    const proxies = fs.readFileSync('auto_proxies.txt', 'utf-8').split('\n').filter(line => line.trim() && line.trim() !== proxyToRemove);
    fs.writeFileSync('auto_proxies.txt', proxies.join('\n'));
    console.log(`Proxy '${proxyToRemove}' has been removed from the file.`);
}

// Main function
(async function main() {
    const userId = loadUserId();
    const proxies = await fetchProxies();
    proxies.forEach(proxy => connectToWss(proxy, userId));
})();