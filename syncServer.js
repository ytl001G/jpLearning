const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 8787);
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'sync-data');

const MIME_TYPES = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8'
};

fs.mkdirSync(DATA_DIR, { recursive: true });

const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (url.pathname.startsWith('/api/sync/')) {
        if (req.method === 'OPTIONS') {
            sendJson(res, 204, null);
            return;
        }

        handleSync(req, res, decodeURIComponent(url.pathname.slice('/api/sync/'.length)));
        return;
    }

    serveStatic(url.pathname, res);
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Japanese reader sync server: http://localhost:${PORT}/`);
    console.log('Open the same address from your phone using this PC IP on the same Wi-Fi.');
});

function handleSync(req, res, userId) {
    if (!/^[a-zA-Z0-9_-]{3,40}$/.test(userId)) {
        sendJson(res, 400, { error: 'invalid_user_id' });
        return;
    }

    const filePath = path.join(DATA_DIR, `${userId}.json`);

    if (req.method === 'GET') {
        if (!fs.existsSync(filePath)) {
            sendJson(res, 404, { error: 'not_found' });
            return;
        }

        sendJson(res, 200, JSON.parse(fs.readFileSync(filePath, 'utf8')));
        return;
    }

    if (req.method === 'PUT') {
        readBody(req).then((body) => {
            const data = JSON.parse(body);
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
            sendJson(res, 200, { ok: true });
        }).catch(() => {
            sendJson(res, 400, { error: 'invalid_json' });
        });
        return;
    }

    sendJson(res, 405, { error: 'method_not_allowed' });
}

function serveStatic(pathname, res) {
    const normalized = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
    const filePath = path.resolve(ROOT_DIR, `.${normalized}`);

    if (!filePath.startsWith(ROOT_DIR) || filePath.startsWith(DATA_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.readFile(filePath, (error, content) => {
        if (error) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }

        res.writeHead(200, {
            'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream'
        });
        res.end(content);
    });
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk) => {
            body += chunk;
            if (body.length > 1024 * 1024) {
                req.destroy();
                reject(new Error('too_large'));
            }
        });
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}

function sendJson(res, status, data) {
    res.writeHead(status, {
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json; charset=utf-8'
    });
    res.end(data === null ? '' : JSON.stringify(data));
}
