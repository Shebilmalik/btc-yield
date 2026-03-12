import React from 'react'
import { VAULTS } from '../abi/yield'
import type { Position, VaultState } from '../hooks/useYield'

interface PositionsProps {
  positions: Position[]
  vaultStates: VaultState[]
  isConnected: boolean
  txLoading: boolean
  btcPrice: number
  satsToUSD: (sats: bigint) => string
  onWithdraw: (vaultId: number, shares: bigint) => Promise<void>
  onClaim: (vaultId: number) => Promise<void>
  onCompound: (vaultId: number) => Promise<void>
}

export default function Positions({
  positions, vaultStates, isConnected, txLoading, btcPrice,
  satsToUSD, onWithdraw, onClaim, onCompound
}: PositionsProps) {
  if (!isConnected || positions.length === 0) {
    return (
      <div className="positions-table">
        <div className="pos-empty">
          <div className="pos-empty-icon">📊</div>
          {!isConnected
            ? 'Connect your wallet to see your positions'
            : 'No active positions — deposit BTC to start earning'}
        </div>
      </div>
    )
  }

  return (
    <div className="positions-table">
      <div className="positions-header">
        <span>Vault</span>
        <span>Deposited</span>
        <span>Pending Yield</span>
        <span>USD Value</span>
        <span>APY</span>
        <span style={{ textAlign: 'right' }}>Actions</span>
      </div>
      {positions.map(pos => {
        const vault = VAULTS[pos.vaultId]
        const state = vaultStates.find(s => s.id === pos.vaultId)
        const apy = state?.apy ?? vault.apy
        const depositedBTC = Number(pos.deposited) / 1e8
        const yieldBTC = Number(pos.pendingYield) / 1e8

        return (
          <div className="position-row" key={pos.vaultId}>
            <div className="position-vault">
              <div className={`pos-vault-icon ${vault.key}`}>{vault.emoji}</div>
              <div>
                <div className="pos-vault-name">{vault.name}</div>
                <div className="pos-vault-type">{vault.strategies[0]}</div>
              </div>
            </div>

            <div className="pos-value">
              {depositedBTC.toFixed(6)} BTC
            </div>

            <div className="pos-value green">
              +{yieldBTC.toFixed(8)} BTC
            </div>

            <div className="pos-value">
              ${satsToUSD(pos.deposited)}
            </div>

            <div className="pos-value" style={{
              color: vault.key === 'alpha' ? 'var(--green)' : vault.key === 'beta' ? 'var(--blue)' : 'var(--gold)'
            }}>
              {apy.toFixed(1)}%
            </div>

            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {pos.pendingYield > 0n && (
                <button
                  className="btn btn-green btn-sm"
                  onClick={() => onClaim(pos.vaultId)}
                  disabled={txLoading}
                >
                  Claim
                </button>
              )}
              <button
                className="btn btn-outline btn-sm"
                onClick={() => onCompound(pos.vaultId)}
                disabled={txLoading}
                title="Auto-compound yield back into vault"
              >
                ⚡ Compound
              </button>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => onWithdraw(pos.vaultId, pos.shares)}
                disabled={txLoading}
              >
                Withdraw
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
