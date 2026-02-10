'use client';

export function FormattedPrice({
  price,
  className = '',
}: {
  price: number | null;
  className?: string;
}) {
  if (price == null) return <span className={className}>-</span>;
  if (price === 0) return <span className={className}>0</span>;
  if (price >= 0.001) {
    return <span className={className}>{price >= 1 ? price.toFixed(4) : price.toFixed(6)}</span>;
  }

  const str = price.toFixed(18);
  const match = str.match(/^0\.(0*)([1-9]\d*)/);

  if (!match) return <span className={className}>{price.toFixed(6)}</span>;

  const leadingZeros = match[1].length;
  const significantDigits = match[2].slice(0, 4);

  if (leadingZeros >= 4) {
    return (
      <span className={className}>
        0.0<sub className="text-[0.7em] opacity-70">{leadingZeros}</sub>{significantDigits}
      </span>
    );
  }

  return <span className={className}>{price.toFixed(leadingZeros + 4)}</span>;
}
