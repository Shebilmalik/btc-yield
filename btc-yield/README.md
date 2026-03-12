# YieldBTC — Bitcoin L1 Yield Aggregator

> First ERC-4626 style yield aggregator natively on Bitcoin L1 via OP_NET.  
> Three vaults, five strategies, real BTC yield — no bridges.

## Live Demo
🌐 [https://btc-yield.vercel.app](https://btc-yield.vercel.app)

## Features
- 🛡️ **Alpha Vault** — 6.2% APY · OP_NET Staking + Block Rewards
- ⚡ **Beta Vault** — 14.7% APY · Motoswap LP + Yield Bonds
- 🔥 **Omega Vault** — 31.4% APY · Flash Loan Arb + Cross-Protocol LP
- Auto-compound yield back into vault
- Real OP_WALLET connection
- Live BTC price from CoinGecko
- Per-block yield accrual on-chain

## Tech Stack
- React 18 + TypeScript + Vite (frontend)
- AssemblyScript → WASM (smart contract)
- OP_NET Bitcoin L1 (no bridges, no sidechains)
- OP_WALLET via `window.opnet`

## Setup

### Frontend
```bash
npm install
npm run dev
```

### Smart Contract
```bash
cd contract
npm install
npm run build
WIF_KEY=your_wif_key node scripts/deploy.js
```

Then paste the contract address into the frontend.

## Contract Architecture
```
YieldAggregator
├── deposit(vaultId, amount)     — deposit BTC, get shares
├── withdraw(vaultId, shares)    — burn shares, get BTC back
├── claimYield(vaultId)          — claim accrued yield
├── compoundYield(vaultId)       — reinvest yield into vault
├── getVaultInfo()               — TVL, shares, APY per vault
└── getUserPosition(address)     — user deposits, shares, pending yield
```

## Built for Vibecode Finance — Week 3 Challenge
