# Decentralized Escrow Marketplace (EscrowX)

A full-stack decentralized escrow marketplace where buyers can lock Sepolia ETH in a smart contract and later either release payment to the seller or refund themselves.

Built with:
- Solidity `^0.8.20`
- Hardhat + TypeScript
- Next.js 14 App Router + TypeScript
- TailwindCSS + shadcn/ui-style components
- ethers.js v6
- MetaMask integration

## Features

- Create escrow with ETH deposit and description
- Buyer-only release payment flow
- Buyer-only refund flow (while pending)
- Escrow lifecycle statuses: `PENDING`, `COMPLETED`, `REFUNDED`
- Dashboard filters:
  - Role tabs: `All`, `As Buyer`, `As Seller`
  - Status filter dropdown
- Real-time list refresh after transactions
- Responsive UI: table on desktop, cards on mobile
- Transaction modal states: loading, success, error
- Sepolia Etherscan transaction links

## Architecture

```text
+----------------------------+          +------------------------------+
| Next.js 14 Frontend        |          | Ethereum Sepolia             |
| - App Router pages         |  tx/rpc  | - EscrowMarketplace contract |
| - Web3Context              +--------->| - Escrow data on-chain       |
| - WalletConnect            |          | - Events and state changes   |
+-------------+--------------+          +---------------+--------------+
              |                                             ^
              | MetaMask provider                           |
              v                                             |
+----------------------------+                              |
| Browser + MetaMask         |------------------------------+
| - Account management       | signs transactions
| - Network switching        |
+----------------------------+
```

## Project Structure

```text
escrow-marketplace/
  contracts/Escrow.sol
  scripts/deploy.ts
  test/Escrow.test.ts
  hardhat.config.ts
  src/app/layout.tsx
  src/app/page.tsx
  src/app/create/page.tsx
  src/app/dashboard/page.tsx
  src/app/globals.css
  src/components/Navbar.tsx
  src/components/WalletConnect.tsx
  src/components/EscrowCard.tsx
  src/components/TransactionModal.tsx
  src/context/Web3Context.tsx
  src/lib/web3.ts
  src/lib/contract.ts
  src/lib/abi.json
  src/types/index.ts
  .env.example
  .env.local.example
  package.json
  tsconfig.json
  tailwind.config.ts
  next.config.js
  README.md
```

Note: Additional UI utility files under `src/components/ui/` are included to support Button, Card, Input, Textarea, Badge, Table, Tabs, Dialog, Toast, and Skeleton components.

## Smart Contract Summary

`contracts/Escrow.sol` includes:
- `struct Escrow`
- `enum EscrowStatus { PENDING, COMPLETED, REFUNDED }`
- `mapping(uint => Escrow) public escrows`
- `uint public escrowCount`
- `createEscrow(address _seller, string memory _description)` payable
- `releasePayment(uint _escrowId)` buyer-only
- `refundBuyer(uint _escrowId)` buyer-only
- `getEscrow(uint _escrowId)`
- `getAllEscrows()`

Events emitted:
- `EscrowCreated`
- `PaymentReleased`
- `PaymentRefunded`

## Prerequisites

- Node.js 18+
- npm 9+
- MetaMask browser extension
- Sepolia ETH for testing
- Alchemy or Infura Sepolia RPC URL

Get Sepolia ETH faucet:
- https://sepoliafaucet.com

## Setup and Run (Step-by-Step)

1. Clone and open project

```bash
git clone <your-repo-url>
cd escrow-marketplace
```

2. Install dependencies

```bash
npm install
```

3. Configure backend environment (`.env`)

Set values in `.env`:
- `SEPOLIA_RPC_URL`
- `PRIVATE_KEY`

4. Compile contracts

```bash
npm run compile
```

5. Run tests

```bash
npm run test
```

6. Deploy to Sepolia

```bash
npm run deploy:sepolia
```

Copy deployed address from terminal output.

7. Configure frontend environment (`.env.local`)

Set values in `.env.local`:
- `NEXT_PUBLIC_CONTRACT_ADDRESS=<deployed_address>`
- `NEXT_PUBLIC_SEPOLIA_RPC_URL=<same_or_public_rpc>` (recommended for production/read-only browsing)
- `NEXT_PUBLIC_DEPLOY_BLOCK=<deployment_block_number>` (optional but recommended for scalable event queries)

8. Start frontend

```bash
npm run dev
```

Open: `http://localhost:3000`

## Usage Guide

1. Connect wallet
- Open app and click `Connect Wallet`.
- If not on Sepolia, wallet switch is requested automatically.

2. Create escrow
- Go to `Create Escrow`.
- Enter seller wallet address, ETH amount, and description.
- Confirm transaction in MetaMask.

3. View dashboard
- Open `Dashboard`.
- See all escrows and their statuses.
- Use tabs and status filter to narrow view.

4. Release or refund (buyer only)
- For pending escrows created by your account, click `Release Payment` or `Refund`.
- Confirm modal, sign transaction, and wait for confirmation.

5. Verify transaction
- Success notifications include Etherscan transaction links.

## Screenshot Descriptions

- Home page:
  - Hero section with escrow explanation and connect wallet CTA
  - Wallet summary with truncated address and Sepolia ETH balance
- Create Escrow page:
  - Seller address input, ETH amount, description textarea
  - Transaction modal showing loading/success/error states
- Dashboard page:
  - Desktop responsive table with actions
  - Mobile card layout with same actions and badges

## Troubleshooting

1. MetaMask not connecting
- Ensure MetaMask extension is installed and unlocked.
- Refresh browser and reconnect.
- Confirm your site is allowed by MetaMask.

2. Wrong network
- Switch to Sepolia in MetaMask.
- Use auto-switch button in wallet component.

3. Transaction rejected
- You likely clicked reject in MetaMask; retry action.

4. Insufficient funds
- Add Sepolia ETH from faucet.
- Keep extra ETH for gas.

5. Contract call reverts
- Verify `NEXT_PUBLIC_CONTRACT_ADDRESS` is correct.
- Ensure contract is deployed on Sepolia, not local network.
- Confirm caller is the buyer for release/refund actions.

6. Dashboard empty
- Make sure contract address is set and has escrows.
- Confirm you are connected to Sepolia.
- If activity feed is slow or empty on a public RPC, set `NEXT_PUBLIC_DEPLOY_BLOCK` to your contract deployment block so event queries don’t scan too many blocks.

7. Hardhat tests show `UV_HANDLE_CLOSING` on Windows after passing
- If you still see `6 passing`, test logic succeeded and this is a Node/Hardhat runtime teardown issue on some Windows setups.
- Re-run `npm run test`; if needed, use Node LTS 20.x for best compatibility.

## Useful Commands

```bash
npm run compile        # Compile smart contracts
npm run test           # Run Hardhat tests
npm run deploy:sepolia # Deploy contract to Sepolia
npm run dev            # Start Next.js dev server
npm run build          # Production build
```

## Security Notes

- This project is educational and not audited.
- Do not use mainnet funds without professional audit and additional safety patterns.
