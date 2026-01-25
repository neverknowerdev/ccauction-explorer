export function formatWalletAddress(address: string | null, startLength = 6, endLength = 4): string {
  if (!address) return 'Not connected';
  if (address.length <= startLength + endLength) return address;
  return `${address.slice(0, startLength)}...${address.slice(-endLength)}`;
}
