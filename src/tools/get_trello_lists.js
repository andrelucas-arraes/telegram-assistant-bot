const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const fetch = global.fetch;

const API_KEY = process.env.TRELLO_API_KEY;
const TOKEN = process.env.TRELLO_TOKEN;
const BOARD_ID = process.argv[2] || 'Xya2I2jb'; // Default to the user's board

if (!API_KEY || !TOKEN) {
    console.error('❌ Erro: TRELLO_API_KEY e TRELLO_TOKEN precisam estar no arquivo .env');
    process.exit(1);
}

async function getLists() {
    console.log(`🔍 Buscando listas do quadro ${BOARD_ID}...`);

    // Trello needs the "long" ID or short ID usually works for boards, let's try short first.
    // If getting lists from a board, endpoint is /1/boards/{id}/lists
    const url = `https://api.trello.com/1/boards/${BOARD_ID}/lists?key=${API_KEY}&token=${TOKEN}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(await response.text());
        }
        const lists = await response.json();

        console.log('\n✅ Listas encontradas:');
        console.log('------------------------------------------------');
        lists.forEach(list => {
            console.log(`📌 NOME: ${list.name}`);
            console.log(`   ID:   ${list.id}`);
            console.log('------------------------------------------------');
        });

        console.log('\n👉 Copie o ID da lista desejada (ex: "A fazer")');
        console.log('👉 Cole no arquivo .env na variável TRELLO_LIST_ID_INBOX');

    } catch (error) {
        console.error('❌ Erro ao buscar listas:', error.message);
    }
}

getLists();
