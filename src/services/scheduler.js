const cron = require('node-cron');
const { DateTime } = require('luxon');
const googleService = require('./google');
const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, '../../scheduler_cache.json');

// Cache em memória
let memoryCache = {
    events: [],
    tasks: [],
    lastUpdate: null
};

// Cache para evitar notificações duplicadas (EventID -> Timestamp)
const notifiedEvents = new Set();

// --- PERSISTÊNCIA (SALVAR/LER DISCO) ---

function saveCacheToDisk() {
    try {
        fs.writeFileSync(CACHE_FILE, JSON.stringify(memoryCache, null, 2));
    } catch (e) {
        console.error('❌ Erro ao salvar cache no disco:', e.message);
    }
}

function loadCacheFromDisk() {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const data = fs.readFileSync(CACHE_FILE);
            memoryCache = JSON.parse(data);
            console.log(`📂 Cache carregado do disco! (${memoryCache.events.length} eventos, ${memoryCache.tasks.length} tarefas)`);

            // Verifica se está muito velho (ex: mais de 2 horas)
            const lastUpdate = DateTime.fromISO(memoryCache.lastUpdate);
            const diff = DateTime.now().diff(lastUpdate, 'hours').hours;
            if (diff > 2) {
                console.log('⚠️ Cache antigo (> 2h). Forçando atualização em breve...');
                refreshDataCache();
            }
        }
    } catch (e) {
        console.error('⚠️ Erro ao ler cache do disco (iniciando vazio).');
    }
}

// --- ATUALIZAÇÃO ---

async function refreshDataCache() {
    try {
        console.log('🔄 Atualizando cache de DADOS (1x/hora)...');
        const now = DateTime.now().setZone('America/Sao_Paulo');

        // 1. Eventos (próximas 12h)
        const end = now.plus({ hours: 12 });
        const events = await googleService.listEvents(now.toISO(), end.toISO());

        // 2. Tarefas
        const tasks = await googleService.listTasks();

        // 3. Salva
        memoryCache.events = events;
        memoryCache.tasks = tasks;
        memoryCache.lastUpdate = now.toISO();

        console.log(`✅ Dados atualizados: ${events.length} eventos, ${tasks.length} tarefas.`);
        saveCacheToDisk();

    } catch (error) {
        console.error('❌ Erro no refresh:', error.message);
    }
}

function initScheduler(bot) {
    const chatIds = (process.env.ALLOWED_CHAT_IDS || '').split(',').map(id => id.trim()).filter(id => id);

    if (chatIds.length === 0) return;

    console.log('⏰ Scheduler PERSISTENTE iniciado...');

    // 1. Tenta carregar do disco primeiro
    loadCacheFromDisk();

    // 2. Se vazio ou sem tarefas, busca agora
    if (memoryCache.events.length === 0 && memoryCache.tasks.length === 0) {
        refreshDataCache();
    }

    // ============================================
    // CRON 1: ATUALIZADOR DE CACHE (A cada 1 HORA)
    // ============================================
    cron.schedule('0 * * * *', () => {
        refreshDataCache();
    });

    // ============================================
    // CRON 2: RESUMO DIÁRIO (08:00)
    // ============================================
    cron.schedule('0 8 * * *', async () => {
        await refreshDataCache(); // Garante frescor

        const now = DateTime.now().setZone('America/Sao_Paulo');
        const todayStr = now.toFormat('yyyy-MM-dd');

        // Filtra eventos de HOJE
        const todaysEvents = memoryCache.events.filter(e => {
            return (e.start.dateTime && e.start.dateTime.startsWith(todayStr)) ||
                (e.start.date && e.start.date === todayStr);
        });

        let msg = `☀️ *Bom dia! Resumo de hoje (${now.toFormat('dd/MM')}):*\n\n`;

        if (todaysEvents.length === 0 && memoryCache.tasks.length === 0) {
            msg += '🎉 Nada agendado.';
        } else {
            if (todaysEvents.length > 0) {
                msg += `📅 *Compromissos:*\n`;
                todaysEvents.forEach(e => {
                    const time = DateTime.fromISO(e.start.dateTime || e.start.date).setZone('America/Sao_Paulo');
                    const timeStr = e.start.date ? 'Dia todo' : time.toFormat('HH:mm');
                    msg += `   ▪️ ${timeStr} - ${e.summary}\n`;
                });
            }
            if (memoryCache.tasks.length > 0) {
                msg += `\n📝 *Pendências:*\n`;
                memoryCache.tasks.slice(0, 5).forEach(t => msg += `   ▫️ ${t.title}\n`);
            }
        }

        chatIds.forEach(id => bot.telegram.sendMessage(id, msg, { parse_mode: 'Markdown' }).catch(e => { }));
    }, { timezone: "America/Sao_Paulo" });

    // ============================================
    // CRON 3: ALERTA DE TAREFAS (14:00) - NOVO!
    // ============================================
    cron.schedule('0 14 * * *', async () => {
        // Usa o cache (custo zero de API neste momento se já rodou o da hora, ou 1 call se coincidir)
        // Mas como atualiza na virada da hora, às 14:00 o cache das 14:00 já deve ter rodado ou roda junto.
        const tasks = memoryCache.tasks;

        if (tasks.length > 0) {
            let msg = `🕑 *Check das 14h:*\nVocê ainda tem *${tasks.length} tarefas* pendentes.\n\n`;
            tasks.slice(0, 5).forEach(t => msg += `🔴 ${t.title}\n`);
            msg += `\n_Força!_ 💪`;

            chatIds.forEach(id => bot.telegram.sendMessage(id, msg, { parse_mode: 'Markdown' }).catch(e => { }));
        }
    }, { timezone: "America/Sao_Paulo" });

    // ============================================
    // CRON 4: MONITOR LOCAL (Minuto a Minuto)
    // ============================================
    cron.schedule('* * * * *', async () => {
        const now = DateTime.now().setZone('America/Sao_Paulo');

        for (const event of memoryCache.events) {
            if (!event.start.dateTime) continue;

            const startTime = DateTime.fromISO(event.start.dateTime).setZone('America/Sao_Paulo');
            const diffMinutes = startTime.diff(now, 'minutes').minutes;

            if (diffMinutes >= 14 && diffMinutes <= 15.5 && !notifiedEvents.has(event.id)) {

                const msg = `🔔 *Daqui a 15 min:*\n👉 ${event.summary}`;
                const kb = event.hangoutLink
                    ? { inline_keyboard: [[{ text: "📹 Entrar", url: event.hangoutLink }]] }
                    : undefined;

                chatIds.forEach(id => bot.telegram.sendMessage(id, msg, { parse_mode: 'Markdown', reply_markup: kb }).catch(e => { }));

                notifiedEvents.add(event.id);
            }
        }
    }, { timezone: "America/Sao_Paulo" });
}

module.exports = { initScheduler, refreshEventsCache: refreshDataCache };
