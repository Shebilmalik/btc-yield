import React from 'react'

interface HeaderProps {
  isConnected: boolean
  walletAddress: string | null
  walletBalance: number
  btcPrice: number
  activeTab: string
  onTabChange: (tab: string) => void
  onConnect: () => void
  onDisconnect: () => void
}

export default function Header({
  isConnected, walletAddress, walletBalance, btcPrice,
  activeTab, onTabChange, onConnect, onDisconnect
}: HeaderProps) {
  const shortAddr = walletAddress
    ? walletAddress.slice(0, 8) + '...' + walletAddress.slice(-6)
    : ''

  return (
    <header className="header">
      <div className="header-logo">
        <span className="header-logo-text">YieldBTC</span>
        <span className="header-logo-sup">OP_NET · BTC L1</span>
      </div>

      <nav className="header-nav">
        {['Dashboard', 'Vaults', 'Portfolio', 'Analytics'].map(tab => (
          <button
            key={tab}
            className={`nav-tab${activeTab === tab ? ' active' : ''}`}
            onClick={() => onTabChange(tab)}
          >
            {tab}
          </button>
        ))}
      </nav>

      <div className="header-right">
        {btcPrice > 0 && (
          <div className="btc-price-badge">
            <span className="dot" />
            ${btcPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        )}

        {isConnected ? (
          <button className="btn btn-connected" onClick={onDisconnect}>
            ●&nbsp;{shortAddr}
            &nbsp;·&nbsp;
            {(walletBalance / 1e8).toFixed(4)} BTC
          </button>
        ) : (
          <button className="btn btn-outline btn-sm" onClick={() => {
  const w = (window as any).opnet || (window as any).bitcoin || (window as any).unisat;
  alert(JSON.stringify(Object.keys(w || {})));
}}>Debug</button>
<button className="btn btn-primary" onClick={onConnect}>
  Connect Wallet
</button>
        )}
      </div>
    </header>
  )
}
