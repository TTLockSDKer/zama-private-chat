# Private Homomorphic Encrypted Chat (FHE Encrypted Chat)

## Contract Addresses
- **Wallet Module (Banking)**: `0x426aeB7c23aE32d4094C469dae7441E9bE567Bc9`
- **Messaging Module**: `0x9a3183030840Deb55E30653975518409785C76D0`

A fully decentralized private encrypted chat built with Zama FHE. From data generation to on-chain storage and retrieval, all computation happens in the ciphertext domain. The frontend only decrypts locally when authorization is satisfied, achieving true end-to-end privacy.

## Core Features

- **End-to-end message encryption/decryption**
  - The frontend uses the Zama FHE SDK to generate keys and create EIP‑712 authorization signatures; only encrypted handles are stored on-chain.
  - Only message participants (sender/recipient) can perform user decryption; neither third parties nor the contract itself can learn the plaintext.

- **Encrypted deposits and private balances**
  - Deposits and balances are stored and computed as encrypted types (euint64); querying and decryption are done locally on the client.
  - All funds-related reads/writes run in the ciphertext domain, protecting both account and amount privacy.

- **Red packets**
  - Red packet creation, amount, and state are computed on-chain over encrypted values; value movement occurs within contract state without revealing plaintext.
  - Only the authorized recipient can claim; once expired, only the sender can reclaim.

## Technical Highlights (Aligned with the Zama Protocol)

- **FHE smart contracts**
  - Written with the FHEVM Solidity library (e.g., euint64) to encode confidential logic directly in contracts.
  - Clear ACL semantics: application logic defines "who can decrypt what," enabling programmable confidentiality.

- **Client and decryption workflow**
  - The frontend integrates with the Zama Relayer SDK and Gateway workflow to validate encrypted inputs and perform user decryption.
  - Encrypted handles are chunked and fetched in a single pass, then assembled locally for decryption—balancing performance and security.

- **Components and ecosystem**
  - Aligned with Zama Protocol components: FHEVM Library, Host Contracts, Gateway, Coprocessors, KMS, Relayer/Oracle.
  - Web integration via RainbowKit + wagmi provides a smooth wallet connection and on-chain UX.

## Security & Privacy

- **Ciphertext end-to-end**: from encrypted inputs generated on the client to on-chain storage and contract computation, data stays encrypted throughout.
- **Minimal visibility**: only authorized accounts can decrypt locally; by default, third parties and contracts do not see plaintext.
- **Programmable confidentiality**: confidentiality rules live in application logic and can target different subjects/time windows as needed.

## Getting Started

### Prerequisites

- Node.js 18.x or later
- npm, yarn, or pnpm package manager
- A Web3 wallet (MetaMask recommended)
- WalletConnect Project ID (for wallet connections)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/TTLockSDKer/zama-private-chat.git
   cd zama-private-chat
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn install
   # or
   pnpm install
   ```

3. **Environment Configuration**
   
   Create a `.env.local` file in the root directory and add the following:
   ```env
   # WalletConnect Project ID (Required)
   NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id_here
   
   # Optional: Custom RPC endpoint
   NEXT_PUBLIC_RPC_URL=https://eth-sepolia.public.blastapi.io
   ```
   
   **⚠️ Important**: Replace `your_project_id_here` with your actual WalletConnect Project ID (see instructions below).

### Getting a WalletConnect Project ID

To enable wallet connections, you need to obtain a Project ID from WalletConnect:

1. **Visit WalletConnect Cloud**
   - Go to [https://cloud.walletconnect.com/](https://cloud.walletconnect.com/)

2. **Create an Account**
   - Sign up or log in with your GitHub account

3. **Create a New Project**
   - Click "Create Project"
   - Enter your project name: `zama-private-chat` (or your preferred name)
   - Select "App" as project type

4. **Get Your Project ID**
   - Copy the Project ID from your project dashboard
   - Paste it into your `.env.local` file

5. **Configure Project Settings**
   - Add your domain to "Authorized Domains"
   - For development: `http://localhost:3000`
   - For production: your actual domain

### Development

1. **Start the development server**
   ```bash
   npm run dev
   # or
   yarn dev
   # or
   pnpm dev
   ```

2. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

### Building for Production

```bash
# Build the application
npm run build

# Start the production server
npm start
```

### Network Configuration

This application is configured for **Ethereum Sepolia Testnet**:
- Chain ID: `11155111`
- Gateway Chain ID: `55815`
- Default RPC: `https://eth-sepolia.public.blastapi.io`

### Wallet Setup

1. **Install MetaMask** or any Web3 wallet
2. **Add Sepolia Testnet** to your wallet
3. **Get test ETH** from a Sepolia faucet:
   - [Sepolia Faucet](https://sepoliafaucet.com/)
   - [Alchemy Sepolia Faucet](https://sepoliafaucet.com/)

## Use Cases
- High-privacy instant messaging (IM)
- Private payments/red packets and group incentives
- Private account and asset bookkeeping
- Composable confidential dapps (DeFi/DAO/social and beyond)

## Roadmap

1. **Decryption UX**
   - Support using the user's own wallet key locally or a lightweight in-app wallet to generate ephemeral keypairs for "fast and seamless" authorization and decryption.

2. **App distribution**
   - Package as desktop/mobile apps (PWA/Electron/Tauri) to enable "download-and-use" with no server deployment—fully decentralized.

3. **Fine-grained ACL**
   - The sender can revoke the recipient's decryption rights or delegate decryption rights to a third party based on policy (e.g., arbitrator/device migration).

4. **Performance & usability**
   - Batch and incremental decryption (per message/conversation) to reduce round-trips and signatures while improving responsiveness.

5. **User experience**
   - Encrypted local chat backups and secure deletion to reduce repeated decryptions and improve perceived performance.

## Tech Stack

- **Frontend**: Next.js 15.4.2, React 18, TypeScript
- **Web3**: wagmi v2, RainbowKit, viem
- **FHE**: Zama FHEVM, Zama SDK
- **Styling**: CSS Modules, PostCSS
- **Development**: ESLint, TypeScript

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Disclaimer

This is experimental software built on cutting-edge cryptographic technology. Use at your own risk. Not audited for production use.

## Resources

- [Zama Documentation](https://docs.zama.ai/)
- [FHEVM Documentation](https://docs.zama.ai/fhevm)
- [WalletConnect Documentation](https://docs.walletconnect.com/)
- [Next.js Documentation](https://nextjs.org/docs)
