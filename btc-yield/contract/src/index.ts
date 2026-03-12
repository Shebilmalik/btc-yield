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

function zeroKey(): Uint8Array { return new Uint8Array(30); }

function loadGlobal(ptr: u16): u256 {
  return new StoredU256(ptr, zeroKey()).value;
}
function saveGlobal(ptr: u16, val: u256): void {
  const s = new StoredU256(ptr, zeroKey()); s.value = val;
}
function userSubkey(cu: u256, vaultId: u8): Uint8Array {
  const key = new Uint8Array(30);
  const cb  = cu.toUint8Array(true);
  for (let i: i32 = 0; i < 29; i++) key[i] = cb[i + 3];
  key[29] = vaultId;
  return key;
}
function loadUser(ptr: u16, cu: u256, vaultId: u8): u256 {
  return new StoredU256(ptr, userSubkey(cu, vaultId)).value;
}
function saveUser(ptr: u16, cu: u256, vaultId: u8, val: u256): void {
  const s = new StoredU256(ptr, userSubkey(cu, vaultId)); s.value = val;
}
function getVaultTVL(v: u8): u256 {
  if (v == VAULT_ALPHA) return loadGlobal(PTR_TVL_ALPHA);
  if (v == VAULT_BETA)  return loadGlobal(PTR_TVL_BETA);
  return loadGlobal(PTR_TVL_OMEGA);
}
function setVaultTVL(v: u8, x: u256): void {
  if (v == VAULT_ALPHA) { saveGlobal(PTR_TVL_ALPHA, x); return; }
  if (v == VAULT_BETA)  { saveGlobal(PTR_TVL_BETA,  x); return; }
  saveGlobal(PTR_TVL_OMEGA, x);
}
function getVaultShares(v: u8): u256 {
  if (v == VAULT_ALPHA) return loadGlobal(PTR_SHARES_ALPHA);
  if (v == VAULT_BETA)  return loadGlobal(PTR_SHARES_BETA);
  return loadGlobal(PTR_SHARES_OMEGA);
}
function setVaultShares(v: u8, x: u256): void {
  if (v == VAULT_ALPHA) { saveGlobal(PTR_SHARES_ALPHA, x); return; }
  if (v == VAULT_BETA)  { saveGlobal(PTR_SHARES_BETA,  x); return; }
  saveGlobal(PTR_SHARES_OMEGA, x);
}
function getVaultAPY(v: u8): u64 {
  if (v == VAULT_ALPHA) return APY_ALPHA;
  if (v == VAULT_BETA)  return APY_BETA;
  return APY_OMEGA;
}
function calcPending(deposited: u256, vaultId: u8, depBlock: u256): u256 {
  if (u256.eq(deposited, u256.Zero)) return u256.Zero;
  const cur = u256.fromU64(Blockchain.block.numberU64);
  if (u256.le(cur, depBlock)) return u256.Zero;
  const blocks = SafeMath.sub(cur, depBlock);
  const num    = SafeMath.mul(SafeMath.mul(deposited, u256.fromU64(getVaultAPY(vaultId))), blocks);
  return SafeMath.div(num, u256.fromU64(10000 * BLOCKS_PER_YEAR));
}

