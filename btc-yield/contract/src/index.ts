import { u256 } from '@btc-vision/as-bignum/assembly';
import {
  Blockchain,
  BytesWriter,
  Calldata,
  encodeSelector,
  OP_NET,
  Revert,
  SafeMath,
  StoredU256,
} from '@btc-vision/btc-runtime/runtime';

// ── Constants ─────────────────────────────────────────────────────────────────
const VAULT_ALPHA: u8 = 0;
const VAULT_BETA:  u8 = 1;
const VAULT_OMEGA: u8 = 2;

const APY_ALPHA: u64 = 620;
const APY_BETA:  u64 = 1470;
const APY_OMEGA: u64 = 3140;
const BLOCKS_PER_YEAR: u64 = 52560;
const FEE_BPS: u64 = 50;

const PTR_TVL_ALPHA:    u16 = 0x0010;
const PTR_TVL_BETA:     u16 = 0x0011;
const PTR_TVL_OMEGA:    u16 = 0x0012;
const PTR_SHARES_ALPHA: u16 = 0x0020;
const PTR_SHARES_BETA:  u16 = 0x0021;
const PTR_SHARES_OMEGA: u16 = 0x0022;
const PTR_TOTAL_FEES:   u16 = 0x0030;
const PTR_USER_DEP:     u16 = 0x0100;
const PTR_USER_SHR:     u16 = 0x0200;
const PTR_USER_BLK:     u16 = 0x0300;

// ── Storage helpers ───────────────────────────────────────────────────────────

function zeroKey(): Uint8Array {
  return new Uint8Array(30);
}

function loadGlobal(ptr: u16): u256 {
  const s = new StoredU256(ptr, zeroKey());
  return s.value;
}

function saveGlobal(ptr: u16, val: u256): void {
  const s = new StoredU256(ptr, zeroKey());
  s.value = val;
}

function userSubkey(callerU256: u256, vaultId: u8): Uint8Array {
  const key = new Uint8Array(30);
  const cb  = callerU256.toUint8Array(true);
  for (let i: i32 = 0; i < 29; i++) key[i] = cb[i + 3];
  key[29] = vaultId;
  return key;
}

function loadUser(ptr: u16, callerU256: u256, vaultId: u8): u256 {
  const s = new StoredU256(ptr, userSubkey(callerU256, vaultId));
  return s.value;
}

function saveUser(ptr: u16, callerU256: u256, vaultId: u8, val: u256): void {
  const s = new StoredU256(ptr, userSubkey(callerU256, vaultId));
  s.value = val;
}

// ── Vault helpers ─────────────────────────────────────────────────────────────

function getVaultTVL(vaultId: u8): u256 {
  if (vaultId == VAULT_ALPHA) return loadGlobal(PTR_TVL_ALPHA);
  if (vaultId == VAULT_BETA)  return loadGlobal(PTR_TVL_BETA);
  return loadGlobal(PTR_TVL_OMEGA);
}

function setVaultTVL(vaultId: u8, v: u256): void {
  if (vaultId == VAULT_ALPHA) { saveGlobal(PTR_TVL_ALPHA, v); return; }
  if (vaultId == VAULT_BETA)  { saveGlobal(PTR_TVL_BETA,  v); return; }
  saveGlobal(PTR_TVL_OMEGA, v);
}

function getVaultShares(vaultId: u8): u256 {
  if (vaultId == VAULT_ALPHA) return loadGlobal(PTR_SHARES_ALPHA);
  if (vaultId == VAULT_BETA)  return loadGlobal(PTR_SHARES_BETA);
  return loadGlobal(PTR_SHARES_OMEGA);
}

function setVaultShares(vaultId: u8, v: u256): void {
  if (vaultId == VAULT_ALPHA) { saveGlobal(PTR_SHARES_ALPHA, v); return; }
  if (vaultId == VAULT_BETA)  { saveGlobal(PTR_SHARES_BETA,  v); return; }
  saveGlobal(PTR_SHARES_OMEGA, v);
}

