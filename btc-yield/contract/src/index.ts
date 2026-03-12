import {
  Blockchain,
  BytesWriter,
  Calldata,
  encodeSelector,
  OP_NET,
  Revert,
  SafeMath,
  StoredU256,
  u256,
} from '@btc-vision/btc-runtime/runtime'

// Vault IDs
const VAULT_ALPHA: u8 = 0
const VAULT_BETA:  u8 = 1
const VAULT_OMEGA: u8 = 2

// APY in basis points
const APY_ALPHA: u64 = 620
const APY_BETA:  u64 = 1470
const APY_OMEGA: u64 = 3140
const BLOCKS_PER_YEAR: u64 = 52560
const FEE_BPS: u64 = 50

// Storage pointers
const PTR_TVL_ALPHA:          u16 = 0x0010
const PTR_TVL_BETA:           u16 = 0x0011
const PTR_TVL_OMEGA:          u16 = 0x0012
const PTR_SHARES_ALPHA:       u16 = 0x0020
const PTR_SHARES_BETA:        u16 = 0x0021
const PTR_SHARES_OMEGA:       u16 = 0x0022
const PTR_TOTAL_FEES:         u16 = 0x0030
const PTR_USER_DEPOSITED:     u16 = 0x0100
const PTR_USER_SHARES:        u16 = 0x0200
const PTR_USER_DEPOSIT_BLOCK: u16 = 0x0300

// ── Storage helpers ───────────────────────────────────────────────────────────

function loadU256(ptr: u16): u256 {
  const stored = new StoredU256(ptr, u256.Zero)
  return stored.value
}

function saveU256(ptr: u16, val: u256): void {
  const stored = new StoredU256(ptr, u256.Zero)
  stored.value = val
}

function loadUserU256(base: u16, subKey: u256, vaultId: u8): u256 {
  const ptr = u256.fromU32((base as u32) + (vaultId as u32))
  const stored = new StoredU256(base, subKey)
  return stored.value
}

function saveUserU256(base: u16, subKey: u256, vaultId: u8, val: u256): void {
  const stored = new StoredU256(base, subKey)
  stored.value = val
}

// ── Vault helpers ─────────────────────────────────────────────────────────────

function getVaultTVL(vaultId: u8): u256 {
  if (vaultId == VAULT_ALPHA) return loadU256(PTR_TVL_ALPHA)
  if (vaultId == VAULT_BETA)  return loadU256(PTR_TVL_BETA)
  return loadU256(PTR_TVL_OMEGA)
}

function setVaultTVL(vaultId: u8, v: u256): void {
  if (vaultId == VAULT_ALPHA) { saveU256(PTR_TVL_ALPHA, v); return }
  if (vaultId == VAULT_BETA)  { saveU256(PTR_TVL_BETA,  v); return }
  saveU256(PTR_TVL_OMEGA, v)
}

function getVaultShares(vaultId: u8): u256 {
  if (vaultId == VAULT_ALPHA) return loadU256(PTR_SHARES_ALPHA)
  if (vaultId == VAULT_BETA)  return loadU256(PTR_SHARES_BETA)
  return loadU256(PTR_SHARES_OMEGA)
}

function setVaultShares(vaultId: u8, v: u256): void {
  if (vaultId == VAULT_ALPHA) { saveU256(PTR_SHARES_ALPHA, v); return }
  if (vaultId == VAULT_BETA)  { saveU256(PTR_SHARES_BETA,  v); return }
  saveU256(PTR_SHARES_OMEGA, v)
}

function getVaultAPY(vaultId: u8): u64 {
  if (vaultId == VAULT_ALPHA) return APY_ALPHA
  if (vaultId == VAULT_BETA)  return APY_BETA
  return APY_OMEGA
}

// ── User storage helpers ──────────────────────────────────────────────────────

function userKey(vaultId: u8): u256 {
  return u256.fromU32(vaultId as u32)
}

function getUserDeposited(callerHash: u256, vaultId: u8): u256 {
  const key = SafeMath.add(callerHash, userKey(vaultId))
  const stored = new StoredU256(PTR_USER_DEPOSITED, key)
  return stored.value
}

function setUserDeposited(callerHash: u256, vaultId: u8, v: u256): void {
  const key = SafeMath.add(callerHash, userKey(vaultId))
  const stored = new StoredU256(PTR_USER_DEPOSITED, key)
  stored.value = v
}

