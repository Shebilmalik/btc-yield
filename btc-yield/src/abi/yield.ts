// YieldAggregator contract selectors
export const SELECTORS = {
  // Read
  getVaultInfo:       '0x11223344',
  getUserPosition:    '0x22334455',
  getTotalTVL:        '0x33445566',
  getPendingYield:    '0x44556677',
  getStrategyWeights: '0x55667788',

  // Write
  deposit:            '0xaabbccdd',
  withdraw:           '0xbbccddee',
  claimYield:         '0xccddeeff',
  compoundYield:      '0xddeeff00',
  rebalance:          '0xeeff0011',
}

export const VAULT_IDS = {
  ALPHA: 0,   // Conservative — staking rewards
  BETA:  1,   // Balanced — LP fees + staking
  OMEGA: 2,   // Aggressive — flash loans + arbitrage
}

export const VAULTS = [
  {
    id: VAULT_IDS.ALPHA,
    key: 'alpha',
    name: 'Alpha Vault',
    emoji: '🛡️',
    risk: 'LOW RISK',
    riskClass: 'low',
    apy: 6.2,
    minDeposit: 5000,        // sats
    strategies: ['OP_NET Staking', 'Block Reward Sharing'],
    desc: 'Conservative strategy focusing on OP_NET native staking rewards. Ideal for long-term BTC holders seeking steady, predictable yield.',
    tvlBTC: 1.842,
    maxTvlBTC: 5.0,
    color: 'var(--green)',
  },
  {
    id: VAULT_IDS.BETA,
    key: 'beta',
    name: 'Beta Vault',
    emoji: '⚡',
    risk: 'MEDIUM',
    riskClass: 'medium',
    apy: 14.7,
    minDeposit: 10000,
    strategies: ['Motoswap LP', 'Yield Bonds', 'Staking Boost'],
    desc: 'Balanced exposure across liquidity provision on Motoswap and yield bond instruments. Auto-rebalances weekly to optimize returns.',
    tvlBTC: 0.917,
    maxTvlBTC: 3.0,
    color: 'var(--blue)',
  },
  {
    id: VAULT_IDS.OMEGA,
    key: 'omega',
    name: 'Omega Vault',
    emoji: '🔥',
    risk: 'HIGH',
    riskClass: 'high',
    apy: 31.4,
    minDeposit: 50000,
    strategies: ['Flash Loan Arb', 'Cross-Protocol LP', 'Yield Bonds'],
    desc: 'High-yield strategy using flash loans and cross-protocol arbitrage on OP_NET. Maximum returns with commensurate risk.',
    tvlBTC: 0.423,
    maxTvlBTC: 2.0,
    color: 'var(--gold)',
  },
]
