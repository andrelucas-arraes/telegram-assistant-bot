/**
 * Batch Processor Utility
 * Processa itens em lotes para evitar rate limiting das APIs
 */

const { log } = require('./logger');

/**
 * Processa itens em batches com delay entre eles
 * @param {Array} items - Array de itens para processar
 * @param {Function} fn - Função assíncrona a ser aplicada em cada item
 * @param {number} batchSize - Número de itens por batch (default: 10)
 * @param {number} delayMs - Delay em ms entre batches (default: 1000)
 * @returns {Promise<Array>} - Array de resultados
 */
async function batchProcess(items, fn, batchSize = 10, delayMs = 1000) {
    const results = [];
    const totalBatches = Math.ceil(items.length / batchSize);

    log.debug('Iniciando batch processing', {
        totalItems: items.length,
        batchSize,
        totalBatches
    });

    for (let i = 0; i < items.length; i += batchSize) {
        const batchNumber = Math.floor(i / batchSize) + 1;
        const batch = items.slice(i, i + batchSize);

        log.debug(`Processando batch ${batchNumber}/${totalBatches}`, {
            itemsInBatch: batch.length
        });

        try {
            const batchResults = await Promise.all(batch.map(fn));
            results.push(...batchResults);
        } catch (error) {
            log.error(`Erro no batch ${batchNumber}`, { error: error.message });
            // Continua com próximo batch ao invés de parar tudo
            // Pode-se adicionar os erros ao resultado se necessário
        }

        // Delay entre batches (não aplica no último)
        if (i + batchSize < items.length) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    log.debug('Batch processing concluído', {
        totalProcessed: results.length
    });

    return results;
}

/**
 * Processa itens em batches com progresso callback
 * @param {Array} items - Array de itens para processar
 * @param {Function} fn - Função assíncrona a ser aplicada em cada item
 * @param {Object} options - Opções de configuração
 * @param {number} options.batchSize - Número de itens por batch (default: 10)
 * @param {number} options.delayMs - Delay em ms entre batches (default: 1000)
 * @param {Function} options.onProgress - Callback de progresso (batchNum, totalBatches, processed)
 * @returns {Promise<Object>} - { results, errors }
 */
async function batchProcessWithProgress(items, fn, options = {}) {
    const {
        batchSize = 10,
        delayMs = 1000,
        onProgress = null
    } = options;

    const results = [];
    const errors = [];
    const totalBatches = Math.ceil(items.length / batchSize);

    for (let i = 0; i < items.length; i += batchSize) {
        const batchNumber = Math.floor(i / batchSize) + 1;
        const batch = items.slice(i, i + batchSize);

        try {
            const batchResults = await Promise.allSettled(batch.map(fn));

            batchResults.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    results.push(result.value);
                } else {
                    errors.push({
                        item: batch[index],
                        error: result.reason?.message || 'Unknown error'
                    });
                }
            });

            if (onProgress) {
                onProgress(batchNumber, totalBatches, results.length);
            }
        } catch (error) {
            log.error(`Erro no batch ${batchNumber}`, { error: error.message });
        }

        // Delay entre batches (não aplica no último)
        if (i + batchSize < items.length) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    return { results, errors };
}

module.exports = {
    batchProcess,
    batchProcessWithProgress
};
