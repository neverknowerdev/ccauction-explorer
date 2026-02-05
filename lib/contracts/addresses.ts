// Contract addresses for Base Sepolia (Chain ID: 84532)
//
// Sources of truth:
// - Liquidity Launcher: https://github.com/Uniswap/liquidity-launcher (README → Deployment Addresses)
// - Permit2: canonical address, same on all EVM chains. Liquidity Launcher README references it.
//   Official: https://docs.uniswap.org/contracts/permit2/overview
//   Base Sepolia: https://sepolia.basescan.org/address/0x000000000022D473030F116dDEE9F6B43aC78BA3 (contract deployed, active)
// - UERC20Factory: https://github.com/Uniswap/uerc20-factory (README → Deployment Addresses)
//   Official list is Mainnet + Sepolia only; Base Sepolia is NOT listed. Same address may be used via CREATE2.
//   If createToken fails on Base Sepolia, verify deployment on BaseScan or with Uniswap.
// - CCA Factory: https://github.com/Uniswap/continuous-clearing-auction (README → Deployments)
// - AdvancedLBPStrategyFactory: https://github.com/Uniswap/liquidity-launcher (README → Deployment Addresses, Base Sepolia)

export const LIQUIDITY_LAUNCHER_ADDRESS = '0x00000008412db3394C91A5CbD01635c6d140637C' as const;
export const CCA_FACTORY = '0xcca1101C61cF5cb44C968947985300DF945C3565' as const;
/** FullRangeLBPStrategyFactory on Base Sepolia (v2.0.0) - simpler config */
export const FULL_RANGE_LBP_STRATEGY_FACTORY = '0xa3A236647c80BCD69CAD561ACf863c29981b6fbC' as const;
/** AdvancedLBPStrategyFactory on Base Sepolia (v2.0.0) */
export const ADVANCED_LBP_STRATEGY_FACTORY = '0x67E24586231D4329AfDbF1F4Ac09E081cFD1e6a6' as const;
/** UERC20Factory on Base Sepolia (from successful createToken tx on Basescan) */
export const UERC20_FACTORY = '0x04380114ec3c2e8a4df2d0d44d81bce5f3cb21c6' as const;
/** Permit2: canonical address 0x000000000022D473030F116dDEE9F6B43aC78BA3 — correct on Base Sepolia (verified on BaseScan) */
export const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3' as const;

// Native ETH is represented as address(0)
export const NATIVE_ETH = '0x0000000000000000000000000000000000000000' as const;

// WETH on Base Sepolia (use this as currency if you need wrapped ETH)
export const WETH_BASE_SEPOLIA = '0x4200000000000000000000000000000000000006' as const;

// Base Sepolia Chain ID
export const BASE_SEPOLIA_CHAIN_ID = 84532;
