import { useState, useEffect, useCallback, useRef } from 'react'
import { VAULTS } from '../abi/yield'

export interface Position {
  vaultId: number
  deposited: bigint
  shares: bigint
  pendingYield: bigint
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
  const [walletBalance, setWalletBalance] = useState<number>(0)
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

  // ── Send transaction ──────────────────────────────────────────────────────
  // OP_NET wallet expects signAndBroadcastInteraction with:
  // { to: string, calldata: string, value: bigint }
  const sendTx = async (wallet: any, to: string, calldata: string, sats: number) => {
    if (wallet.signAndBroadcastInteraction) {
      return await wallet.signAndBroadcastInteraction({
        to,
        calldata,
        value: BigInt(sats),
      })
    }
    if (wallet.signInteraction) {
      const signed = await wallet.signInteraction({ to, calldata, value: BigInt(sats) })
      if (wallet.pushTx && signed) return await wallet.pushTx(signed)
      if (wallet.broadcast && signed) return await wallet.broadcast(signed)
      return signed
    }
    if (wallet.pushTx) return await wallet.pushTx({ to, calldata, value: sats })
    if (wallet.broadcast) return await wallet.broadcast({ to, calldata, value: sats })
    if (wallet.call) return await wallet.call({ to, calldata, value: sats })
    if (wallet.contractCall) return await wallet.contractCall({ to, calldata, value: sats })
    if (wallet.sendTransaction) return await wallet.sendTransaction({ to, data: calldata, value: sats.toString() })
    throw new Error('No compatible wallet method. Available: ' + Object.keys(wallet).join(', '))
  }

  // ── Connect wallet ────────────────────────────────────────────────────────
  const connectWallet = useCallback(async () => {
    setError(null)
    try {
      const wallet = getWallet()
      if (!wallet) {
        setError('OP_WALLET not found. Please install from opnet.org')
        return
      }
      const accounts = await wallet.requestAccounts()
      if (accounts && accounts.length > 0) {
        setWalletAddress(accounts[0])
        setIsConnected(true)
        try {
          const bal = await wallet.getBalance()
          setWalletBalance(Number(bal?.total ?? bal?.confirmed ?? 0))
        } catch (_) {}
        showToast('Wallet connected')
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

  // ── BTC price ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd')
        const data = await res.json()
        setBtcPrice(data?.bitcoin?.usd ?? 0)
      } catch (_) {}
    }
    fetchPrice()
    const iv = setInterval(fetchPrice, 30000)
    return () => clearInterval(iv)
  }, [])

