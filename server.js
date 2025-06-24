const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const express = require('express');
const qrcode = require('qrcode');
const socketIO = require('socket.io');
const http = require('http');
const axios = require('axios');
// initial instance
const PORT = process.env.PORT || 8080;
const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ],
    }
});

// index routing and middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.get('/', (req, res) => {
    res.sendFile('index.html', { root: __dirname });
});

// initialize whatsapp and the example event
client.on('message', async (msg) => {
    const from = msg.from;
    const text = msg.body;

    try {
        const res = await axios.post('http://103.49.239.96:5678/webhook-test/0baf84fd-4216-4a00-8bbd-da719e4e880b', {
            from,
            text
        });

        const reply = res.data?.reply || 'Bot sedang memproses...';
        msg.reply(reply);
    } catch (err) {
        console.error('Error ke webhook:', err.message);
        msg.reply('Terjadi kesalahan saat memanggil layanan.');
    }
});

client.initialize();

// socket connection
io.on('connection', (socket) => {
    var today = new Date();
    var now = today.toLocaleString();
    socket.emit('message', `${now} Connected`);

    client.on('qr', (qr) => {
        qrcode.toDataURL(qr, (err, url) => {
            if (err) {
                console.error(err);
                return;
            }
            socket.emit('qr', url);
            socket.emit('message', `${now} QR Code received`);
        });
    });

    client.on('ready', () => {
        socket.emit('message', `${now} WhatsApp is ready!`);
    });

    client.on('authenticated', () => {
        socket.emit('message', `${now} WhatsApp is authenticated!`);
    });

    client.on('auth_failure', () => {
        socket.emit('message', `${now} Auth failure, restarting...`);
    });

    client.on('disconnected', () => {
        socket.emit('message', `${now} Disconnected`);
        client.destroy();
        client.initialize();
    });
});

// send message routing
app.post('/send', (req, res) => {
    const phone = req.body.phone;
    const message = req.body.message;

    client.sendMessage(phone, message)
        .then(response => {
            res.status(200).json({
                error: false,
                data: {
                    message: 'Pesan terkirim',
                    meta: response,
                },
            });
        })
        .catch(error => {
            res.status(500).json({
                error: true,
                data: {
                    message: 'Error send message',
                    meta: error,
                },
            });
        });
});

server.listen(PORT, () => {
    console.log('App listen on port ', PORT);
});