function getUserShares(callerHash: u256, vaultId: u8): u256 {
  const key = SafeMath.add(callerHash, userKey(vaultId))
  const stored = new StoredU256(PTR_USER_SHARES, key)
  return stored.value
}

function setUserShares(callerHash: u256, vaultId: u8, v: u256): void {
  const key = SafeMath.add(callerHash, userKey(vaultId))
  const stored = new StoredU256(PTR_USER_SHARES, key)
  stored.value = v
}

function getUserDepositBlock(callerHash: u256, vaultId: u8): u256 {
  const key = SafeMath.add(callerHash, userKey(vaultId))
  const stored = new StoredU256(PTR_USER_DEPOSIT_BLOCK, key)
  return stored.value
}

function setUserDepositBlock(callerHash: u256, vaultId: u8, v: u256): void {
  const key = SafeMath.add(callerHash, userKey(vaultId))
  const stored = new StoredU256(PTR_USER_DEPOSIT_BLOCK, key)
  stored.value = v
}

function calcPendingYield(deposited: u256, vaultId: u8, depositBlock: u256): u256 {
  if (u256.eq(deposited, u256.Zero)) return u256.Zero
  const currentBlock = u256.fromU64(Blockchain.block.numberU64)
  if (u256.le(currentBlock, depositBlock)) return u256.Zero
  const blocksPassed = SafeMath.sub(currentBlock, depositBlock)
  const apyBps = u256.fromU64(getVaultAPY(vaultId))
  const numerator = SafeMath.mul(SafeMath.mul(deposited, apyBps), blocksPassed)
  const denominator = u256.fromU64(10000 * BLOCKS_PER_YEAR)
  return SafeMath.div(numerator, denominator)
}

// ── Contract class ────────────────────────────────────────────────────────────

@final
class YieldAggregator extends OP_NET {

  constructor() {
    super()
  }

  public override callMethod(method: Selector, calldata: Calldata): BytesWriter {
    switch (method) {
      case encodeSelector('getVaultInfo'):    return this.getVaultInfo()
      case encodeSelector('getUserPosition'): return this.getUserPosition(calldata)
      case encodeSelector('deposit'):         return this.deposit(calldata)
      case encodeSelector('withdraw'):        return this.withdraw(calldata)
      case encodeSelector('claimYield'):      return this.claimYield(calldata)
      case encodeSelector('compoundYield'):   return this.compoundYield(calldata)
      default:
        throw new Revert('Unknown method')
    }
  }

  private getVaultInfo(): BytesWriter {
    const writer = new BytesWriter(9 * 32)
    writer.writeU256(loadU256(PTR_TVL_ALPHA))
    writer.writeU256(loadU256(PTR_SHARES_ALPHA))
    writer.writeU256(u256.fromU64(APY_ALPHA))
    writer.writeU256(loadU256(PTR_TVL_BETA))
    writer.writeU256(loadU256(PTR_SHARES_BETA))
    writer.writeU256(u256.fromU64(APY_BETA))
    writer.writeU256(loadU256(PTR_TVL_OMEGA))
    writer.writeU256(loadU256(PTR_SHARES_OMEGA))
    writer.writeU256(u256.fromU64(APY_OMEGA))
    return writer
  }

  private getUserPosition(calldata: Calldata): BytesWriter {
    const callerHash = calldata.readU256()
    const writer = new BytesWriter(12 * 32)
    for (let vaultId: u8 = 0; vaultId < 3; vaultId++) {
      const deposited   = getUserDeposited(callerHash, vaultId)
      const shares      = getUserShares(callerHash, vaultId)
      const depositBl   = getUserDepositBlock(callerHash, vaultId)
      const pending     = calcPendingYield(deposited, vaultId, depositBl)
      writer.writeU256(deposited)
      writer.writeU256(shares)
      writer.writeU256(pending)
      writer.writeU256(depositBl)
    }
    return writer
  }

