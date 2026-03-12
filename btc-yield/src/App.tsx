import React, { useState } from 'react'
import Header from './components/Header'
import Ticker from './components/Ticker'
import VaultCard from './components/VaultCard'
import DepositPanel from './components/DepositPanel'
import Positions from './components/Positions'
import { useYield } from './hooks/useYield'
import { VAULTS } from './abi/yield'

const STRATEGIES = [
  { name: 'OP_NET Native Staking', desc: 'Stake BTC-backed tokens on OP_NET consensus layer', icon: '🔒', alloc: 35, apy: 6.2 },
  { name: 'Motoswap LP Provision', desc: 'Provide liquidity to Motoswap AMM pairs', icon: '💧', alloc: 25, apy: 12.4 },
  { name: 'Yield Bond Protocol', desc: 'Fixed-term BTC yield bonds with guaranteed returns', icon: '📄', alloc: 20, apy: 8.1 },
  { name: 'Flash Loan Arbitrage', desc: 'Cross-protocol arb using OP_NET flash loans', icon: '⚡', alloc: 12, apy: 31.4 },
  { name: 'Block Reward Sharing', desc: 'Share in OP_NET block validation rewards', icon: '⛏️', alloc: 8, apy: 4.8 },
]

export default function App() {
  const [activeTab, setActiveTab] = useState('Dashboard')
  const [selectedVaultId, setSelectedVaultId] = useState(0)
  const [contractInput, setContractInput] = useState('')

  const {
    isConnected, walletAddress, walletBalance, btcPrice,
    contractAddress, setContractAddress,
    positions, vaultStates,
    loading, txLoading, error, lastTxHash, toast,
    totalDepositedSats, totalPendingYield,
    connectWallet, disconnectWallet,
    deposit, withdraw, claimYield, compoundYield,
    refresh, satsToUSD,
  } = useYield()

  const totalTVL = VAULTS.reduce((s, v) => {
    const st = vaultStates.find(vs => vs.id === v.id)
    return s + Number(st?.tvl ?? BigInt(Math.floor(v.tvlBTC * 1e8)))
  }, 0) / 1e8

  return (
    <>
      <Header
        isConnected={isConnected}
        walletAddress={walletAddress}
        walletBalance={walletBalance}
        btcPrice={btcPrice}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onConnect={connectWallet}
        onDisconnect={disconnectWallet}
      />
      <Ticker btcPrice={btcPrice} />

      <main className="main-layout">

        {/* Contract setup bar */}
        <div className="contract-setup">
          <span className="contract-setup-label">CONTRACT ADDRESS</span>
          {contractAddress ? (
            <>
              <span className="contract-addr-display">{contractAddress.slice(0, 20)}...{contractAddress.slice(-8)}</span>
              <button className="btn btn-outline btn-sm" onClick={() => setContractAddress('')}>Change</button>
              <button className="btn btn-outline btn-sm" onClick={refresh}>{loading ? <span className="spinner" /> : '↻ Refresh'}</button>
            </>
          ) : (
            <>
              <input
                className="contract-setup-input"
                placeholder="Paste your deployed YieldAggregator contract address..."
                value={contractInput}
                onChange={e => setContractInput(e.target.value)}
              />
              <button
                className="btn btn-primary btn-sm"
                onClick={() => { if (contractInput.trim()) setContractAddress(contractInput.trim()) }}
              >
                Connect Contract
              </button>
            </>
          )}
        </div>

        {error && (
          <div className="alert error" style={{ marginBottom: 20 }}>
            ⚠ {error}
            <button style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
              onClick={() => {}}>✕</button>
          </div>
        )}

        {lastTxHash && (
          <div className="alert success" style={{ marginBottom: 20 }}>
            ✅ Transaction submitted:&nbsp;
            <a
              className="tx-link"
              href={`https://scan.opnet.org/tx/${lastTxHash}`}
              target="_blank"
              rel="noreferrer"
            >
              {lastTxHash.slice(0, 16)}...
            </a>
          </div>
        )}

        {/* DASHBOARD TAB */}
        {activeTab === 'Dashboard' && (
          <div className="tab-content">
            <section className="hero">
              <div>
                <div className="hero-title">
                  Earn yield on<br /><em>Bitcoin L1.</em><br />No bridges.
                </div>
                <div className="hero-subtitle">
                  YieldBTC aggregates the best yield strategies on OP_NET — natively on Bitcoin Layer 1.
                  Auto-compound, multi-vault exposure, and real BTC rewards.
                </div>
                <div className="hero-stats">
                  <div>
                    <div className="hero-stat-label">Total TVL</div>
                    <div className="hero-stat-value">
                      {totalTVL.toFixed(3)}
                      <small>BTC</small>
                    </div>
                  </div>
                  <div>
                    <div className="hero-stat-label">Best APY</div>
                    <div className="hero-stat-value">
                      31.4%
                      <small>Omega</small>
                    </div>
                  </div>
                  <div>
                    <div className="hero-stat-label">Strategies</div>
                    <div className="hero-stat-value">
                      5
                      <small>Active</small>
                    </div>
                  </div>
                </div>
              </div>

              <div className="hero-right">
                <div className="hero-right-title">Live Vaults</div>
                {VAULTS.map(v => {
                  const state = vaultStates.find(s => s.id === v.id)
                  const apy = state?.apy ?? v.apy
                  return (
                    <div className="portfolio-row" key={v.id}>
                      <div className="portfolio-row-left">
                        <div className={`vault-icon ${v.key}`}>{v.emoji}</div>
                        <div>
                          <div className="vault-name">{v.name}</div>
                          <span className={`vault-tag ${v.riskClass}`}>{v.risk}</span>
                        </div>
                      </div>
                      <div className="vault-apy">{apy.toFixed(1)}% APY</div>
                    </div>
                  )
                })}
                <div style={{ marginTop: 16 }}>
                  <button className="btn btn-accent" style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => setActiveTab('Vaults')}>
                    Start Earning →
                  </button>
                </div>
              </div>
            </section>

            {/* Analytics summary */}
            <div className="analytics-grid">
              {[
                { label: 'Total TVL', value: `${totalTVL.toFixed(3)} BTC`, change: '+5.1% 24h' },
                { label: 'Avg APY', value: '17.4%', change: '+0.8% 7d', positive: true },
                { label: 'Protocol Fees Earned', value: '0.0162 BTC', change: 'all time' },
                { label: 'Active Depositors', value: '47', change: '+3 today', positive: true },
              ].map(card => (
                <div className="analytics-card" key={card.label}>
                  <div className="analytics-card-label">{card.label}</div>
                  <div className="analytics-card-value">{card.value}</div>
                  <div className="analytics-card-change">{card.change}</div>
                </div>
              ))}
            </div>

            {/* Strategies */}
            <div className="strategies-section">
              <div className="section-header">
                <div className="section-title">Active Strategies</div>
                <div className="section-sub">AUTO-REBALANCED EVERY 5 BLOCKS</div>
              </div>
              <div className="strategies-list">
                {STRATEGIES.map((s, i) => (
                  <div className="strategy-row" key={s.name}>
                    <span className="strategy-num">0{i + 1}</span>
                    <div className="strategy-icon">{s.icon}</div>
                    <div className="strategy-info">
                      <div className="strategy-name">{s.name}</div>
                      <div className="strategy-desc">{s.desc}</div>
                    </div>
                    <div className="strategy-allocation">
                      <div className="alloc-bar">
                        <div className="alloc-fill" style={{ width: `${s.alloc}%` }} />
                      </div>
                      {s.alloc}%
                    </div>
                    <div className="strategy-apy">{s.apy.toFixed(1)}%</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* VAULTS TAB */}
        {activeTab === 'Vaults' && (
          <div className="tab-content">
            <div className="section-header" style={{ marginBottom: 24 }}>
              <div className="section-title">Choose Your Vault</div>
              <div className="section-sub">CLICK A VAULT TO SELECT</div>
            </div>
            <div className="vaults-grid">
              {VAULTS.map(v => (
                <VaultCard
                  key={v.id}
                  vault={v}
                  state={vaultStates.find(s => s.id === v.id)}
                  selected={selectedVaultId === v.id}
                  onSelect={() => setSelectedVaultId(v.id)}
                  btcPrice={btcPrice}
                />
              ))}
            </div>

            <DepositPanel
              isConnected={isConnected}
              walletBalance={walletBalance}
              vaultStates={vaultStates}
              txLoading={txLoading}
              btcPrice={btcPrice}
              onDeposit={deposit}
              selectedVaultId={selectedVaultId}
              onVaultChange={setSelectedVaultId}
            />
          </div>
        )}

        {/* PORTFOLIO TAB */}
        {activeTab === 'Portfolio' && (
          <div className="tab-content">
            <div className="section-header" style={{ marginBottom: 24 }}>
              <div className="section-title">My Portfolio</div>
              <div className="section-sub">{isConnected ? walletAddress?.slice(0, 12) + '...' : 'NOT CONNECTED'}</div>
            </div>

            {isConnected && positions.length > 0 && (
              <div className="analytics-grid" style={{ marginBottom: 24 }}>
                <div className="analytics-card">
                  <div className="analytics-card-label">Total Deposited</div>
                  <div className="analytics-card-value">{(Number(totalDepositedSats) / 1e8).toFixed(6)}</div>
                  <div className="analytics-card-change">BTC</div>
                </div>
                <div className="analytics-card">
                  <div className="analytics-card-label">USD Value</div>
                  <div className="analytics-card-value">${satsToUSD(totalDepositedSats)}</div>
                  <div className="analytics-card-change">at current price</div>
                </div>
                <div className="analytics-card">
                  <div className="analytics-card-label">Pending Yield</div>
                  <div className="analytics-card-value">{(Number(totalPendingYield) / 1e8).toFixed(8)}</div>
                  <div className="analytics-card-change analytics-card-change" style={{ color: 'var(--green)' }}>BTC unclaimed</div>
                </div>
                <div className="analytics-card">
                  <div className="analytics-card-label">Active Vaults</div>
                  <div className="analytics-card-value">{positions.length}</div>
                  <div className="analytics-card-change">of 3 vaults</div>
                </div>
              </div>
            )}

            <div className="positions-section">
              <Positions
                positions={positions}
                vaultStates={vaultStates}
                isConnected={isConnected}
                txLoading={txLoading}
                btcPrice={btcPrice}
                satsToUSD={satsToUSD}
                onWithdraw={withdraw}
                onClaim={claimYield}
                onCompound={compoundYield}
              />
            </div>
          </div>
        )}

        {/* ANALYTICS TAB */}
        {activeTab === 'Analytics' && (
          <div className="tab-content">
            <div className="section-header" style={{ marginBottom: 24 }}>
              <div className="section-title">Protocol Analytics</div>
              <div className="section-sub">LIVE OP_NET DATA</div>
            </div>

            <div className="analytics-grid" style={{ marginBottom: 32 }}>
              {[
                { label: 'Alpha Vault TVL', value: `${VAULTS[0].tvlBTC} BTC`, change: '6.2% APY' },
                { label: 'Beta Vault TVL', value: `${VAULTS[1].tvlBTC} BTC`, change: '14.7% APY' },
                { label: 'Omega Vault TVL', value: `${VAULTS[2].tvlBTC} BTC`, change: '31.4% APY' },
                { label: 'Total Protocol TVL', value: `${totalTVL.toFixed(3)} BTC`, change: 'across 3 vaults' },
              ].map(c => (
                <div className="analytics-card" key={c.label}>
                  <div className="analytics-card-label">{c.label}</div>
                  <div className="analytics-card-value">{c.value}</div>
                  <div className="analytics-card-change">{c.change}</div>
                </div>
              ))}
            </div>

            <div className="strategies-section">
              <div className="section-header">
                <div className="section-title">Strategy Performance</div>
                <div className="section-sub">BLENDED APY: 17.4%</div>
              </div>
              <div className="strategies-list">
                {STRATEGIES.map((s, i) => (
                  <div className="strategy-row" key={s.name}>
                    <span className="strategy-num">0{i + 1}</span>
                    <div className="strategy-icon">{s.icon}</div>
                    <div className="strategy-info">
                      <div className="strategy-name">{s.name}</div>
                      <div className="strategy-desc">{s.desc}</div>
                    </div>
                    <div className="strategy-allocation">
                      <div className="alloc-bar">
                        <div className="alloc-fill" style={{ width: `${s.alloc}%` }} />
                      </div>
                      {s.alloc}% allocation
                    </div>
                    <div className="strategy-apy">{s.apy.toFixed(1)}% APY</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 32, padding: 24, background: 'var(--bg2)', border: '1.5px solid var(--border)', borderRadius: 16 }}>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, marginBottom: 16 }}>OP_NET Resources</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {[
                  { label: 'OP_NET Docs', url: 'https://docs.opnet.org' },
                  { label: 'OPScan Explorer', url: 'https://scan.opnet.org' },
                  { label: 'Motoswap DEX', url: 'https://motoswap.org' },
                  { label: 'Get OP_WALLET', url: 'https://opnet.org/wallet' },
                  { label: 'Vibecode Finance', url: 'https://vibecode.finance' },
                ].map(link => (
                  <a key={link.label} href={link.url} target="_blank" rel="noreferrer"
                    className="btn btn-outline btn-sm">
                    {link.label} ↗
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}

      </main>

      <footer style={{ borderTop: '1px solid var(--border)', padding: '24px', marginTop: 40 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 18 }}>YieldBTC</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)' }}>
            Built on OP_NET · Bitcoin L1 · Vibecode Challenge Week 3
          </span>
          <div style={{ display: 'flex', gap: 16 }}>
            {['OP_NET Docs', 'OPScan', 'Vibecode'].map(l => (
              <a key={l} href="#" style={{ fontSize: 12, color: 'var(--text3)', textDecoration: 'none' }}>{l}</a>
            ))}
          </div>
        </div>
      </footer>

      {toast && (
        <div className="toast">
          {toast}
        </div>
      )}
    </>
  )
}
