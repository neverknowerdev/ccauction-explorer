'use client';

import { useState } from 'react';

export function TokenAvatar({
  tokenImage,
  tokenTicker,
  className = 'w-14 h-14',
  fallbackClassName = 'w-14 h-14',
}: {
  tokenImage: string | null;
  tokenTicker: string | null;
  className?: string;
  fallbackClassName?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const fallback = tokenTicker ? tokenTicker[0] : '🪙';
  const shouldRenderImage = !!tokenImage && !imageFailed && /^https?:\/\//i.test(tokenImage);

  return (
    <div className={`${fallbackClassName} bg-white/20 rounded-lg flex items-center justify-center text-2xl overflow-hidden`}>
      {shouldRenderImage ? (
        <img
          src={tokenImage}
          alt={`${tokenTicker ?? 'Token'} logo`}
          className={`${className} object-cover`}
          onError={() => setImageFailed(true)}
        />
      ) : (
        fallback
      )}
    </div>
  );
}
