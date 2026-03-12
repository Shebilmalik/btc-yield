/**
 * Deploy YieldAggregator contract to OP_NET testnet
 * 
 * Usage:
 *   1. npm run build      (compile AssemblyScript → WASM)
 *   2. Set your WIF key below
 *   3. node scripts/deploy.js
 */

const fs = require('fs')
const path = require('path')

const WASM_PATH = path.join(__dirname, '../build/contract.wasm')
const OPNET_RPC = 'https://api.opnet.org'
const NETWORK   = 'testnet'

async function deploy() {
  // Check WASM exists
  if (!fs.existsSync(WASM_PATH)) {
    console.error('❌ contract.wasm not found. Run: npm run build')
    process.exit(1)
  }

  const wasmBytes = fs.readFileSync(WASM_PATH)
  const wasmHex   = wasmBytes.toString('hex')

  console.log(`📦 WASM size: ${wasmBytes.length} bytes`)
  console.log(`🌐 Network:  ${NETWORK}`)
  console.log(`🔗 RPC:      ${OPNET_RPC}`)

  // Get WIF from env
  const wif = process.env.WIF_KEY
  if (!wif) {
    console.error('\n❌ Set WIF_KEY environment variable:')
    console.error('   WIF_KEY=your_wif_key node scripts/deploy.js\n')
    process.exit(1)
  }

  try {
    const res = await fetch(`${OPNET_RPC}/api/v1/deploy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bytecode: wasmHex,
        network: NETWORK,
        wif,
      }),
    })

    const data = await res.json()

    if (data.contractAddress) {
      console.log('\n✅ Contract deployed!')
      console.log(`📋 Address: ${data.contractAddress}`)
      console.log(`🔗 TX Hash: ${data.txHash}`)
      console.log(`\n👉 Paste this address in the YieldBTC frontend!\n`)

      // Save to file
      fs.writeFileSync(
        path.join(__dirname, '../deployed.json'),
        JSON.stringify({ contractAddress: data.contractAddress, txHash: data.txHash, network: NETWORK }, null, 2)
      )
    } else {
      console.error('❌ Deploy failed:', data)
    }
  } catch (e) {
    console.error('❌ Error:', e.message)
  }
}

deploy()
