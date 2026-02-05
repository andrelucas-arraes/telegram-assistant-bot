const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { DateTime } = require('luxon');

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const PROMPT_PATH = path.join(__dirname, '../prompts/classifier.txt');

// --- Simple In-Memory Session Storage ---
// Format: { userId: [ { role: 'user', parts: [...] }, { role: 'model', parts: [...] } ] }
const userSessions = {};

const MAX_HISTORY_LENGTH = 10; // Keep last 10 turns (user + model) to save context window

function getSystemPrompt() {
    let promptTemplate = fs.readFileSync(PROMPT_PATH, 'utf-8');
    const now = DateTime.now().setZone('America/Sao_Paulo');

    return promptTemplate
        .replace('{{CURRENT_DATE}}', now.toFormat('yyyy-MM-dd'))
        .replace('{{CURRENT_WEEKDAY}}', now.setLocale('pt-BR').toFormat('cccc'))
        .replace('{{CURRENT_YEAR}}', now.year.toString());
}

async function interpretMessage(text, userId) {
    try {
        const promptSystem = getSystemPrompt();

        // Initialize history if new user
        if (!userSessions[userId]) {
            userSessions[userId] = [];
        }

        // Construct standard starting history with System Prompt
        // Gemini API usually prefers System Instructions separately in newer versions, 
        // but passing it as the first User message effectively sets the behavior.
        // To maintain context, we append the specific user history after the system instruction.

        const history = [
            {
                role: "user",
                parts: [{ text: promptSystem }],
            },
            {
                role: "model",
                parts: [{ text: "Entendido. Atuarei como seu assistente inteligente e responderei apenas com JSON." }],
            }
        ];

        // Append recent user history (avoiding duplicating system prompt logic)
        // We only append the actual conversation turns, not previous system prompts.
        history.push(...userSessions[userId]);

        const generationConfig = {
            temperature: 0.2, // Slightly higher creative for chat, but still focused for JSON
            responseMimeType: "application/json",
        };

        const chat = model.startChat({
            generationConfig,
            history: history,
        });

        const result = await chat.sendMessage(text);
        const responseText = result.response.text();

        console.log(`[AI] Response for ${userId}:`, responseText);

        // Update User History
        // We save the USER message and the MODEL response
        userSessions[userId].push(
            { role: "user", parts: [{ text: text }] },
            { role: "model", parts: [{ text: responseText }] }
        );

        // Prune history
        if (userSessions[userId].length > MAX_HISTORY_LENGTH * 2) {
            userSessions[userId] = userSessions[userId].slice(-(MAX_HISTORY_LENGTH * 2));
        }

        const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanJson);

    } catch (error) {
        console.error('Erro na AI (Gemini):', error);
        return {
            tipo: 'neutro',
            message: 'Desculpe, tive um problema técnico. Tente novamente?'
        };
    }
}

module.exports = { interpretMessage };
