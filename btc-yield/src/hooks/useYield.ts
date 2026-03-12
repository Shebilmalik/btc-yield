import { useState, useEffect, useCallback, useRef } from 'react'
import { SELECTORS, VAULT_IDS, VAULTS } from '../abi/yield'

export interface Position {
  vaultId: number
  deposited: bigint       // sats
  shares: bigint
  pendingYield: bigint    // sats
  depositBlock: bigint
}

export interface VaultState {
  id: number
  tvl: bigint
  totalShares: bigint
  apy: number
  isActive: boolean
}

export function useYield() {
  const [isConnected, setIsConnected] = useState(false)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [walletBalance, setWalletBalance] = useState<number>(0)     // sats
  const [contractAddress, setContractAddress] = useState('')
  const [positions, setPositions] = useState<Position[]>([])
  const [vaultStates, setVaultStates] = useState<VaultState[]>([])
  const [loading, setLoading] = useState(false)
  const [txLoading, setTxLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastTxHash, setLastTxHash] = useState<string | null>(null)
  const [btcPrice, setBtcPrice] = useState<number>(0)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 4000)
  }

  const getWallet = () =>
    (window as any).opnet ||
    (window as any).bitcoin ||
    (window as any).unisat

  // Connect wallet
  const connectWallet = useCallback(async () => {
    setError(null)
    try {
      const wallet = getWallet()
      if (!wallet) {
        setError('OP_WALLET not found. Please install from opnet.org')
        return
      }
      const accounts = await wallet.requestAccounts()
      if (accounts?.length > 0) {
        setWalletAddress(accounts[0])
        setIsConnected(true)
        try {
          const bal = await wallet.getBalance()
          const total = Number(bal?.total ?? bal?.confirmed ?? 0)
          setWalletBalance(total)
        } catch (_) {}
        showToast('✅ Wallet connected')
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to connect wallet')
    }
  }, [])

  const disconnectWallet = useCallback(() => {
    setIsConnected(false)
    setWalletAddress(null)
    setWalletBalance(0)
    setPositions([])
    showToast('Wallet disconnected')
  }, [])

  // Fetch BTC price from CoinGecko
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const res = await fetch(
          'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd'
        )
        const data = await res.json()
        setBtcPrice(data?.bitcoin?.usd ?? 0)
      } catch (_) {}
    }
    fetchPrice()
    const interval = setInterval(fetchPrice, 30000)
    return () => clearInterval(interval)
  }, [])

  // Call contract read method
  const contractCall = useCallback(async (selector: string, extraData = '') => {
    if (!contractAddress) return null
    try {
      const res = await fetch('https://api.opnet.org/api/v1/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: contractAddress,
          data: selector + extraData,
          from: walletAddress || '0x0000000000000000000000000000000000000000',
          network: 'testnet',
        }),
      })
      if (!res.ok) return null
      const json = await res.json()
      return json?.result ?? null
    } catch (_) {
      return null
    }
  }, [contractAddress, walletAddress])

  // Parse hex slots
  const parseSlots = (hex: string): string[] => {
    const raw = hex.startsWith('0x') ? hex.slice(2) : hex
    const slots: string[] = []
    for (let i = 0; i < raw.length; i += 64) {
      slots.push(raw.slice(i, i + 64))
    }
    return slots
  }

  // Fetch vault + position data
  const fetchData = useCallback(async () => {
    if (!contractAddress) return
    setLoading(true)
    try {
      // Try to get vault info from chain
      const vaultResult = await contractCall(SELECTORS.getVaultInfo)

      if (vaultResult) {
        const slots = parseSlots(vaultResult)
        const states: VaultState[] = VAULTS.map((v, i) => ({
          id: v.id,
          tvl: slots[i * 3] ? BigInt('0x' + slots[i * 3]) : BigInt(Math.floor(v.tvlBTC * 1e8)),
          totalShares: slots[i * 3 + 1] ? BigInt('0x' + slots[i * 3 + 1]) : 1000000n,
          apy: slots[i * 3 + 2] ? Number(BigInt('0x' + slots[i * 3 + 2])) / 100 : v.apy,
          isActive: true,
        }))
        setVaultStates(states)
      } else {
        // Use static defaults if contract not responding
        setVaultStates(VAULTS.map(v => ({
          id: v.id,
          tvl: BigInt(Math.floor(v.tvlBTC * 1e8)),
          totalShares: 1000000n,
          apy: v.apy,
          isActive: true,
        })))
      }

      // Fetch user positions if connected
      if (walletAddress) {
        const addrHex = walletAddress.replace(/^(0x|bc1|tb1|opt1)/, '').padEnd(64, '0').slice(0, 64)
        const posResult = await contractCall(SELECTORS.getUserPosition, addrHex)
        if (posResult) {
          const slots = parseSlots(posResult)
          const posArr: Position[] = []
          for (let i = 0; i < 3; i++) {
            const deposited = slots[i * 4] ? BigInt('0x' + slots[i * 4]) : 0n
            if (deposited > 0n) {
              posArr.push({
                vaultId: i,
                deposited,
                shares: slots[i * 4 + 1] ? BigInt('0x' + slots[i * 4 + 1]) : 0n,
                pendingYield: slots[i * 4 + 2] ? BigInt('0x' + slots[i * 4 + 2]) : 0n,
                depositBlock: slots[i * 4 + 3] ? BigInt('0x' + slots[i * 4 + 3]) : 0n,
              })
            }
          }
          setPositions(posArr)
        }
      }
    } catch (_) {
    } finally {
      setLoading(false)
    }
  }, [contractAddress, walletAddress, contractCall])

  useEffect(() => {
    if (contractAddress) fetchData()
  }, [contractAddress])

  useEffect(() => {
    if (!contractAddress) return
    const interval = setInterval(fetchData, 60000)
    return () => clearInterval(interval)
  }, [contractAddress, fetchData])

  // Deposit into vault
  const deposit = useCallback(async (vaultId: number, amountSats: bigint) => {
    if (!isConnected) { setError('Connect your wallet first'); return }
    if (!contractAddress) { setError('Set contract address first'); return }
    setTxLoading(true)
    setError(null)
    try {
      const wallet = getWallet()
      const vaultIdHex = vaultId.toString(16).padStart(64, '0')
      const amountHex = amountSats.toString(16).padStart(64, '0')

      const result = await wallet.signAndBroadcastTransaction?.({
  to: contractAddress,
  calldata: SELECTORS.deposit + vaultIdHex + amountHex,
  sats: Number(amountSats),
}) ?? await wallet.sendOpNetTransaction?.({
  to: contractAddress,
  calldata: SELECTORS.deposit + vaultIdHex + amountHex,
  sats: Number(amountSats),
}) ?? await wallet.sendTransaction?.({
  to: contractAddress,
  data: SELECTORS.deposit + vaultIdHex + amountHex,
  value: amountSats.toString(),
})
        to: contractAddress,
        data: SELECTORS.deposit + vaultIdHex + amountHex,
        value: amountSats.toString(),
      })

      if (result?.txid) {
        setLastTxHash(result.txid)
        showToast(`✅ Deposited! TX: ${result.txid.slice(0, 12)}...`)
        setTimeout(fetchData, 8000)
        // Optimistic update
        const vault = VAULTS[vaultId]
        setPositions(prev => {
          const existing = prev.find(p => p.vaultId === vaultId)
          if (existing) {
            return prev.map(p => p.vaultId === vaultId
              ? { ...p, deposited: p.deposited + amountSats }
              : p)
          }
          return [...prev, { vaultId, deposited: amountSats, shares: amountSats, pendingYield: 0n, depositBlock: 0n }]
        })
        // Update balance
        setWalletBalance(b => Math.max(0, b - Number(amountSats)))
      }
    } catch (e: any) {
      setError(e?.message || 'Transaction failed. Please try again.')
    } finally {
      setTxLoading(false)
    }
  }, [isConnected, contractAddress, fetchData])

  // Withdraw from vault
  const withdraw = useCallback(async (vaultId: number, sharesToWithdraw: bigint) => {
    if (!isConnected || !contractAddress) return
    setTxLoading(true)
    setError(null)
    try {
      const wallet = getWallet()
      const vaultIdHex = vaultId.toString(16).padStart(64, '0')
      const sharesHex = sharesToWithdraw.toString(16).padStart(64, '0')

      const result = await wallet.signAndBroadcastTransaction?.({
        to: contractAddress,
        data: SELECTORS.withdraw + vaultIdHex + sharesHex,
        value: '0',
      }) ?? await wallet.sendTransaction?.({
        to: contractAddress,
        data: SELECTORS.withdraw + vaultIdHex + sharesHex,
        value: '0',
      })

      if (result?.txid) {
        setLastTxHash(result.txid)
        showToast(`✅ Withdrawal submitted! TX: ${result.txid.slice(0, 12)}...`)
        setTimeout(fetchData, 8000)
        setPositions(prev => prev.filter(p => p.vaultId !== vaultId))
      }
    } catch (e: any) {
      setError(e?.message || 'Withdrawal failed')
    } finally {
      setTxLoading(false)
    }
  }, [isConnected, contractAddress, fetchData])

  // Claim yield
  const claimYield = useCallback(async (vaultId: number) => {
    if (!isConnected || !contractAddress) return
    setTxLoading(true)
    setError(null)
    try {
      const wallet = getWallet()
      const vaultIdHex = vaultId.toString(16).padStart(64, '0')

      const result = await wallet.signAndBroadcastTransaction?.({
        to: contractAddress,
        data: SELECTORS.claimYield + vaultIdHex,
        value: '0',
      }) ?? await wallet.sendTransaction?.({
        to: contractAddress,
        data: SELECTORS.claimYield + vaultIdHex,
        value: '0',
      })

      if (result?.txid) {
        setLastTxHash(result.txid)
        showToast(`✅ Yield claimed! TX: ${result.txid.slice(0, 12)}...`)
        setPositions(prev => prev.map(p => p.vaultId === vaultId ? { ...p, pendingYield: 0n } : p))
        setTimeout(fetchData, 8000)
      }
    } catch (e: any) {
      setError(e?.message || 'Claim failed')
    } finally {
      setTxLoading(false)
    }
  }, [isConnected, contractAddress, fetchData])

  // Auto-compound
  const compoundYield = useCallback(async (vaultId: number) => {
    if (!isConnected || !contractAddress) return
    setTxLoading(true)
    setError(null)
    try {
      const wallet = getWallet()
      const vaultIdHex = vaultId.toString(16).padStart(64, '0')

      const result = await wallet.signAndBroadcastTransaction?.({
        to: contractAddress,
        data: SELECTORS.compoundYield + vaultIdHex,
        value: '0',
      }) ?? await wallet.sendTransaction?.({
        to: contractAddress,
        data: SELECTORS.compoundYield + vaultIdHex,
        value: '0',
      })

      if (result?.txid) {
        setLastTxHash(result.txid)
        showToast(`⚡ Compounded! TX: ${result.txid.slice(0, 12)}...`)
        setTimeout(fetchData, 8000)
      }
    } catch (e: any) {
      setError(e?.message || 'Compound failed')
    } finally {
      setTxLoading(false)
    }
  }, [isConnected, contractAddress, fetchData])

  // Helpers
  const totalDepositedSats = positions.reduce((s, p) => s + p.deposited, 0n)
  const totalPendingYield = positions.reduce((s, p) => s + p.pendingYield, 0n)
  const satsToUSD = (sats: bigint) => btcPrice > 0
    ? ((Number(sats) / 1e8) * btcPrice).toFixed(2)
    : '—'

  return {
    isConnected, walletAddress, walletBalance, btcPrice,
    contractAddress, setContractAddress,
    positions, vaultStates,
    loading, txLoading, error, lastTxHash, toast,
    totalDepositedSats, totalPendingYield,
    connectWallet, disconnectWallet,
    deposit, withdraw, claimYield, compoundYield,
    refresh: fetchData,
    satsToUSD,
  }
}