@final
export class YieldAggregator extends OP_NET {
  public override execute(method: u32, calldata: Calldata): BytesWriter {
    switch (method) {
      case encodeSelector('getVaultInfo()'):           return this._getVaultInfo();
      case encodeSelector('getUserPosition(bytes32)'): return this._getUserPosition(calldata);
      case encodeSelector('deposit(uint8,uint256)'):   return this._deposit(calldata);
      case encodeSelector('withdraw(uint8,uint256)'):  return this._withdraw(calldata);
      case encodeSelector('claimYield(uint8)'):        return this._claimYield(calldata);
      case encodeSelector('compoundYield(uint8)'):     return this._compoundYield(calldata);
      default: return super.execute(method, calldata);
    }
  }
  private _getVaultInfo(): BytesWriter {
    const w = new BytesWriter(288);
    w.writeU256(loadGlobal(PTR_TVL_ALPHA));   w.writeU256(loadGlobal(PTR_SHARES_ALPHA)); w.writeU256(u256.fromU64(APY_ALPHA));
    w.writeU256(loadGlobal(PTR_TVL_BETA));    w.writeU256(loadGlobal(PTR_SHARES_BETA));  w.writeU256(u256.fromU64(APY_BETA));
    w.writeU256(loadGlobal(PTR_TVL_OMEGA));   w.writeU256(loadGlobal(PTR_SHARES_OMEGA)); w.writeU256(u256.fromU64(APY_OMEGA));
    return w;
  }
  private _getUserPosition(calldata: Calldata): BytesWriter {
    const cu = calldata.readU256();
    const w  = new BytesWriter(384);
    for (let v: u8 = 0; v < 3; v++) {
      const dep = loadUser(PTR_USER_DEP, cu, v);
      const shr = loadUser(PTR_USER_SHR, cu, v);
      const blk = loadUser(PTR_USER_BLK, cu, v);
      w.writeU256(dep); w.writeU256(shr); w.writeU256(calcPending(dep, v, blk)); w.writeU256(blk);
    }
    return w;
  }
  private _deposit(calldata: Calldata): BytesWriter {
    const vaultId = calldata.readU8();
    const amount  = calldata.readU256();
    if (vaultId >= 3) throw new Revert('Invalid vault');
    if (u256.eq(amount, u256.Zero)) throw new Revert('Amount must be > 0');
    const fee      = SafeMath.div(SafeMath.mul(amount, u256.fromU64(FEE_BPS)), u256.fromU64(10000));
    const net      = SafeMath.sub(amount, fee);
    const tvl      = getVaultTVL(vaultId);
    const totShr   = getVaultShares(vaultId);
    const newShr   = u256.eq(totShr, u256.Zero) ? net : SafeMath.div(SafeMath.mul(net, totShr), tvl);
    setVaultTVL(vaultId, SafeMath.add(tvl, net));
    setVaultShares(vaultId, SafeMath.add(totShr, newShr));
    const cu = Blockchain.tx.sender.toU256();
    saveUser(PTR_USER_DEP, cu, vaultId, SafeMath.add(loadUser(PTR_USER_DEP, cu, vaultId), net));
    saveUser(PTR_USER_SHR, cu, vaultId, SafeMath.add(loadUser(PTR_USER_SHR, cu, vaultId), newShr));
    saveUser(PTR_USER_BLK, cu, vaultId, u256.fromU64(Blockchain.block.numberU64));
    saveGlobal(PTR_TOTAL_FEES, SafeMath.add(loadGlobal(PTR_TOTAL_FEES), fee));
    const w = new BytesWriter(32); w.writeU256(newShr); return w;
  }
  private _withdraw(calldata: Calldata): BytesWriter {
    const vaultId = calldata.readU8();
    const burn    = calldata.readU256();
    const cu      = Blockchain.tx.sender.toU256();
    const usrShr  = loadUser(PTR_USER_SHR, cu, vaultId);
    if (u256.lt(usrShr, burn)) throw new Revert('Insufficient shares');
    const totShr  = getVaultShares(vaultId);
    const tvl     = getVaultTVL(vaultId);
    const ret     = SafeMath.div(SafeMath.mul(burn, tvl), totShr);
    setVaultTVL(vaultId, SafeMath.sub(tvl, ret));
    setVaultShares(vaultId, SafeMath.sub(totShr, burn));
    const prevDep = loadUser(PTR_USER_DEP, cu, vaultId);
    saveUser(PTR_USER_DEP, cu, vaultId, u256.ge(prevDep, ret) ? SafeMath.sub(prevDep, ret) : u256.Zero);
    saveUser(PTR_USER_SHR, cu, vaultId, SafeMath.sub(usrShr, burn));
    const w = new BytesWriter(32); w.writeU256(ret); return w;
  }
  private _claimYield(calldata: Calldata): BytesWriter {
    const vaultId = calldata.readU8();
    const cu      = Blockchain.tx.sender.toU256();
    const dep     = loadUser(PTR_USER_DEP, cu, vaultId);
    const blk     = loadUser(PTR_USER_BLK, cu, vaultId);
    const pending = calcPending(dep, vaultId, blk);
    if (u256.eq(pending, u256.Zero)) throw new Revert('No yield to claim');
    saveUser(PTR_USER_BLK, cu, vaultId, u256.fromU64(Blockchain.block.numberU64));
    const w = new BytesWriter(32); w.writeU256(pending); return w;
  }
  private _compoundYield(calldata: Calldata): BytesWriter {
    const vaultId = calldata.readU8();
    const cu      = Blockchain.tx.sender.toU256();
    const dep     = loadUser(PTR_USER_DEP, cu, vaultId);
    const blk     = loadUser(PTR_USER_BLK, cu, vaultId);
    const pending = calcPending(dep, vaultId, blk);
    if (u256.eq(pending, u256.Zero)) throw new Revert('No yield to compound');
    saveUser(PTR_USER_DEP, cu, vaultId, SafeMath.add(dep, pending));
    setVaultTVL(vaultId, SafeMath.add(getVaultTVL(vaultId), pending));
    saveUser(PTR_USER_BLK, cu, vaultId, u256.fromU64(Blockchain.block.numberU64));
    const w = new BytesWriter(32); w.writeU256(pending); return w;
  }
}
