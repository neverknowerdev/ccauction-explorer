# CCA Auctions Explorer

A mobile-first web application for exploring and participating in CCA (Crypto Currency Auctions).

## Features

- 🎨 Beautiful purple gradient design inspired by Uniswap
- 📱 Mobile-first layout with floating bottom navigation
- 🚀 Onboarding screen for new users
- 🏠 Home page with featured auctions and stats
- ⏰ Live Auctions page with real-time auction listings
- 📋 Orders page to track your bids and purchases
- 👤 Account page with profile and settings

## Getting Started

### Prerequisites

- Node.js 18+ 
- Yarn package manager

### Installation

1. Install dependencies:
```bash
yarn install
```

2. Run the development server:
```bash
yarn dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser

## Project Structure

```
├── app/
│   ├── onboarding/     # Onboarding screen
│   ├── live-auctions/  # Live auctions page
│   ├── orders/         # Orders page
│   ├── account/        # Account page
│   ├── layout.tsx      # Root layout
│   ├── page.tsx        # Home page
│   └── globals.css     # Global styles
├── components/
│   ├── AppIcon.tsx     # App icon component
│   └── BottomNav.tsx   # Bottom navigation menu
└── package.json
```

## Tech Stack

- **Next.js 14** - React framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **React** - UI library

## Development

The app uses Next.js App Router and is optimized for mobile devices. The onboarding screen is shown once per user (stored in localStorage).
