// 📁 js/nostr/NostrClient.js

import * as secp from 'https://cdn.jsdelivr.net/npm/@noble/secp256k1@2.2.3/+esm';
import { sha256 } from 'https://cdn.jsdelivr.net/npm/@noble/hashes@1.3.0/sha256/+esm';
import { hmac } from 'https://cdn.jsdelivr.net/npm/@noble/hashes@1.3.0/hmac/+esm';
import { hexToBytes, bytesToHex } from 'https://cdn.jsdelivr.net/npm/@noble/hashes@1.3.0/utils/+esm';
import { nip04, getPublicKey } from 'https://cdn.jsdelivr.net/npm/nostr-tools@1.15.0/+esm';
import { bech32 } from 'https://cdn.jsdelivr.net/npm/bech32@2.0.0/+esm';


// Inject HMAC-SHA256 (required for getSharedSecret inside nip04)
secp.utils.hmacSha256Sync = (key, ...msgs) => {
  const h = hmac.create(sha256, key);
  for (let m of msgs) h.update(m);
  return h.digest();
};

/**
 * NostrClient is a universal, low-dependency interface for connecting to Nostr relays.
 * It supports subscribing, sending encrypted messages (kind:4), and basic event hooks.
 */
export class NostrClient {
  constructor(privateKey, relayURLs) {
    this.privateKey = privateKey;
    this.relayURLs = relayURLs;
    this.pubkey = getPublicKey(privateKey); // x-only hex
    this.sockets = [];
    this.eventHandlers = [];
    this.messageHandlers = [];
    this.openHandlers = [];
    this.decryptedHandlers = [];
    this.reconnectDelay = 3000; // 3 seconds
  }

  /**
   * Opens WebSocket connections to all provided relay URLs.
   */
  connect() {
    this.disconnect(); // ensure no duplicates

    this.relayURLs.forEach(url => {
      try {
        const ws = new WebSocket(url);
        ws.onopen = () => {
          console.log(`Connected to ${url}`);
          this.openHandlers.forEach(cb => cb(url, ws));
        };
        ws.onmessage = msg => {
          try {
            const data = JSON.parse(msg.data);
            this.messageHandlers.forEach(cb => cb(url, data));

            if (data[0] === "EVENT" && data[2]?.content?.includes("?iv=")) {
              this._handleDecryption(data[2]);
            }
          } catch (e) {
            console.warn("Message parse error:", e);
          }
        };
        ws.onerror = err => console.warn(`WS error at ${url}:`, err);
        ws.onclose = () => {
          console.log(`🔌 WS closed: ${url}`);
          setTimeout(() => {
            console.log(`Reconnecting to ${url}...`);
            this.connect();
          }, this.reconnectDelay);
        };
        this.sockets.push(ws);
      } catch (e) {
        console.error(`Failed to open WS for ${url}:`, e);
      }
    });
  }

  /**
   * Closes all WebSocket connections.
   */
  disconnect() {
    this.sockets.forEach(ws => {
      if (ws.readyState === 0 || ws.readyState === 1) ws.close();
    });
    this.sockets = [];
  }

  /**
   * Sends a subscription request to all open WebSocket connections.
   */
  async subscribe(filter) {
    const payload = JSON.stringify(["REQ", "sub1", filter]);
    for (const ws of this.sockets) {
      if (ws.readyState !== 1) {
        await new Promise(resolve => {
          const interval = setInterval(() => {
            if (ws.readyState === 1) {
              clearInterval(interval);
              resolve();
            }
          }, 50);
        });
      }
      try {
        ws.send(payload);
      } catch (e) {
        console.error("Subscription send failed:", e);
      }
    }
  }

  /**
   * Sends a prepared Nostr event to all relays.
   */
  sendEvent(event) {
    const payload = JSON.stringify(["EVENT", event]);
    this.sockets.forEach(ws => {
      try {
        ws.send(payload);
      } catch (e) {
        console.warn("Failed to send event:", e);
      }
    });
  }

  /**
   * Adds a handler for decrypted events (kind 4).
   */
  onDecrypted(callback) {
    this.decryptedHandlers.push(callback);
  }

  /**
   * Adds a handler for raw relay messages.
   */
  onMessage(callback) {
    this.messageHandlers.push(callback);
  }

  /**
   * Adds a handler when a WebSocket connection is opened.
   */
  onConnect(callback) {
    this.openHandlers.push(callback);
  }

  /**
   * Legacy shortcut for subscribing and handling kind:4 decrypts.
   */
  on({ minutes = 60, kind = 4, pubkey = this.pubkey, onDecrypted = null } = {}) {
    const filter = {
      kinds: [kind],
      since: Math.floor(Date.now() / 1000) - minutes * 60,
      "#p": [pubkey]
    };
    this.onConnect(() => this.subscribe(filter));
    if (onDecrypted) this.onDecrypted(onDecrypted);
  }

  /**
   * Handles decrypting kind:4 messages and dispatching.
   */
  

  async _handleDecryption(event) {
    try {
      const [ciphertext, iv] = event.content.split("?iv=");
      console.log("🔍 Decryption attempt:", {
        from: event.pubkey,
        ciphertextBase64: ciphertext,
        ivBase64: iv,
        rawContent: event.content
      });
  
  
  
      const plaintext = await nip04.decrypt(this.privateKey, event.pubkey, event.content);
      this.decryptedHandlers.forEach(cb => cb(plaintext, event));
    } catch (e) {
      console.warn("❌ Decryption failed:", e);
    }
  }
  

  

  /**
   * Returns the public key (x-only hex).
   */
  getPubkey() {
    return this.pubkey;
  }

  /**
   * Returns the private key (hex).
   */
  getPrivateKey() {
    return this.privateKey;
  }

  /**
   * Decrypts a NIP-04 message from given sender.
   */
  async decrypt(senderPubkey, content) {
    return await nip04.decrypt(this.privateKey, senderPubkey, content);
  }

  /**
   * Encrypts a NIP-04 message to given recipient.
   */
  async encrypt(recipientPubkey, message) {
    return await nip04.encrypt(this.privateKey, recipientPubkey, message);
  }


  async npubToHex(npub) {
    const { prefix, words } = bech32.decode(npub);
    if (prefix !== 'npub') throw new Error("Invalid npub address");
    const raw32 = bech32.fromWords(words);
    if (raw32.length !== 32) throw new Error("Invalid npub length");
    return bytesToHex(Uint8Array.from(raw32));
  }
}