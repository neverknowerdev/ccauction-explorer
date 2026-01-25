# Farcaster Mini-App Supported Networks

## Overview

Farcaster Mini Apps support multiple blockchain networks through the [CAIP-2](https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md) (Chain Agnostic Improvement Proposal) standard. Networks are identified using the format: `namespace:reference` (e.g., `eip155:1` for Ethereum mainnet).

## Supported Networks

Based on the official Farcaster miniapps repository, the following networks are supported:

### Ethereum Networks

| Network | CAIP-2 ID | Chain ID | Description |
|---------|-----------|----------|-------------|
| **Ethereum Mainnet** | `eip155:1` | 1 | Primary Ethereum network |
| **Ethereum Sepolia** | `eip155:11155111` | 11155111 | Ethereum testnet |

### Layer 2 Networks

| Network | CAIP-2 ID | Chain ID | Description |
|---------|-----------|----------|-------------|
| **Base** | `eip155:8453` | 8453 | Coinbase's Layer 2 network |
| **Base Sepolia** | `eip155:84532` | 84532 | Base testnet |
| **Optimism** | `eip155:10` | 10 | Optimism mainnet |
| **Optimism Sepolia** | `eip155:11155420` | 11155420 | Optimism testnet |
| **Arbitrum One** | `eip155:42161` | 42161 | Arbitrum mainnet |
| **Arbitrum Sepolia** | `eip155:421614` | 421614 | Arbitrum testnet |
| **Polygon** | `eip155:137` | 137 | Polygon mainnet |

### Other EVM Networks

| Network | CAIP-2 ID | Chain ID | Description |
|---------|-----------|----------|-------------|
| **Degen** | `eip155:666666666` | 666666666 | Degen Chain |
| **Gnosis** | `eip155:100` | 100 | Gnosis Chain (formerly xDai) |
| **Zora** | `eip155:7777777` | 7777777 | Zora Network |
| **Unichain** | `eip155:130` | 130 | Unichain |
| **Monad Testnet** | `eip155:10143` | 10143 | Monad testnet |
| **Celo** | `eip155:42220` | 42220 | Celo mainnet |
| **HyperEVM** | `eip155:999` | 999 | HyperEVM |

### Non-EVM Networks

| Network | CAIP-2 ID | Description |
|---------|-----------|-------------|
| **Solana** | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` | Solana mainnet |

## Configuration

### In Manifest (`farcaster.json`)

You can declare required chains in your manifest using the `requiredChains` property:

```json
{
  "miniapp": {
    "requiredChains": ["eip155:8453", "eip155:1"]
  }
}
```

**Important Notes:**
- Only chains listed in the official `chainList` are supported
- If a host doesn't support all declared chains, it won't render your Mini App
- If `requiredChains` is omitted, the host assumes no chains are required

### In Wagmi Configuration

For your current setup using Wagmi, you can configure multiple chains:

```typescript
import { base, mainnet, optimism, arbitrum, polygon } from 'wagmi/chains';

const wagmiConfig = createConfig({
  chains: [base, mainnet, optimism, arbitrum, polygon],
  transports: {
    [base.id]: http(),
    [mainnet.id]: http(),
    [optimism.id]: http(),
    [arbitrum.id]: http(),
    [polygon.id]: http(),
  },
  connectors: [farcasterMiniApp()],
});
```

## Runtime Detection

You can detect which chains are supported by the host at runtime:

```typescript
import { sdk } from '@farcaster/miniapp-sdk';

// Get all supported chains
const chains = await sdk.getChains();

// Check for specific chain support
const supportsBase = chains.includes('eip155:8453');
const supportsEthereum = chains.includes('eip155:1');
```

## Warpcast Support

According to documentation, Warpcast (the primary Farcaster client) currently supports:
- Base
- Monad testnet
- Optimism
- Arbitrum
- Mainnet (Ethereum)
- Polygon
- Unichain
- Zora

**Note:** Different Farcaster clients may support different chains. It's recommended to:
1. Use runtime detection (`getChains()`) for optional features
2. Declare `requiredChains` in your manifest only if your app absolutely requires specific chains

## Current App Configuration

Your app currently uses:
- **Base** (`eip155:8453`) - Chain ID 8453
- Configured in both `farcaster.json` and `Providers.tsx`

## Resources

- [Farcaster Mini Apps Documentation](https://miniapps.farcaster.xyz/docs)
- [Detecting Chains & Capabilities](https://miniapps.farcaster.xyz/docs/sdk/detecting-capabilities)
- [CAIP-2 Specification](https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md)
- [Official Chain List](https://github.com/farcasterxyz/miniapps/blob/main/packages/miniapp-core/src/schemas/manifest.ts)
