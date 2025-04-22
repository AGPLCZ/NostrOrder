// 📁 read.js
import { NostrClient } from './js/nostr/NostrClient.js';
import { displayMessage } from './js/ui/render.js';
import { saveMessage, getMessages, syncMessages } from './js/storage/messageStore.js';

// Konfigurace
const PRIVATE_KEY = "e0b6b02c0d9d55286c9486a5f402f95661ab1c829eec032157a4d59e7e5eb3f7";
const PEER_NPUB = "npub1jv32mgkzf8nq9h09m4jae8dkk3vxpzr0vn44p7tkztm837c8rf0s6a370t";

// Inicializuj klienta
const client = new NostrClient(PRIVATE_KEY, [
  "wss://relay.damus.io",
  "wss://relay.snort.social",
  "wss://nos.lol"
]);

const MY_PUBKEY = client.getPubkey();

// Zobraz uložené zprávy z IndexedDB
async function loadStoredMessages() {
  const peerHex = await client.npubToHex(PEER_NPUB);
  const messages = await getMessages(peerHex);

  for (const msg of messages) {
    const incoming = msg.sender !== MY_PUBKEY;
    displayMessage(msg.content, incoming, msg.createdAt);
  }
}

// Nové zprávy ze sítě
await syncMessages(client, await client.npubToHex(PEER_NPUB), async (text, event) => {
  const incoming = event.pubkey !== MY_PUBKEY;
  displayMessage(text, incoming, event.created_at);
});

// Připojení
client.connect();
loadStoredMessages();
