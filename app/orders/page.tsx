'use client';

import BottomNav from '@/components/BottomNav';

const mockOrders = [
  {
    id: 1,
    title: 'Rare NFT Collection #1234',
    type: 'Bid',
    amount: '2.5 ETH',
    status: 'Active',
    date: '2024-01-20',
    time: '14:30',
  },
  {
    id: 2,
    title: 'Digital Art Masterpiece',
    type: 'Bid',
    amount: '5.2 ETH',
    status: 'Outbid',
    date: '2024-01-19',
    time: '10:15',
  },
  {
    id: 3,
    title: 'Vintage Crypto Collectible',
    type: 'Won',
    amount: '12.8 ETH',
    status: 'Completed',
    date: '2024-01-18',
    time: '16:45',
  },
  {
    id: 4,
    title: 'Exclusive Token Bundle',
    type: 'Bid',
    amount: '0.8 ETH',
    status: 'Active',
    date: '2024-01-20',
    time: '09:20',
  },
  {
    id: 5,
    title: 'Limited Edition Drop',
    type: 'Bid',
    amount: '7.3 ETH',
    status: 'Cancelled',
    date: '2024-01-17',
    time: '11:30',
  },
];

const statusColors: Record<string, string> = {
  Active: 'bg-green-500/30 text-green-200',
  Outbid: 'bg-yellow-500/30 text-yellow-200',
  Completed: 'bg-blue-500/30 text-blue-200',
  Cancelled: 'bg-gray-500/30 text-gray-200',
};

export default function OrdersPage() {
  return (
    <div className="min-h-screen pb-20">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <header className="bg-white/10 backdrop-blur-md border-b border-white/20 px-6 py-4">
          <h1 className="text-2xl font-bold text-white">My Orders</h1>
          <p className="text-white/80 text-sm mt-1">{mockOrders.length} total orders</p>
        </header>

        {/* Content */}
        <main className="px-6 py-6 space-y-4">
          {mockOrders.map((order) => (
            <div
              key={order.id}
              className="bg-white/20 backdrop-blur-md rounded-xl p-4 border border-white/30"
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <h3 className="font-semibold text-white mb-1">{order.title}</h3>
                  <p className="text-white/70 text-sm">{order.type}</p>
                </div>
                <span className={`${statusColors[order.status]} text-xs px-2 py-1 rounded flex-shrink-0`}>
                  {order.status}
                </span>
              </div>
              <div className="flex justify-between items-center pt-3 border-t border-white/20">
                <div>
                  <p className="text-white/60 text-xs">Amount</p>
                  <p className="text-white font-semibold">{order.amount}</p>
                </div>
                <div className="text-right">
                  <p className="text-white/60 text-xs">Date</p>
                  <p className="text-white font-semibold text-sm">{order.date}</p>
                  <p className="text-white/60 text-xs">{order.time}</p>
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
