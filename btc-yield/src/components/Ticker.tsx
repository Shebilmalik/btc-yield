import React from 'react'

interface TickerProps {
  btcPrice: number
}

export default function Ticker({ btcPrice }: TickerProps) {
  const items = [
    { label: 'BTC/USD', value: btcPrice > 0 ? `$${btcPrice.toLocaleString()}` : '—', change: '+2.4%', positive: true },
    { label: 'ALPHA VAULT APY', value: '6.20%', change: '+0.3%', positive: true },
    { label: 'BETA VAULT APY', value: '14.70%', change: '+1.2%', positive: true },
    { label: 'OMEGA VAULT APY', value: '31.40%', change: '-0.8%', positive: false },
    { label: 'TOTAL TVL', value: '3.182 BTC', change: '+5.1%', positive: true },
    { label: 'PROTOCOL FEES', value: '0.5%', change: null, positive: true },
    { label: 'NETWORK', value: 'OP_NET TESTNET', change: '● LIVE', positive: true },
    { label: 'NEXT REBALANCE', value: '~4 blocks', change: null, positive: true },
  ]

  const doubled = [...items, ...items]

  return (
    <div className="ticker-wrap">
      <div className="ticker-track">
        {doubled.map((item, i) => (
          <div key={i} className="ticker-item">
            {item.label}&nbsp;
            <strong style={{ color: '#fff' }}>{item.value}</strong>
            {item.change && (
              <span className={item.positive ? '' : 'neg'}>{item.change}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
