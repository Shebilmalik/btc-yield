/**
 * YieldAggregator — Bitcoin L1 Yield Aggregator on OP_NET
 * Vaults: Alpha (6.2% APY), Beta (14.7% APY), Omega (31.4% APY)
 * 
 * Compile: npm run build
 * Deploy:  npm run deploy
 */

// OP_NET runtime imports
import {
  Blockchain,
  Calldata,
  encodeSelector,
  BytesWriter,
  MemorySlotPointer,
  StoredU256,
  StoredString,
  Address,
  u256,
  SafeMath,
} from '@btc-vision/btc-runtime/runtime'

// Vault IDs
const VAULT_ALPHA: u8 = 0
const VAULT_BETA:  u8 = 1
const VAULT_OMEGA: u8 = 2

// APY in basis points (6.2% = 620, 14.7% = 1470, 31.4% = 3140)
const APY_ALPHA: u64 = 620
const APY_BETA:  u64 = 1470
const APY_OMEGA: u64 = 3140
const BLOCKS_PER_YEAR: u64 = 52560       // ~10 min blocks
const FEE_BPS: u64 = 50                  // 0.5% protocol fee

// Storage pointers
const PTR_OWNER:              u16 = 0x0001
const PTR_TVL_ALPHA:          u16 = 0x0010
const PTR_TVL_BETA:           u16 = 0x0011
const PTR_TVL_OMEGA:          u16 = 0x0012
const PTR_SHARES_ALPHA:       u16 = 0x0020
const PTR_SHARES_BETA:        u16 = 0x0021
const PTR_SHARES_OMEGA:       u16 = 0x0022
const PTR_TOTAL_FEES:         u16 = 0x0030
const PTR_USER_DEPOSITED:     u16 = 0x0100  // + vaultId offset per user
const PTR_USER_SHARES:        u16 = 0x0200
const PTR_USER_DEPOSIT_BLOCK: u16 = 0x0300

// Selectors
export function getVaultInfo(): BytesWriter {
  const writer = new BytesWriter()
  // Pack: tvlAlpha, sharesAlpha, apyAlpha, tvlBeta, sharesBeta, apyBeta, tvlOmega, sharesOmega, apyOmega
  writer.writeU256(StoredU256.get(PTR_TVL_ALPHA))
  writer.writeU256(StoredU256.get(PTR_SHARES_ALPHA))
  writer.writeU256(u256.fromU64(APY_ALPHA))
  writer.writeU256(StoredU256.get(PTR_TVL_BETA))
  writer.writeU256(StoredU256.get(PTR_SHARES_BETA))
  writer.writeU256(u256.fromU64(APY_BETA))
  writer.writeU256(StoredU256.get(PTR_TVL_OMEGA))
  writer.writeU256(StoredU256.get(PTR_SHARES_OMEGA))
  writer.writeU256(u256.fromU64(APY_OMEGA))
  return writer
}

export function getUserPosition(calldata: Calldata): BytesWriter {
  const caller = calldata.readAddress()
  const writer = new BytesWriter()

  for (let vaultId: u8 = 0; vaultId < 3; vaultId++) {
    const deposited = getUserDeposited(caller, vaultId)
    const shares    = getUserShares(caller, vaultId)
    const depositBl = getUserDepositBlock(caller, vaultId)
    const pending   = calcPendingYield(deposited, vaultId, depositBl)
    writer.writeU256(deposited)
    writer.writeU256(shares)
    writer.writeU256(pending)
    writer.writeU256(depositBl)
  }
  return writer
}

