// js/nostr/NostrSender.js

import {
    nip04,
    getEventHash,
    getPublicKey,
    getSignature
  } from 'https://cdn.jsdelivr.net/npm/nostr-tools@1.15.0/+esm';
  import { bytesToHex } from 'https://cdn.jsdelivr.net/npm/@noble/hashes@1.3.0/utils/+esm';
  
  export class NostrSender {
    constructor(privateKey, relayURLs) {
      this.privateKey = privateKey;
      this.publicKey = getPublicKey(privateKey);
      this.relayURLs = relayURLs;
    }
  
    async npubToHex(npub) {
      const { bech32 } = await import('https://cdn.jsdelivr.net/npm/bech32@2.0.0/+esm');
      const { prefix, words } = bech32.decode(npub);
      if (prefix !== 'npub') throw new Error("Invalid npub format");
      const raw32 = bech32.fromWords(words);
      if (raw32.length !== 32) throw new Error("Invalid npub length");
      return bytesToHex(Uint8Array.from(raw32));
    }
  
    async send(message, recipientNpub, onDisplay = null) {
      if (!message || !recipientNpub) throw new Error("Message or recipient is empty");
  
      const recipientHex = await this.npubToHex(recipientNpub);
      const encryptedContent = await nip04.encrypt(this.privateKey, recipientHex, message);
  
      const event = {
        kind: 4,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["p", recipientHex]],
        content: encryptedContent,
        pubkey: this.publicKey,
      };
  
      event.id = getEventHash(event);
      event.sig = getSignature(event, this.privateKey);
  
      for (let url of this.relayURLs) {
        try {
          const ws = new WebSocket(url);
          ws.onopen = () => {
            ws.send(JSON.stringify(["EVENT", event]));
            console.log(`Sent to ${url}`);
            if (onDisplay) onDisplay(message);
          };
          ws.onerror = err => console.warn(`WS error at ${url}:`, err);
          ws.onclose = ev => console.log(`Closed ${url}: code=${ev.code}`);
        } catch (e) {
          console.warn(`Failed to open WS ${url}:`, e);
        }
      }
    }
  
    getPublicKey() {
      return this.publicKey;
    }
  
    getPrivateKey() {
      return this.privateKey;
    }
  }
  