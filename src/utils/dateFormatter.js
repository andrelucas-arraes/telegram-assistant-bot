/**
 * Formatador de Datas Amigável
 * Converte datas ISO para formatos humanizados em português
 */

const { DateTime } = require('luxon');

const config = require('../config');

const TIMEZONE = config.timezone;

/**
 * Formata uma data/hora de forma amigável
 * @param {string} isoDate - Data em formato ISO
 * @param {Object} options - Opções de formatação
 * @returns {string}
 */
function formatFriendlyDate(isoDate, options = {}) {
    if (!isoDate) return '';

    const {
        showTime = true,
        showYear = false,
        relative = true
    } = options;

    const date = DateTime.fromISO(isoDate, { zone: TIMEZONE });
    const now = DateTime.now().setZone(TIMEZONE);

    // Verifica se é all-day event (sem 'T')
    const isAllDay = !isoDate.includes('T');

    // Parte da data
    let datePart = '';

    if (relative) {
        const diffDays = date.startOf('day').diff(now.startOf('day'), 'days').days;

        if (diffDays === 0) {
            datePart = 'Hoje';
        } else if (diffDays === 1) {
            datePart = 'Amanhã';
        } else if (diffDays === -1) {
            datePart = 'Ontem';
        } else if (diffDays > 1 && diffDays <= 6) {
            // Próximos dias da semana
            datePart = capitalizeFirst(date.setLocale('pt-BR').toFormat('cccc'));
        } else if (diffDays > 6 && diffDays <= 13) {
            // Próxima semana
            datePart = `${capitalizeFirst(date.setLocale('pt-BR').toFormat('cccc'))} que vem`;
        } else {
            // Data completa
            datePart = date.toFormat('dd/MM');
            if (showYear || date.year !== now.year) {
                datePart += `/${date.year}`;
            }
        }
    } else {
        datePart = date.toFormat('dd/MM');
        if (showYear || date.year !== now.year) {
            datePart += `/${date.year}`;
        }
    }

    // Parte do horário
    if (isAllDay) {
        return `${datePart} (dia todo)`;
    }

    if (showTime) {
        const timePart = date.toFormat('HH:mm');
        // Remove minutos se for hora cheia
        const friendlyTime = timePart.endsWith(':00')
            ? date.toFormat('H\'h\'')
            : date.toFormat('H\'h\'mm');

        return `${datePart} às ${friendlyTime}`;
    }

    return datePart;
}

/**
 * Formata intervalo de tempo
 * @param {string} startIso - Data/hora de início
 * @param {string} endIso - Data/hora de fim
 * @returns {string}
 */
function formatTimeRange(startIso, endIso) {
    if (!startIso) return '';

    const start = DateTime.fromISO(startIso, { zone: TIMEZONE });
    const end = endIso ? DateTime.fromISO(endIso, { zone: TIMEZONE }) : null;

    const isAllDay = !startIso.includes('T');

    if (isAllDay) {
        return 'Dia todo';
    }

    const startTime = start.toFormat('HH:mm');

    if (!end) {
        return startTime;
    }

    const endTime = end.toFormat('HH:mm');
    return `${startTime} - ${endTime}`;
}

/**
 * Retorna quanto tempo falta para um evento
 * @param {string} isoDate - Data em formato ISO
 * @returns {string}
 */
function getTimeUntil(isoDate) {
    if (!isoDate) return '';

    const date = DateTime.fromISO(isoDate, { zone: TIMEZONE });
    const now = DateTime.now().setZone(TIMEZONE);

    const diff = date.diff(now, ['days', 'hours', 'minutes']);

    if (diff.days > 0) {
        return `em ${Math.floor(diff.days)} dia(s)`;
    } else if (diff.hours > 0) {
        return `em ${Math.floor(diff.hours)}h`;
    } else if (diff.minutes > 0) {
        return `em ${Math.floor(diff.minutes)} min`;
    } else if (diff.minutes > -5) {
        return 'agora';
    } else {
        return 'passou';
    }
}

/**
 * Determina o emoji de status baseado no tempo até o evento
 * @param {Object} event - Objeto do evento
 * @returns {string}
 */
function getEventStatusEmoji(event) {
    // 1. PRIMEIRO verifica conclusão (máxima prioridade)
    if (event.summary?.startsWith('✅')) {
        return '✅';
    }

    const emojis = [];

    // 2. Status baseado em tempo (adiciona no início)
    if (event.start?.dateTime) {
        const start = DateTime.fromISO(event.start.dateTime, { zone: TIMEZONE });
        const now = DateTime.now().setZone(TIMEZONE);
        const diffMinutes = start.diff(now, 'minutes').minutes;

        if (diffMinutes < 0) {
            // Já passou ou em andamento
            emojis.push('⏸️');
        } else if (diffMinutes <= 60) {
            // Próximo (menos de 1h)
            emojis.push('🟡');
        } else {
            // Confirmado/futuro
            emojis.push('🟢');
        }
    } else {
        // All-day event
        emojis.push('📆');
    }

    // 3. DEPOIS adiciona modificadores
    if (event.hangoutLink || event.conferenceData) {
        emojis.push('📹');
    }

    if (event.recurringEventId) {
        emojis.push('🔄');
    }

    return emojis.join(' ');
}

/**
 * Formata evento completo para exibição
 * @param {Object} event - Objeto do evento do Google Calendar
 * @returns {string}
 */
function formatEventForDisplay(event) {
    const emoji = getEventStatusEmoji(event);
    const time = formatFriendlyDate(event.start?.dateTime || event.start?.date);
    const title = event.summary || 'Sem título';

    let result = `${emoji} ${time} - ${title}`;

    // Adiciona localização se houver
    if (event.location) {
        result += `\n   📍 ${event.location}`;
    }

    return result;
}

/**
 * Capitaliza a primeira letra
 * @param {string} str 
 * @returns {string}
 */
function capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

module.exports = {
    formatFriendlyDate,
    formatTimeRange,
    getTimeUntil,
    getEventStatusEmoji,
    formatEventForDisplay,
    capitalizeFirst
};
