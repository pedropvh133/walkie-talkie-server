const KEY = CryptoJS.enc.Utf8.parse("ConexaoSemprePvh133SecureKey2026");
const WS_URL = window.location.protocol === 'https:' ? `wss://${window.location.host}` : `ws://${window.location.host}`;

let socket;
let audioContext;
let recorder;
let processor;
let isAuthorized = false;
let isTalking = false;

// UI Elements
const loginScreen = document.getElementById('loginScreen');
const passwordInput = document.getElementById('passwordInput');
const btnLogin = document.getElementById('btnLogin');
const errorText = document.getElementById('errorText');
const radioScreen = document.getElementById('radioScreen');
const statusText = document.getElementById('statusText');
const statsText = document.getElementById('statsText');
const led = document.getElementById('led');
const pttButton = document.getElementById('pttButton');

// 1. LOGIN LOGIC
window.onload = () => {
    const savedAuth = localStorage.getItem('isAuthorized');
    if (savedAuth === 'true') {
        isAuthorized = true;
        loginScreen.style.display = 'none';
        initApp();
    }
};

btnLogin.onclick = async () => {
    const pass = passwordInput.value.trim();
    if (!pass) return;

    try {
        const response = await fetch(`/verify-password?pass=${pass}`);
        const data = await response.json();

        if (data.status === 'authorized') {
            isAuthorized = true;
            localStorage.setItem('isAuthorized', 'true'); // Lembrar autorização
            loginScreen.style.display = 'none';
            initApp();
        } else {
            errorText.style.display = 'block';
        }
    } catch (e) {
        alert("Erro de conexão com o servidor");
    }
};

function initApp() {
    connectWS();
    initAudio();
    setupPTT();
}

// 2. WEBSOCKET LOGIC
function connectWS() {
    socket = new WebSocket(WS_URL);
    socket.binaryType = 'arraybuffer';

    socket.onopen = () => {
        socket.send("USER_JOIN");
    };

    socket.onmessage = (event) => {
        if (typeof event.data === 'string') {
            handleStatusMessage(event.data);
        } else {
            playAudio(event.data);
        }
    };

    socket.onclose = () => {
        setTimeout(connectWS, 3000);
    };
}

function handleStatusMessage(text) {
    if (text === 'TALK_START') {
        radioScreen.classList.add('active');
        led.classList.add('active');
        statusText.innerText = 'ALGUÉM ESTÁ FALANDO...';
    } else if (text === 'TALK_STOP') {
        radioScreen.classList.remove('active');
        led.classList.remove('active');
        statusText.innerText = 'DISPONÍVEL';
    } else if (text.startsWith('{')) {
        try {
            const data = JSON.parse(text);
            if (data.type === 'STATS_UPDATE') {
                statsText.innerText = `${data.totalInstalls}/${data.onlineUsers}`;
            }
        } catch (e) {}
    }
}

// 3. AUDIO LOGIC
async function initAudio() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });

        // Resume context on first interaction (Safari requirement)
        document.body.addEventListener('touchstart', () => {
            if (audioContext.state === 'suspended') audioContext.resume();
        }, { once: true });

    } catch (e) {
        console.error("Audio API não suportada", e);
    }
}

function playAudio(arrayBuffer) {
    if (!audioContext || isTalking) return;

    // 1. Decrypt
    const encryptedWa = CryptoJS.lib.WordArray.create(new Uint8Array(arrayBuffer));
    const decrypted = CryptoJS.AES.decrypt({ ciphertext: encryptedWa }, KEY, { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.NoPadding });

    // 2. Convert to Int16
    const decryptedUint8 = waToUint8(decrypted);
    const int16Buffer = new Int16Array(decryptedUint8.buffer);

    // 3. Convert Int16 to Float32 for Web Audio
    const float32Buffer = new Float32Array(int16Buffer.length);
    for (let i = 0; i < int16Buffer.length; i++) {
        float32Buffer[i] = int16Buffer[i] / 32768.0;
    }

    // 4. Play
    const buffer = audioContext.createBuffer(1, float32Buffer.length, 16000);
    buffer.getChannelData(0).set(float32Buffer);
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start();
}

async function startRecording() {
    if (!audioContext) return;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recorder = audioContext.createMediaStreamSource(stream);
    processor = audioContext.createScriptProcessor(2048, 1, 1);

    processor.onaudioprocess = (e) => {
        if (!isTalking) return;

        const float32 = e.inputBuffer.getChannelData(0);
        // Convert to Int16
        const int16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
            int16[i] = Math.max(-1, Math.min(1, float32[i])) * 32767;
        }

        // Encrypt and Send
        const wa = CryptoJS.lib.WordArray.create(int16.buffer);
        const encrypted = CryptoJS.AES.encrypt(wa, KEY, { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.NoPadding });
        const encryptedUint8 = waToUint8(encrypted.ciphertext);

        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(encryptedUint8.buffer);
        }
    };

    recorder.connect(processor);
    processor.connect(audioContext.destination);
}

function stopRecording() {
    if (processor) {
        processor.disconnect();
        recorder.disconnect();
        processor = null;
        recorder = null;
    }
}

// 4. PTT UI LOGIC
function setupPTT() {
    const start = (e) => {
        e.preventDefault();
        if (isTalking) return;
        isTalking = true;
        pttButton.classList.add('pressed');
        pttButton.innerText = 'TRANSMITINDO...';
        radioScreen.classList.add('active');
        statusText.innerText = 'TRANSMITINDO...';

        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send("TALK_START");
        }
        startRecording();
    };

    const stop = (e) => {
        e.preventDefault();
        if (!isTalking) return;
        isTalking = false;
        pttButton.classList.remove('pressed');
        pttButton.innerText = 'FALAR';
        radioScreen.classList.remove('active');
        statusText.innerText = 'DISPONÍVEL';

        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send("TALK_STOP");
        }
        stopRecording();
    };

    pttButton.addEventListener('touchstart', start);
    pttButton.addEventListener('touchend', stop);
    pttButton.addEventListener('mousedown', start);
    pttButton.addEventListener('mouseup', stop);
}

// UTILS
function waToUint8(wordArray) {
    const len = wordArray.sigBytes;
    const words = wordArray.words;
    const result = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        result[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
    }
    return result;
}
