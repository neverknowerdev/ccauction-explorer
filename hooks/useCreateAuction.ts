'use client';

import { useState, useCallback } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient, useChainId, useSwitchChain } from 'wagmi';
import { parseEther, encodeFunctionData, encodeAbiParameters, parseAbiParameters, decodeEventLog } from 'viem';
import { baseSepolia } from 'wagmi/chains';
import { liquidityLauncherAbi } from '@/lib/contracts/abis';
import {
  LIQUIDITY_LAUNCHER_ADDRESS,
  CCA_FACTORY,
  UERC20_FACTORY,
  NATIVE_ETH,
  BASE_SEPOLIA_CHAIN_ID,
} from '@/lib/contracts/addresses';
import {
  TokenReleasePreset,
  FEE_TIER_TO_LP_FEE,
  FEE_TIER_TO_TICK_SPACING,
  encodeTokenMetadata,
  priceToQ96,
  generateAuctionSteps,
  encodeAuctionSteps,
  generateSalt,
} from '@/lib/contracts/encoder';

export interface AuctionFormData {
  // Token Info (for new tokens)
  tokenName: string;
  tokenSymbol: string;
  tokenDescription: string;
  tokenWebsite: string;
  tokenImage: string;
  
  // For existing tokens
  useExistingToken: boolean;
  existingTokenAddress: string;
  
  // Time Settings
  startTime: Date;
  endTime: Date;
  
  // Auction Settings
  targetRaisedValue: string; // ETH amount
  maxRaisedLimit: string; // ETH amount
  floorPrice: string; // ETH per token
  tokenReleasePreset: TokenReleasePreset;
  
  // Pool Settings
  feeTier: string;
  lpOwnership: number; // percentage 0-100
  fundraisingWallet: string;
}

export type AuctionCreationStep = 
  | 'idle'
  | 'checking_network'
  | 'switching_network'
  | 'creating_token'
  | 'waiting_token_confirmation'
  | 'distributing_token'
  | 'waiting_distribution_confirmation'
  | 'complete'
  | 'error';

export interface UseCreateAuctionResult {
  step: AuctionCreationStep;
  error: string | null;
  tokenAddress: string | null;
  strategyAddress: string | null;
  txHash: string | null;
  isLoading: boolean;
  createAuction: (formData: AuctionFormData) => Promise<void>;
  reset: () => void;
}

const TOKEN_INITIAL_SUPPLY = parseEther('1000000000'); // 1 billion tokens