export function deposit(calldata: Calldata): BytesWriter {
  const vaultId  = calldata.readU8()
  const amount   = Blockchain.tx.value           // BTC sent in sats
  const caller   = Blockchain.tx.sender

  assert(amount > u256.Zero, 'Amount must be > 0')
  assert(vaultId < 3, 'Invalid vault')

  const fee         = SafeMath.div(SafeMath.mul(amount, u256.fromU64(FEE_BPS)), u256.fromU64(10000))
  const netAmount   = SafeMath.sub(amount, fee)
  const currentTVL  = getVaultTVL(vaultId)
  const totalShares = getVaultShares(vaultId)

  // Calculate shares: if first deposit, shares = netAmount; else proportional
  let newShares: u256
  if (u256.eq(totalShares, u256.Zero)) {
    newShares = netAmount
  } else {
    newShares = SafeMath.div(SafeMath.mul(netAmount, totalShares), currentTVL)
  }

  // Update vault state
  setVaultTVL(vaultId, SafeMath.add(currentTVL, netAmount))
  setVaultShares(vaultId, SafeMath.add(totalShares, newShares))

  // Update user state
  const prevDeposited = getUserDeposited(caller, vaultId)
  const prevShares    = getUserShares(caller, vaultId)
  setUserDeposited(caller, vaultId, SafeMath.add(prevDeposited, netAmount))
  setUserShares(caller, vaultId, SafeMath.add(prevShares, newShares))
  setUserDepositBlock(caller, vaultId, u256.fromU64(Blockchain.block.number))

  // Accumulate fees
  const totalFees = StoredU256.get(PTR_TOTAL_FEES)
  StoredU256.set(PTR_TOTAL_FEES, SafeMath.add(totalFees, fee))

  const writer = new BytesWriter()
  writer.writeU256(newShares)
  return writer
}

export function withdraw(calldata: Calldata): BytesWriter {
  const vaultId     = calldata.readU8()
  const sharesToBurn = calldata.readU256()
  const caller      = Blockchain.tx.sender

  const userShares   = getUserShares(caller, vaultId)
  assert(u256.ge(userShares, sharesToBurn), 'Insufficient shares')

  const totalShares = getVaultShares(vaultId)
  const vaultTVL    = getVaultTVL(vaultId)

  // Calculate BTC to return
  const btcToReturn = SafeMath.div(SafeMath.mul(sharesToBurn, vaultTVL), totalShares)

  // Update vault state
  setVaultTVL(vaultId, SafeMath.sub(vaultTVL, btcToReturn))
  setVaultShares(vaultId, SafeMath.sub(totalShares, sharesToBurn))

  // Update user state
  const prevDeposited = getUserDeposited(caller, vaultId)
  const newDeposited  = u256.ge(prevDeposited, btcToReturn)
    ? SafeMath.sub(prevDeposited, btcToReturn)
    : u256.Zero
  setUserDeposited(caller, vaultId, newDeposited)
  setUserShares(caller, vaultId, SafeMath.sub(userShares, sharesToBurn))

  // Transfer BTC back to caller (OP_NET handles actual BTC transfer)
  Blockchain.transfer(caller, btcToReturn)

  const writer = new BytesWriter()
  writer.writeU256(btcToReturn)
  return writer
}

export function claimYield(calldata: Calldata): BytesWriter {
  const vaultId      = calldata.readU8()
  const caller       = Blockchain.tx.sender
  const deposited    = getUserDeposited(caller, vaultId)
  const depositBlock = getUserDepositBlock(caller, vaultId)
  const pending      = calcPendingYield(deposited, vaultId, depositBlock)

  assert(u256.gt(pending, u256.Zero), 'No yield to claim')

  // Reset deposit block to current (resets yield accrual)
  setUserDepositBlock(caller, vaultId, u256.fromU64(Blockchain.block.number))

  // Transfer yield
  Blockchain.transfer(caller, pending)

  const writer = new BytesWriter()
  writer.writeU256(pending)
  return writer
}

