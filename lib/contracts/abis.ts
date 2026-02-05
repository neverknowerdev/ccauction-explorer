// ABIs for Uniswap Liquidity Launcher contracts

// LiquidityLauncher ABI - main entry point
export const liquidityLauncherAbi = [
  {
    type: 'function',
    name: 'createToken',
    inputs: [
      { name: 'factory', type: 'address', internalType: 'address' },
      { name: 'name', type: 'string', internalType: 'string' },
      { name: 'symbol', type: 'string', internalType: 'string' },
      { name: 'decimals', type: 'uint8', internalType: 'uint8' },
      { name: 'initialSupply', type: 'uint128', internalType: 'uint128' },
      { name: 'recipient', type: 'address', internalType: 'address' },
      { name: 'tokenData', type: 'bytes', internalType: 'bytes' },
    ],
    outputs: [{ name: 'tokenAddress', type: 'address', internalType: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'distributeToken',
    inputs: [
      { name: 'token', type: 'address', internalType: 'address' },
      {
        name: 'distribution',
        type: 'tuple',
        internalType: 'struct Distribution',
        components: [
          { name: 'strategy', type: 'address', internalType: 'address' },
          { name: 'amount', type: 'uint128', internalType: 'uint128' },
          { name: 'configData', type: 'bytes', internalType: 'bytes' },
        ],
      },
      { name: 'payerIsUser', type: 'bool', internalType: 'bool' },
      { name: 'salt', type: 'bytes32', internalType: 'bytes32' },
    ],
    outputs: [{ name: 'distributionContract', type: 'address', internalType: 'contract IDistributionContract' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'multicall',
    inputs: [{ name: 'data', type: 'bytes[]', internalType: 'bytes[]' }],
    outputs: [{ name: 'results', type: 'bytes[]', internalType: 'bytes[]' }],
    stateMutability: 'payable',
  },
  {
    type: 'event',
    name: 'TokenCreated',
    inputs: [{ name: 'tokenAddress', type: 'address', indexed: true, internalType: 'address' }],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'TokenDistributed',
    inputs: [
      { name: 'tokenAddress', type: 'address', indexed: true, internalType: 'address' },
      { name: 'distributionContract', type: 'address', indexed: true, internalType: 'address' },
      { name: 'amount', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
    anonymous: false,
  },
  {
    type: 'error',
    name: 'RecipientCannotBeZeroAddress',
    inputs: [],
  },
] as const;

// ERC20 ABI for token approval
export const erc20Abi = [
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address', internalType: 'address' },
      { name: 'amount', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      { name: 'owner', type: 'address', internalType: 'address' },
      { name: 'spender', type: 'address', internalType: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address', internalType: 'address' }],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

// Permit2 ABI for token approvals
export const permit2Abi = [
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'token', type: 'address', internalType: 'address' },
      { name: 'spender', type: 'address', internalType: 'address' },
      { name: 'amount', type: 'uint160', internalType: 'uint160' },
      { name: 'expiration', type: 'uint48', internalType: 'uint48' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      { name: 'owner', type: 'address', internalType: 'address' },
      { name: 'token', type: 'address', internalType: 'address' },
      { name: 'spender', type: 'address', internalType: 'address' },
    ],
    outputs: [
      { name: 'amount', type: 'uint160', internalType: 'uint160' },
      { name: 'expiration', type: 'uint48', internalType: 'uint48' },
      { name: 'nonce', type: 'uint48', internalType: 'uint48' },
    ],
    stateMutability: 'view',
  },
] as const;
