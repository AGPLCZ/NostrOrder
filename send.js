// 📁 js/send.js
import { NostrSender } from './js/nostr/NostrSender.js';
import { saveMessage, getMessages } from './js/storage/messageStore.js';
import { NostrClient } from './js/nostr/old_NostrClient.js'; // kvůli npubToHex

const PRIVATE_KEY = "e0b6b02c0d9d55286c9486a5f402f95661ab1c829eec032157a4d59e7e5eb3f7";
const sender = new NostrSender(PRIVATE_KEY, [
  "wss://relay.snort.social",
  "wss://nos.lol",
  "wss://relay.damus.io"
]);

const helperClient = new NostrClient(PRIVATE_KEY, []); // bez připojení, jen kvůli převodu klíčů

function displayMessage(text, outgoing = false, timestamp = null) {
  const ul = document.getElementById("chatMessages");
  const li = document.createElement("li");
  li.className = "mb-2 d-flex " + (outgoing ? "justify-content-end" : "justify-content-start");
  const bubble = document.createElement("div");
  bubble.className = "p-2 rounded msg-bubble small " + (outgoing ? "msg-outgoing" : "msg-incoming");
  bubble.textContent = text;

  if (timestamp) {
    const time = document.createElement("div");
    const t = new Date(timestamp * 1000);
    time.className = "text-muted small mt-1 text-end";
    time.textContent = t.toLocaleTimeString();
    bubble.appendChild(document.createElement("br"));
    bubble.appendChild(time);
  }

  li.appendChild(bubble);
  ul.appendChild(li);
  document.getElementById("chatWindow").scrollTop = document.getElementById("chatWindow").scrollHeight;
}

async function loadStoredMessages() {
  const npub = document.getElementById("recipient").value.trim();
  const recipientHex = await helperClient.npubToHex(npub);
  const messages = await getMessages(recipientHex);
  messages.forEach(m => displayMessage(m.content, m.sender !== recipientHex, m.createdAt));
}

// načteme po načtení stránky
loadStoredMessages();

document.getElementById("sendBtn").addEventListener("click", async () => {
  const text = document.getElementById("messageInput").value.trim();
  const npub = document.getElementById("recipient").value.trim();

  if (!text || !npub) return;

  try {
    const recipientHex = await helperClient.npubToHex(npub);
    const event = await sender.send(text, npub, msg => displayMessage(msg, true));

    // Uložení odeslané zprávy
    await saveMessage(event, text, recipientHex);
    document.getElementById("messageInput").value = "";
  } catch (err) {
    console.error("❌ Send error:", err);
  }
});