export function compoundYield(calldata: Calldata): BytesWriter {
  const vaultId      = calldata.readU8()
  const caller       = Blockchain.tx.sender
  const deposited    = getUserDeposited(caller, vaultId)
  const depositBlock = getUserDepositBlock(caller, vaultId)
  const pending      = calcPendingYield(deposited, vaultId, depositBlock)

  assert(u256.gt(pending, u256.Zero), 'No yield to compound')

  // Reinvest: add pending yield to user's deposited amount
  setUserDeposited(caller, vaultId, SafeMath.add(deposited, pending))
  setVaultTVL(vaultId, SafeMath.add(getVaultTVL(vaultId), pending))
  setUserDepositBlock(caller, vaultId, u256.fromU64(Blockchain.block.number))

  const writer = new BytesWriter()
  writer.writeU256(pending)
  return writer
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function getVaultTVL(vaultId: u8): u256 {
  if (vaultId == VAULT_ALPHA) return StoredU256.get(PTR_TVL_ALPHA)
  if (vaultId == VAULT_BETA)  return StoredU256.get(PTR_TVL_BETA)
  return StoredU256.get(PTR_TVL_OMEGA)
}
function setVaultTVL(vaultId: u8, v: u256): void {
  if (vaultId == VAULT_ALPHA) { StoredU256.set(PTR_TVL_ALPHA, v); return }
  if (vaultId == VAULT_BETA)  { StoredU256.set(PTR_TVL_BETA,  v); return }
  StoredU256.set(PTR_TVL_OMEGA, v)
}
function getVaultShares(vaultId: u8): u256 {
  if (vaultId == VAULT_ALPHA) return StoredU256.get(PTR_SHARES_ALPHA)
  if (vaultId == VAULT_BETA)  return StoredU256.get(PTR_SHARES_BETA)
  return StoredU256.get(PTR_SHARES_OMEGA)
}
function setVaultShares(vaultId: u8, v: u256): void {
  if (vaultId == VAULT_ALPHA) { StoredU256.set(PTR_SHARES_ALPHA, v); return }
  if (vaultId == VAULT_BETA)  { StoredU256.set(PTR_SHARES_BETA,  v); return }
  StoredU256.set(PTR_SHARES_OMEGA, v)
}

function userPtr(base: u16, caller: Address, vaultId: u8): u16 {
  // Simple pointer offset: base + (address_hash % 0xF000) + vaultId
  return base + (vaultId as u16)
}

function getUserDeposited(caller: Address, vaultId: u8): u256 {
  return StoredU256.getWithSub(PTR_USER_DEPOSITED, caller.toHash(), vaultId as u32)
}
function setUserDeposited(caller: Address, vaultId: u8, v: u256): void {
  StoredU256.setWithSub(PTR_USER_DEPOSITED, caller.toHash(), vaultId as u32, v)
}
function getUserShares(caller: Address, vaultId: u8): u256 {
  return StoredU256.getWithSub(PTR_USER_SHARES, caller.toHash(), vaultId as u32)
}
function setUserShares(caller: Address, vaultId: u8, v: u256): void {
  StoredU256.setWithSub(PTR_USER_SHARES, caller.toHash(), vaultId as u32, v)
}
function getUserDepositBlock(caller: Address, vaultId: u8): u256 {
  return StoredU256.getWithSub(PTR_USER_DEPOSIT_BLOCK, caller.toHash(), vaultId as u32)
}
function setUserDepositBlock(caller: Address, vaultId: u8, v: u256): void {
  StoredU256.setWithSub(PTR_USER_DEPOSIT_BLOCK, caller.toHash(), vaultId as u32, v)
}

function getVaultAPY(vaultId: u8): u64 {
  if (vaultId == VAULT_ALPHA) return APY_ALPHA
  if (vaultId == VAULT_BETA)  return APY_BETA
  return APY_OMEGA
}

function calcPendingYield(deposited: u256, vaultId: u8, depositBlock: u256): u256 {
  if (u256.eq(deposited, u256.Zero)) return u256.Zero
  const currentBlock = u256.fromU64(Blockchain.block.number)
  if (u256.le(currentBlock, depositBlock)) return u256.Zero

  const blocksPassed = SafeMath.sub(currentBlock, depositBlock)
  const apyBps       = u256.fromU64(getVaultAPY(vaultId))

  // yield = deposited * apyBps * blocksPassed / (10000 * BLOCKS_PER_YEAR)
  const numerator    = SafeMath.mul(SafeMath.mul(deposited, apyBps), blocksPassed)
  const denominator  = u256.fromU64(10000 * BLOCKS_PER_YEAR)
  return SafeMath.div(numerator, denominator)
}

// ── Entry point ───────────────────────────────────────────────────────────────
export function execute(method: u32, calldata: Calldata): BytesWriter {
  if (method == 0x11223344) return getVaultInfo()
  if (method == 0x22334455) return getUserPosition(calldata)
  if (method == 0xaabbccdd) return deposit(calldata)
  if (method == 0xbbccddee) return withdraw(calldata)
  if (method == 0xccddeeff) return claimYield(calldata)
  if (method == 0xddeeff00) return compoundYield(calldata)

  const writer = new BytesWriter()
  writer.writeBoolean(false)
  return writer
}
