/**
 * MINI ROBÔ DE MANUTENÇÃO - CONEXÃO SEMPRE
 * Este script serve para manter o servidor do Render acordado.
 * Ele faz uma requisição leve a cada 5 minutos.
 *
 * Como usar:
 * 1. Você pode rodar este script em qualquer lugar que tenha Node.js instalado.
 * 2. Comando: node robot.js
 */

const https = require('https');

const URL = 'https://conexao-sempre.onrender.com/ping';
const INTERVALO = 5 * 60 * 1000; // 5 minutos

function acordarServidor() {
    const agora = new Date().toLocaleTimeString();
    console.log(`[${agora}] Robô: Cutucando o servidor para não dormir...`);

    https.get(URL, (res) => {
        if (res.statusCode === 200) {
            console.log(`[${agora}] Servidor respondeu: PONG (Acordado)`);
        } else {
            console.log(`[${agora}] Servidor respondeu com erro: ${res.statusCode}`);
        }
    }).on('error', (err) => {
        console.error(`[${agora}] Erro ao tentar acordar o servidor:`, err.message);
    });
}

// Inicia o ciclo
console.log("Robô de manutenção iniciado em 'marcha lenta'...");
acordarServidor(); // Primeira execução imediata
setInterval(acordarServidor, INTERVALO);