function getVaultAPY(vaultId: u8): u64 {
  if (vaultId == VAULT_ALPHA) return APY_ALPHA;
  if (vaultId == VAULT_BETA)  return APY_BETA;
  return APY_OMEGA;
}

function calcPendingYield(deposited: u256, vaultId: u8, depositBlock: u256): u256 {
  if (u256.eq(deposited, u256.Zero)) return u256.Zero;
  const currentBlock = u256.fromU64(Blockchain.block.numberU64);
  if (u256.le(currentBlock, depositBlock)) return u256.Zero;
  const blocksPassed = SafeMath.sub(currentBlock, depositBlock);
  const apy          = u256.fromU64(getVaultAPY(vaultId));
  const numerator    = SafeMath.mul(SafeMath.mul(deposited, apy), blocksPassed);
  const denominator  = u256.fromU64(10000 * BLOCKS_PER_YEAR);
  return SafeMath.div(numerator, denominator);
}

// ── Contract ──────────────────────────────────────────────────────────────────

@final
export class YieldAggregator extends OP_NET {

  public override execute(method: u32, calldata: Calldata): BytesWriter {
    switch (method) {
      case encodeSelector('getVaultInfo()'):
        return this.getVaultInfo();
      case encodeSelector('getUserPosition(bytes32)'):
        return this.getUserPosition(calldata);
      case encodeSelector('deposit(uint8,uint256)'):
        return this.deposit(calldata);
      case encodeSelector('withdraw(uint8,uint256)'):
        return this.withdraw(calldata);
      case encodeSelector('claimYield(uint8)'):
        return this.claimYield(calldata);
      case encodeSelector('compoundYield(uint8)'):
        return this.compoundYield(calldata);
      default:
        return super.execute(method, calldata);
    }
  }

  private getVaultInfo(): BytesWriter {
    const w = new BytesWriter(9 * 32);
    w.writeU256(loadGlobal(PTR_TVL_ALPHA));
    w.writeU256(loadGlobal(PTR_SHARES_ALPHA));
    w.writeU256(u256.fromU64(APY_ALPHA));
    w.writeU256(loadGlobal(PTR_TVL_BETA));
    w.writeU256(loadGlobal(PTR_SHARES_BETA));
    w.writeU256(u256.fromU64(APY_BETA));
    w.writeU256(loadGlobal(PTR_TVL_OMEGA));
    w.writeU256(loadGlobal(PTR_SHARES_OMEGA));
    w.writeU256(u256.fromU64(APY_OMEGA));
    return w;
  }

  private getUserPosition(calldata: Calldata): BytesWriter {
    const callerU256 = calldata.readU256();
    const w = new BytesWriter(12 * 32);
    for (let vaultId: u8 = 0; vaultId < 3; vaultId++) {
      const deposited = loadUser(PTR_USER_DEP, callerU256, vaultId);
      const shares    = loadUser(PTR_USER_SHR, callerU256, vaultId);
      const depBlock  = loadUser(PTR_USER_BLK, callerU256, vaultId);
      const pending   = calcPendingYield(deposited, vaultId, depBlock);
      w.writeU256(deposited);
      w.writeU256(shares);
      w.writeU256(pending);
      w.writeU256(depBlock);
    }
    return w;
  }