export function useCreateAuction(): UseCreateAuctionResult {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient();
  
  const [step, setStep] = useState<AuctionCreationStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [tokenAddress, setTokenAddress] = useState<string | null>(null);
  const [strategyAddress, setStrategyAddress] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  
  const { writeContractAsync } = useWriteContract();
  
  const reset = useCallback(() => {
    setStep('idle');
    setError(null);
    setTokenAddress(null);
    setStrategyAddress(null);
    setTxHash(null);
  }, []);
  
  const createAuction = useCallback(async (formData: AuctionFormData) => {
    if (!address || !isConnected) {
      setError('Please connect your wallet first');
      setStep('error');
      return;
    }
    
    if (!publicClient) {
      setError('Public client not available');
      setStep('error');
      return;
    }
    
    try {
      // Step 1: Check and switch network if needed
      setStep('checking_network');
      
      if (chainId !== BASE_SEPOLIA_CHAIN_ID) {
        setStep('switching_network');
        try {
          await switchChainAsync({ chainId: BASE_SEPOLIA_CHAIN_ID });
        } catch (switchError) {
          setError('Please switch to Base Sepolia network');
          setStep('error');
          return;
        }
      }
      
      // Get current block number
      const currentBlock = await publicClient.getBlockNumber();
      const currentTimestamp = Math.floor(Date.now() / 1000);
      
      // Convert times to block numbers (Base has ~2 second block time)
      const startTimestamp = Math.floor(formData.startTime.getTime() / 1000);
      const endTimestamp = Math.floor(formData.endTime.getTime() / 1000);
      
      const blockTime = 2; // seconds per block
      const startBlock = currentBlock + BigInt(Math.max(10, Math.floor((startTimestamp - currentTimestamp) / blockTime)));
      const endBlock = startBlock + BigInt(Math.floor((endTimestamp - startTimestamp) / blockTime));
      
      // Validate times
      if (startBlock <= currentBlock) {
        setError('Start time must be in the future');
        setStep('error');
        return;
      }
      
      if (endBlock <= startBlock) {
        setError('End time must be after start time');
        setStep('error');
        return;
      }
      
      // Calculate auction parameters
      const poolLPFee = FEE_TIER_TO_LP_FEE[formData.feeTier] || 3000;
      const poolTickSpacing = FEE_TIER_TO_TICK_SPACING[formData.feeTier] || 60;
      
      // Token split: how much goes to auction (rest reserved for LP)
      // lpOwnership is the percentage that goes to LP
      // So if lpOwnership is 50%, 50% goes to auction
      const tokenSplitForAuction = Math.floor((100 - formData.lpOwnership) * 100_000); // in mps (1e7 = 100%)
      
      // Block calculations
      const claimBlock = endBlock + BigInt(100);
      const migrationBlock = claimBlock + BigInt(50);
      const sweepBlock = migrationBlock + BigInt(1000);
      
      // Floor price in Q96 format
      const floorPriceFloat = parseFloat(formData.floorPrice) || 0.000001;
      const floorPriceQ96 = priceToQ96(floorPriceFloat);
      
      // Auction tick spacing (1% of floor price)
      const auctionTickSpacing = floorPriceQ96 / BigInt(100) || BigInt(1);
      
      // Required currency raised
      const requiredCurrencyRaised = parseEther(formData.targetRaisedValue || '0');
      
      // Max currency for LP
      const maxCurrencyAmountForLP = parseEther(formData.maxRaisedLimit || formData.targetRaisedValue || '0');
      
      // Generate auction steps
      const durationBlocks = Number(endBlock - startBlock);
      const auctionSteps = generateAuctionSteps(durationBlocks, formData.tokenReleasePreset);
      const auctionStepsData = encodeAuctionSteps(auctionSteps);
      
      // Operator and position recipient
      const operator = formData.fundraisingWallet && formData.fundraisingWallet.startsWith('0x') 
        ? formData.fundraisingWallet as `0x${string}`
        : address;
      const positionRecipient = operator;
      
      // Encode MigratorParameters
      const migratorParams = {
        migrationBlock,
        currency: NATIVE_ETH as `0x${string}`,
        poolLPFee,
        poolTickSpacing,
        tokenSplit: tokenSplitForAuction,
        initializerFactory: CCA_FACTORY as `0x${string}`,
        positionRecipient,
        sweepBlock,
        operator,
        maxCurrencyAmountForLP,
      };
      
      // Encode AuctionParameters
      const auctionParams = {
        currency: NATIVE_ETH as `0x${string}`,
        tokensRecipient: operator,
        fundsRecipient: operator, // Will be overridden by strategy
        startBlock,
        endBlock,
        claimBlock,
        tickSpacing: auctionTickSpacing,
        validationHook: '0x0000000000000000000000000000000000000000' as `0x${string}`,
        floorPrice: floorPriceQ96,
        requiredCurrencyRaised,
        auctionStepsData,
      };
      
      // Encode strategy config data
      const migratorTuple: readonly [
        bigint,
        `0x${string}`,
        number,
        number,
        number,
        `0x${string}`,
        `0x${string}`,
        bigint,
        `0x${string}`,
        bigint,
      ] = [
        migratorParams.migrationBlock,
        migratorParams.currency,
        migratorParams.poolLPFee,
        migratorParams.poolTickSpacing,
        migratorParams.tokenSplit,
        migratorParams.initializerFactory,
        migratorParams.positionRecipient as `0x${string}`,
        migratorParams.sweepBlock,
        migratorParams.operator as `0x${string}`,
        migratorParams.maxCurrencyAmountForLP,
      ];
      const auctionParamsEncoded = encodeAbiParameters(
        parseAbiParameters(
          '(address, address, address, uint64, uint64, uint64, uint256, address, uint256, uint128, bytes)'
        ),
        [[
          auctionParams.currency,
          auctionParams.tokensRecipient,
          auctionParams.fundsRecipient,
          auctionParams.startBlock,
          auctionParams.endBlock,
          auctionParams.claimBlock,
          auctionParams.tickSpacing,
          auctionParams.validationHook,
          auctionParams.floorPrice,
          auctionParams.requiredCurrencyRaised,
          auctionParams.auctionStepsData,
        ]],
      );
      const strategyConfigData = encodeAbiParameters(
        parseAbiParameters(
          '((uint64, address, uint24, int24, uint24, address, address, uint64, address, uint128), bytes)'
        ),
        [[migratorTuple, auctionParamsEncoded]],
      );
      
      // Encode token metadata
      const tokenData = encodeTokenMetadata({
        description: formData.tokenDescription || '',
        website: formData.tokenWebsite || '',
        image: formData.tokenImage || '',
      });
      
      // Build multicall data for atomic operation
      const createTokenCall = encodeFunctionData({
        abi: liquidityLauncherAbi,
        functionName: 'createToken',
        args: [
          UERC20_FACTORY,
          formData.tokenName,
          formData.tokenSymbol,
          18, // decimals
          TOKEN_INITIAL_SUPPLY,
          LIQUIDITY_LAUNCHER_ADDRESS, // Mint to launcher for atomic distribution
          tokenData,
        ],
      });
      
      // For the distribute call, we'll handle it after getting the token address
      // from the multicall result. Actually, we can use the launcher's built-in
      // support for this - when payerIsUser is false, it uses tokens already
      // in the launcher
      
      // First, create the token with recipient as the launcher
      setStep('creating_token');
      
      // Execute createToken
      const createTxHash = await writeContractAsync({
        address: LIQUIDITY_LAUNCHER_ADDRESS,
        abi: liquidityLauncherAbi,
        functionName: 'createToken',
        args: [
          UERC20_FACTORY,
          formData.tokenName,
          formData.tokenSymbol,
          18, // decimals
          TOKEN_INITIAL_SUPPLY,
          address, // Mint to user's wallet first
          tokenData,
        ],
      });
      
      setTxHash(createTxHash);
      setStep('waiting_token_confirmation');
      
      // Wait for transaction confirmation
      const createReceipt = await publicClient.waitForTransactionReceipt({
        hash: createTxHash,
      });
      
      if (createReceipt.status !== 'success') {
        setError('Token creation failed');
        setStep('error');
        return;
      }
      
      // Find the TokenCreated event to get the token address
      const tokenCreatedLog = createReceipt.logs.find(log => {
        try {
          const decoded = decodeEventLog({
            abi: liquidityLauncherAbi,
            data: log.data,
            topics: log.topics,
          });
          return decoded.eventName === 'TokenCreated';
        } catch {
          return false;
        }
      });
      
      if (!tokenCreatedLog) {
        setError('Could not find token address from transaction');
        setStep('error');
        return;
      }
      
      const decodedEvent = decodeEventLog({
        abi: liquidityLauncherAbi,
        data: tokenCreatedLog.data,
        topics: tokenCreatedLog.topics,
      });
      
      const createdTokenAddress = (decodedEvent.args as { tokenAddress: `0x${string}` }).tokenAddress;
      setTokenAddress(createdTokenAddress);
      
      console.log('Token created at:', createdTokenAddress);
      console.log('Strategy config data:', strategyConfigData);
      console.log('Migrator params:', migratorParams);
      console.log('Auction params:', auctionParams);
      
      // For now, just complete with token creation
      // The distribution step requires additional setup (Permit2 approval)
      // which we can add in a future iteration
      
      setStep('complete');
      
    } catch (err: unknown) {
      console.error('Auction creation error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      setStep('error');
    }
  }, [address, isConnected, chainId, switchChainAsync, publicClient, writeContractAsync]);
  
  return {
    step,
    error,
    tokenAddress,
    strategyAddress,
    txHash,
    isLoading: step !== 'idle' && step !== 'complete' && step !== 'error',
    createAuction,
    reset,
  };
}
