'use client';

import BottomNav from '@/components/BottomNav';

const mockAuctions = [
  {
    id: 1,
    title: 'Rare NFT Collection #1234',
    collection: 'CryptoPunks',
    currentBid: '2.5 ETH',
    timeLeft: '1h 23m',
    bidders: 12,
    image: '🎨',
  },
  {
    id: 2,
    title: 'Digital Art Masterpiece',
    collection: 'Art Blocks',
    currentBid: '5.2 ETH',
    timeLeft: '3h 45m',
    bidders: 8,
    image: '🖼️',
  },
  {
    id: 3,
    title: 'Vintage Crypto Collectible',
    collection: 'Bored Apes',
    currentBid: '12.8 ETH',
    timeLeft: '5h 12m',
    bidders: 24,
    image: '🦍',
  },
  {
    id: 4,
    title: 'Exclusive Token Bundle',
    collection: 'Token Sets',
    currentBid: '0.8 ETH',
    timeLeft: '45m',
    bidders: 5,
    image: '💎',
  },
  {
    id: 5,
    title: 'Limited Edition Drop',
    collection: 'SuperRare',
    currentBid: '7.3 ETH',
    timeLeft: '2h 30m',
    bidders: 18,
    image: '✨',
  },
];

export default function LiveAuctionsPage() {
  return (
    <div className="min-h-screen pb-20">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <header className="bg-white/10 backdrop-blur-md border-b border-white/20 px-6 py-4">
          <h1 className="text-2xl font-bold text-white">Live Auctions</h1>
          <p className="text-white/80 text-sm mt-1">{mockAuctions.length} active auctions</p>
        </header>

        {/* Content */}
        <main className="px-6 py-6 space-y-4">
          {mockAuctions.map((auction) => (
            <div
              key={auction.id}
              className="bg-white/20 backdrop-blur-md rounded-xl p-4 border border-white/30 hover:bg-white/30 transition-colors"
            >
              <div className="flex gap-4">
                <div className="w-16 h-16 bg-white/20 rounded-lg flex items-center justify-center text-3xl flex-shrink-0">
                  {auction.image}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="font-semibold text-white truncate">{auction.title}</h3>
                    <span className="bg-red-500/30 text-red-200 text-xs px-2 py-1 rounded ml-2 flex-shrink-0">
                      Live
                    </span>
                  </div>
                  <p className="text-white/70 text-sm mb-3">{auction.collection}</p>
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-white/60 text-xs">Current Bid</p>
                      <p className="text-white font-semibold">{auction.currentBid}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-white/60 text-xs">Bidders</p>
                      <p className="text-white font-semibold">{auction.bidders}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-white/60 text-xs">Time Left</p>
                      <p className="text-white font-semibold">{auction.timeLeft}</p>
                    </div>
                  </div>
                  <button className="w-full mt-3 bg-white text-purple-600 font-semibold py-2 rounded-lg hover:bg-white/95 transition-colors">
                    Place Bid
                  </button>
                </div>
              </div>
            </div>
          ))}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