  private deposit(calldata: Calldata): BytesWriter {
    const vaultId  = calldata.readU8()
    const amount   = Blockchain.tx.satoshis // BTC sent in sats
    const caller   = Blockchain.tx.sender

    if (u256.eq(amount, u256.Zero)) throw new Revert('Amount must be > 0')
    if (vaultId >= 3)               throw new Revert('Invalid vault')

    const fee       = SafeMath.div(SafeMath.mul(amount, u256.fromU64(FEE_BPS)), u256.fromU64(10000))
    const netAmount = SafeMath.sub(amount, fee)

    const currentTVL  = getVaultTVL(vaultId)
    const totalShares = getVaultShares(vaultId)

    let newShares: u256
    if (u256.eq(totalShares, u256.Zero)) {
      newShares = netAmount
    } else {
      newShares = SafeMath.div(SafeMath.mul(netAmount, totalShares), currentTVL)
    }

    setVaultTVL(vaultId,    SafeMath.add(currentTVL, netAmount))
    setVaultShares(vaultId, SafeMath.add(totalShares, newShares))

    const callerHash = caller.toU256()
    setUserDeposited(callerHash, vaultId,    SafeMath.add(getUserDeposited(callerHash, vaultId), netAmount))
    setUserShares(callerHash, vaultId,       SafeMath.add(getUserShares(callerHash, vaultId), newShares))
    setUserDepositBlock(callerHash, vaultId, u256.fromU64(Blockchain.block.numberU64))

    const totalFees = loadU256(PTR_TOTAL_FEES)
    saveU256(PTR_TOTAL_FEES, SafeMath.add(totalFees, fee))

    const writer = new BytesWriter(32)
    writer.writeU256(newShares)
    return writer
  }

  private withdraw(calldata: Calldata): BytesWriter {
    const vaultId      = calldata.readU8()
    const sharesToBurn = calldata.readU256()
    const caller       = Blockchain.tx.sender
    const callerHash   = caller.toU256()

    const userShares  = getUserShares(callerHash, vaultId)
    if (!u256.ge(userShares, sharesToBurn)) throw new Revert('Insufficient shares')

    const totalShares = getVaultShares(vaultId)
    const vaultTVL    = getVaultTVL(vaultId)
    const btcToReturn = SafeMath.div(SafeMath.mul(sharesToBurn, vaultTVL), totalShares)

    setVaultTVL(vaultId,    SafeMath.sub(vaultTVL, btcToReturn))
    setVaultShares(vaultId, SafeMath.sub(totalShares, sharesToBurn))

    const prevDeposited = getUserDeposited(callerHash, vaultId)
    const newDeposited  = u256.ge(prevDeposited, btcToReturn)
      ? SafeMath.sub(prevDeposited, btcToReturn)
      : u256.Zero
    setUserDeposited(callerHash, vaultId, newDeposited)
    setUserShares(callerHash, vaultId, SafeMath.sub(userShares, sharesToBurn))

    const writer = new BytesWriter(32)
    writer.writeU256(btcToReturn)
    return writer
  }

  private claimYield(calldata: Calldata): BytesWriter {
    const vaultId    = calldata.readU8()
    const caller     = Blockchain.tx.sender
    const callerHash = caller.toU256()

    const deposited    = getUserDeposited(callerHash, vaultId)
    const depositBlock = getUserDepositBlock(callerHash, vaultId)
    const pending      = calcPendingYield(deposited, vaultId, depositBlock)

    if (!u256.gt(pending, u256.Zero)) throw new Revert('No yield to claim')

    setUserDepositBlock(callerHash, vaultId, u256.fromU64(Blockchain.block.numberU64))

    const writer = new BytesWriter(32)
    writer.writeU256(pending)
    return writer
  }

  private compoundYield(calldata: Calldata): BytesWriter {
    const vaultId    = calldata.readU8()
    const caller     = Blockchain.tx.sender
    const callerHash = caller.toU256()

    const deposited    = getUserDeposited(callerHash, vaultId)
    const depositBlock = getUserDepositBlock(callerHash, vaultId)
    const pending      = calcPendingYield(deposited, vaultId, depositBlock)

    if (!u256.gt(pending, u256.Zero)) throw new Revert('No yield to compound')

    setUserDeposited(callerHash, vaultId, SafeMath.add(deposited, pending))
    setVaultTVL(vaultId, SafeMath.add(getVaultTVL(vaultId), pending))
    setUserDepositBlock(callerHash, vaultId, u256.fromU64(Blockchain.block.numberU64))

    const writer = new BytesWriter(32)
    writer.writeU256(pending)
    return writer
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────
export function defineSelectors(): void {}

export function execute(method: u32, calldata: Calldata): BytesWriter {
  const contract = new YieldAggregator()
  return contract.callMethod(method, calldata)
}