  // ── Read-only contract call ───────────────────────────────────────────────
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
    } catch (_) { return null }
  }, [contractAddress, walletAddress])

  const parseSlots = (hex: string): string[] => {
    const raw = hex.startsWith('0x') ? hex.slice(2) : hex
    const slots: string[] = []
    for (let i = 0; i < raw.length; i += 64) slots.push(raw.slice(i, i + 64))
    return slots
  }

  // ── Fetch on-chain data ───────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!contractAddress) return
    setLoading(true)
    try {
      const vaultResult = await contractCall('0x11223344')
      if (vaultResult) {
        const slots = parseSlots(vaultResult)
        setVaultStates(VAULTS.map((v, i) => ({
          id: v.id,
          tvl: slots[i * 3] ? BigInt('0x' + slots[i * 3]) : BigInt(Math.floor(v.tvlBTC * 1e8)),
          totalShares: slots[i * 3 + 1] ? BigInt('0x' + slots[i * 3 + 1]) : 1000000n,
          apy: slots[i * 3 + 2] ? Number(BigInt('0x' + slots[i * 3 + 2])) / 100 : v.apy,
          isActive: true,
        })))
      } else {
        setVaultStates(VAULTS.map(v => ({
          id: v.id,
          tvl: BigInt(Math.floor(v.tvlBTC * 1e8)),
          totalShares: 1000000n,
          apy: v.apy,
          isActive: true,
        })))
      }
      if (walletAddress) {
        const addrHex = walletAddress.replace(/^(0x|bc1|tb1|opt1)/, '').padEnd(64, '0').slice(0, 64)
        const posResult = await contractCall('0x22334455', addrHex)
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

  useEffect(() => { if (contractAddress) fetchData() }, [contractAddress])
  useEffect(() => {
    if (!contractAddress) return
    const iv = setInterval(fetchData, 60000)
    return () => clearInterval(iv)
  }, [contractAddress, fetchData])

  // ── Actions ───────────────────────────────────────────────────────────────
  const deposit = useCallback(async (vaultId: number, amountSats: bigint) => {
    if (!isConnected) { setError('Connect your wallet first'); return }
    if (!contractAddress) { setError('Set contract address first'); return }
    setTxLoading(true)
    setError(null)
    try {
      const wallet = getWallet()
      // Contract reads vaultId from calldata, amount from Blockchain.tx.value
      const cd = '0xaabbccdd' + vaultId.toString(16).padStart(64, '0')
      const result = await sendTx(wallet, contractAddress, cd, Number(amountSats))
      const txid = result?.transactionId || result?.txid || result?.txHash || result?.hash || result?.id
      if (txid) {
        setLastTxHash(String(txid))
        showToast('Deposited! TX: ' + String(txid).slice(0, 12) + '...')
      } else {
        showToast('Deposit submitted!')
      }
      setTimeout(fetchData, 8000)
      setPositions(prev => {
        const ex = prev.find(p => p.vaultId === vaultId)
        if (ex) return prev.map(p => p.vaultId === vaultId ? { ...p, deposited: p.deposited + amountSats } : p)
        return [...prev, { vaultId, deposited: amountSats, shares: amountSats, pendingYield: 0n, depositBlock: 0n }]
      })
      setWalletBalance(b => Math.max(0, b - Number(amountSats)))
    } catch (e: any) {
      setError(e?.message || JSON.stringify(e) || 'Transaction failed')
    } finally {
      setTxLoading(false)
    }
  }, [isConnected, contractAddress, fetchData])

  const withdraw = useCallback(async (vaultId: number, sharesToWithdraw: bigint) => {
    if (!isConnected || !contractAddress) return
    setTxLoading(true)
    setError(null)
    try {
      const wallet = getWallet()
      const cd = '0xbbccddee' +
        vaultId.toString(16).padStart(64, '0') +
        sharesToWithdraw.toString(16).padStart(64, '0')
      const result = await sendTx(wallet, contractAddress, cd, 0)
      const txid = result?.transactionId || result?.txid || result?.txHash || result?.hash
      if (txid) { setLastTxHash(String(txid)); showToast('Withdrawn! TX: ' + String(txid).slice(0, 12) + '...') }
      else showToast('Withdrawal submitted!')
      setTimeout(fetchData, 8000)
      setPositions(prev => prev.filter(p => p.vaultId !== vaultId))
    } catch (e: any) {
      setError(e?.message || 'Withdrawal failed')
    } finally {
      setTxLoading(false)
    }
  }, [isConnected, contractAddress, fetchData])

  const claimYield = useCallback(async (vaultId: number) => {
    if (!isConnected || !contractAddress) return
    setTxLoading(true)
    setError(null)
    try {
      const wallet = getWallet()
      const cd = '0xccddeeff' + vaultId.toString(16).padStart(64, '0')
      const result = await sendTx(wallet, contractAddress, cd, 0)
      const txid = result?.transactionId || result?.txid || result?.txHash || result?.hash
      if (txid) { setLastTxHash(String(txid)); showToast('Yield claimed! TX: ' + String(txid).slice(0, 12) + '...') }
      else showToast('Claim submitted!')
      setPositions(prev => prev.map(p => p.vaultId === vaultId ? { ...p, pendingYield: 0n } : p))
      setTimeout(fetchData, 8000)
    } catch (e: any) {
      setError(e?.message || 'Claim failed')
    } finally {
      setTxLoading(false)
    }
  }, [isConnected, contractAddress, fetchData])

  const compoundYield = useCallback(async (vaultId: number) => {
    if (!isConnected || !contractAddress) return
    setTxLoading(true)
    setError(null)
    try {
      const wallet = getWallet()
      const cd = '0xddeeff00' + vaultId.toString(16).padStart(64, '0')
      const result = await sendTx(wallet, contractAddress, cd, 0)
      const txid = result?.transactionId || result?.txid || result?.txHash || result?.hash
      if (txid) { setLastTxHash(String(txid)); showToast('Compounded! TX: ' + String(txid).slice(0, 12) + '...') }
      else showToast('Compound submitted!')
      setTimeout(fetchData, 8000)
    } catch (e: any) {
      setError(e?.message || 'Compound failed')
    } finally {
      setTxLoading(false)
    }
  }, [isConnected, contractAddress, fetchData])

  const totalDepositedSats = positions.reduce((s, p) => s + p.deposited, 0n)
  const totalPendingYield = positions.reduce((s, p) => s + p.pendingYield, 0n)
  const satsToUSD = (sats: bigint) =>
    btcPrice > 0 ? ((Number(sats) / 1e8) * btcPrice).toFixed(2) : '—'

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