  private deposit(calldata: Calldata): BytesWriter {
    const vaultId  = calldata.readU8();
    const amount   = calldata.readU256();
    if (vaultId >= 3) throw new Revert('Invalid vault');
    if (u256.eq(amount, u256.Zero)) throw new Revert('Amount must be > 0');

    const fee       = SafeMath.div(SafeMath.mul(amount, u256.fromU64(FEE_BPS)), u256.fromU64(10000));
    const netAmount = SafeMath.sub(amount, fee);

    const currentTVL  = getVaultTVL(vaultId);
    const totalShares = getVaultShares(vaultId);
    let   newShares: u256;

    if (u256.eq(totalShares, u256.Zero)) {
      newShares = netAmount;
    } else {
      newShares = SafeMath.div(SafeMath.mul(netAmount, totalShares), currentTVL);
    }

    setVaultTVL(vaultId,    SafeMath.add(currentTVL, netAmount));
    setVaultShares(vaultId, SafeMath.add(totalShares, newShares));

    const cu = Blockchain.tx.sender.toU256();
    saveUser(PTR_USER_DEP, cu, vaultId, SafeMath.add(loadUser(PTR_USER_DEP, cu, vaultId), netAmount));
    saveUser(PTR_USER_SHR, cu, vaultId, SafeMath.add(loadUser(PTR_USER_SHR, cu, vaultId), newShares));
    saveUser(PTR_USER_BLK, cu, vaultId, u256.fromU64(Blockchain.block.numberU64));
    saveGlobal(PTR_TOTAL_FEES, SafeMath.add(loadGlobal(PTR_TOTAL_FEES), fee));

    const w = new BytesWriter(32);
    w.writeU256(newShares);
    return w;
  }

  private withdraw(calldata: Calldata): BytesWriter {
    const vaultId      = calldata.readU8();
    const sharesToBurn = calldata.readU256();
    const cu           = Blockchain.tx.sender.toU256();

    const userShares  = loadUser(PTR_USER_SHR, cu, vaultId);
    if (u256.lt(userShares, sharesToBurn)) throw new Revert('Insufficient shares');

    const totalShares = getVaultShares(vaultId);
    const vaultTVL    = getVaultTVL(vaultId);
    const btcToReturn = SafeMath.div(SafeMath.mul(sharesToBurn, vaultTVL), totalShares);

    setVaultTVL(vaultId,    SafeMath.sub(vaultTVL, btcToReturn));
    setVaultShares(vaultId, SafeMath.sub(totalShares, sharesToBurn));

    const prevDep = loadUser(PTR_USER_DEP, cu, vaultId);
    const newDep  = u256.ge(prevDep, btcToReturn) ? SafeMath.sub(prevDep, btcToReturn) : u256.Zero;
    saveUser(PTR_USER_DEP, cu, vaultId, newDep);
    saveUser(PTR_USER_SHR, cu, vaultId, SafeMath.sub(userShares, sharesToBurn));

    const w = new BytesWriter(32);
    w.writeU256(btcToReturn);
    return w;
  }

  private claimYield(calldata: Calldata): BytesWriter {
    const vaultId = calldata.readU8();
    const cu      = Blockchain.tx.sender.toU256();

    const deposited = loadUser(PTR_USER_DEP, cu, vaultId);
    const depBlock  = loadUser(PTR_USER_BLK, cu, vaultId);
    const pending   = calcPendingYield(deposited, vaultId, depBlock);

    if (u256.eq(pending, u256.Zero)) throw new Revert('No yield to claim');

    saveUser(PTR_USER_BLK, cu, vaultId, u256.fromU64(Blockchain.block.numberU64));

    const w = new BytesWriter(32);
    w.writeU256(pending);
    return w;
  }

  private compoundYield(calldata: Calldata): BytesWriter {
    const vaultId = calldata.readU8();
    const cu      = Blockchain.tx.sender.toU256();

    const deposited = loadUser(PTR_USER_DEP, cu, vaultId);
    const depBlock  = loadUser(PTR_USER_BLK, cu, vaultId);
    const pending   = calcPendingYield(deposited, vaultId, depBlock);

    if (u256.eq(pending, u256.Zero)) throw new Revert('No yield to compound');

    saveUser(PTR_USER_DEP, cu, vaultId, SafeMath.add(deposited, pending));
    setVaultTVL(vaultId, SafeMath.add(getVaultTVL(vaultId), pending));
    saveUser(PTR_USER_BLK, cu, vaultId, u256.fromU64(Blockchain.block.numberU64));

    const w = new BytesWriter(32);
    w.writeU256(pending);
    return w;
  }
}
