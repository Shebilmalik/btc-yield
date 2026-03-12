import React from 'react'
import { VAULTS } from '../abi/yield'
import type { VaultState } from '../hooks/useYield'

interface VaultCardProps {
  vault: typeof VAULTS[0]
  state?: VaultState
  selected: boolean
  onSelect: () => void
  btcPrice: number
}

export default function VaultCard({ vault, state, selected, onSelect, btcPrice }: VaultCardProps) {
  const tvlSats = state?.tvl ?? BigInt(Math.floor(vault.tvlBTC * 1e8))
  const tvlBTC = Number(tvlSats) / 1e8
  const tvlUSD = btcPrice > 0 ? (tvlBTC * btcPrice) : 0
  const apy = state?.apy ?? vault.apy
  const fillPct = Math.min(100, (tvlBTC / vault.maxTvlBTC) * 100)

  return (
    <div
      className={`vault-card ${vault.key}${selected ? ' selected' : ''}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onSelect()}
    >
      <div className="vault-card-header">
        <div className={`vault-card-icon ${vault.key}`}>
          {vault.emoji}
        </div>
        <span className={`vault-card-risk vault-tag ${vault.riskClass}`}>
          {vault.risk}
        </span>
      </div>

      <div className="vault-card-name">{vault.name}</div>
      <div className="vault-card-desc">{vault.desc}</div>

      <div className="vault-metrics">
        <div className="metric">
          <div className="metric-label">APY</div>
          <div className={`metric-value ${vault.key === 'alpha' ? 'green' : vault.key === 'beta' ? 'blue' : 'gold'}`}>
            {apy.toFixed(1)}%
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">TVL</div>
          <div className="metric-value">{tvlBTC.toFixed(3)} BTC</div>
        </div>
        <div className="metric">
          <div className="metric-label">Min Deposit</div>
          <div className="metric-value">{(vault.minDeposit / 1e8).toFixed(5)} BTC</div>
        </div>
        <div className="metric">
          <div className="metric-label">USD Value</div>
          <div className="metric-value">
            {btcPrice > 0 ? `$${tvlUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}
          </div>
        </div>
      </div>

      <div className="vault-tvl-bar">
        <div
          className={`vault-tvl-fill ${vault.key}`}
          style={{ width: `${fillPct}%` }}
        />
      </div>
      <div className="vault-tvl-label">
        {tvlBTC.toFixed(3)} / {vault.maxTvlBTC} BTC capacity
        &nbsp;·&nbsp;{fillPct.toFixed(0)}% full
      </div>
    </div>
  )
}
