import React, { useState } from 'react'
import { VAULTS } from '../abi/yield'
import type { VaultState } from '../hooks/useYield'

interface DepositPanelProps {
  isConnected: boolean
  walletBalance: number
  vaultStates: VaultState[]
  txLoading: boolean
  btcPrice: number
  onDeposit: (vaultId: number, amountSats: bigint) => Promise<void>
  selectedVaultId: number
  onVaultChange: (id: number) => void
}

export default function DepositPanel({
  isConnected, walletBalance, vaultStates, txLoading, btcPrice,
  onDeposit, selectedVaultId, onVaultChange
}: DepositPanelProps) {
  const [amount, setAmount] = useState('')
  const vault = VAULTS[selectedVaultId]
  const amountSats = Math.floor(parseFloat(amount || '0') * 1e8)
  const usdValue = btcPrice > 0 ? (parseFloat(amount || '0') * btcPrice).toFixed(2) : '—'
  const estimatedYearlyYield = parseFloat(amount || '0') * (vault.apy / 100)
  const isValid = amountSats >= vault.minDeposit && amountSats <= walletBalance

  const handleMax = () => {
    setAmount(((walletBalance - 1000) / 1e8).toFixed(8))
  }

  const handleDeposit = async () => {
    if (!isValid) return
    await onDeposit(selectedVaultId, BigInt(amountSats))
    setAmount('')
  }

  return (
    <div className="deposit-panel">
      <div className="deposit-panel-title">Deposit BTC</div>
      <div className="deposit-panel-sub">
        Choose a vault and deposit BTC to start earning yield on Bitcoin L1
      </div>

      <div className="deposit-layout">
        <div>
          <label className="input-label">Select Vault</label>
          <div className="vault-select-row">
            {VAULTS.map(v => {
              const state = vaultStates.find(s => s.id === v.id)
              const apy = state?.apy ?? v.apy
              return (
                <button
                  key={v.id}
                  className={`vault-select-btn${selectedVaultId === v.id ? ` active ${v.key}` : ''}`}
                  onClick={() => onVaultChange(v.id)}
                >
                  <div className="vault-select-name">{v.name}</div>
                  <div className={`vault-select-apy ${v.key}`}>{apy.toFixed(1)}%</div>
                </button>
              )
            })}
          </div>

          <div className="input-group">
            <label className="input-label">Amount (BTC)</label>
            <div className="input-wrap">
              <input
                className="input-field"
                type="number"
                placeholder="0.00000000"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                step="0.00001"
                min="0"
              />
              {isConnected && (
                <button className="input-max" onClick={handleMax}>MAX</button>
              )}
            </div>
            <div className="input-hint">
              {isConnected
                ? `Balance: ${(walletBalance / 1e8).toFixed(8)} BTC · Min: ${(vault.minDeposit / 1e8).toFixed(5)} BTC`
                : 'Connect wallet to see balance'}
            </div>
          </div>
        </div>

        <div>
          <label className="input-label">Deposit Summary</label>
          <div className="deposit-summary">
            <div className="summary-row">
              <span className="label">Vault</span>
              <span className="value">{vault.name}</span>
            </div>
            <div className="summary-row">
              <span className="label">Amount</span>
              <span className="value">{amount || '0'} BTC</span>
            </div>
            <div className="summary-row">
              <span className="label">USD Value</span>
              <span className="value">${usdValue}</span>
            </div>
            <hr className="summary-divider" />
            <div className="summary-row">
              <span className="label">APY</span>
              <span className="value green">{vault.apy.toFixed(1)}%</span>
            </div>
            <div className="summary-row">
              <span className="label">Est. Yearly Yield</span>
              <span className="value green">
                {estimatedYearlyYield > 0 ? `+${estimatedYearlyYield.toFixed(6)} BTC` : '—'}
              </span>
            </div>
            <div className="summary-row">
              <span className="label">Strategy</span>
              <span className="value" style={{ fontSize: 11, textAlign: 'right', maxWidth: 160 }}>
                {vault.strategies.join(' + ')}
              </span>
            </div>
            <hr className="summary-divider" />
            <div className="summary-row">
              <span className="label">Protocol Fee</span>
              <span className="value">0.5%</span>
            </div>
          </div>

          {!isConnected ? (
            <div className="alert info">
              🔗 Connect your OP_WALLET to deposit
            </div>
          ) : !isValid && amount ? (
            <div className="alert error">
              {amountSats < vault.minDeposit
                ? `Min deposit: ${(vault.minDeposit / 1e8).toFixed(5)} BTC`
                : 'Insufficient balance'}
            </div>
          ) : null}

          <button
            className="btn btn-accent"
            style={{ width: '100%', justifyContent: 'center', padding: '13px' }}
            onClick={handleDeposit}
            disabled={!isConnected || !isValid || txLoading}
          >
            {txLoading
              ? <><span className="spinner" />&nbsp;Depositing...</>
              : `Deposit into ${vault.name}`}
          </button>
        </div>
      </div>
    </div>
  )
}
