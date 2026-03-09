# Only-Zaps

Zap-to-Unlock: Access locked Blossom files by paying with Nostr Wallet Connect (NWC).

## Concept

A "Zap-to-Unlock" micro-app that allows users to access "Locked Blobs" (images, videos, PDFs) stored on Blossom servers by paying with Nostr Wallet Connect (NIP-47).

## How It Works

1. **Fetch**: App fetches a Kind 9420 (File Metadata) event
2. **Preview**: Shows a blurred preview or "Locked" placeholder
3. **Pay**: User clicks "Unlock" → App uses NWC to pay the invoice
4. **Verify**: App listens for Kind 9735 (Zap Receipt)
5. **Unlock**: Once zapped, reveals the Blossom URL or signs Kind 24242 for private servers

## Tech Stack

- **React** - UI framework
- **Tailwind CSS** - Cyberpunk/Minimalist styling
- **@nostr-dev-kit/ndk** - Nostr development kit
- **@nostr-dev-kit/ndk-blossom** - Blossom integration

## NIPs Supported

- **NIP-47** - Nostr Wallet Connect (NWC)
- **NIP-B7** - Blossom (decentralized file storage)
- **Kind 9420** - File Metadata
- **Kind 9735** - Zap Receipt
- **Kind 10063** - Blossom server list
- **Kind 24242** - Blossom Authorization

## Installation

```bash
npm install
npm run dev
```

## Usage

1. Connect your wallet using NWC (paste your `nostr+walletconnect://` URI)
2. Enter a Note ID that contains a Kind 9420 file metadata event
3. Click "Fetch" to see the locked file
4. Set the zap amount and click "Unlock"
5. Once the zap is confirmed, access the file

## Development

### Project Structure

```
src/
├── App.jsx              # Main app component
├── index.css            # Tailwind + custom styles
├── main.jsx             # Entry point
└── hooks/
    └── useBlossom.js    # Blossom integration hook
```

## License

MIT
