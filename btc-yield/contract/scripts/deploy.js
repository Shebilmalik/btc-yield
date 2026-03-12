/**
 * Deploy YieldAggregator to OP_NET testnet
 * 
 * Setup:
 *   npm install @btc-vision/transaction @btc-vision/bitcoin
 * 
 * Usage:
 *   WIF_KEY=your_wif_key node scripts/deploy.js
 */

const fs   = require('fs')
const path = require('path')

const WASM_PATH = path.join(__dirname, '../build/contract.wasm')

async function deploy() {
  if (!fs.existsSync(WASM_PATH)) {
    console.error('❌ contract.wasm not found. Run: npm run build')
    process.exit(1)
  }

  const wif = process.env.WIF_KEY
  if (!wif) {
    console.error('❌ Set WIF_KEY environment variable:')
    console.error('   WIF_KEY=your_wif_key node scripts/deploy.js')
    process.exit(1)
  }

  const wasmBytes = fs.readFileSync(WASM_PATH)
  console.log(`📦 WASM size: ${wasmBytes.length} bytes`)

  try {
    const { Wallet, JSONRpcProvider, ContractDeployTransaction } = require('@btc-vision/transaction')
    const { Network } = require('@btc-vision/bitcoin')

    const network  = Network.Testnet
    const provider = new JSONRpcProvider('https://testnet.opnet.org', network)
    const wallet   = Wallet.fromWif(wif, network)

    console.log(`🔑 Deploying from: ${wallet.address}`)
    console.log(`🌐 Network: Testnet`)

    // Fetch UTXOs
    const utxos = await provider.getUTXOs(wallet.address)
    if (!utxos || utxos.length === 0) {
      console.error('❌ No UTXOs found. Fund your wallet first:')
      console.error(`   Address: ${wallet.address}`)
      process.exit(1)
    }
    console.log(`💰 UTXOs found: ${utxos.length}`)

    // Build deploy transaction
    const deployTx = new ContractDeployTransaction({
      bytecode: wasmBytes,
      signer: wallet.keypair,
      network,
      utxos,
      priorityFee: 330n,
      feeRate: 10,
    })

    const signed = await deployTx.signTransaction()
    const result = await provider.sendRawTransaction(signed.hex, false)

    if (result && result.success) {
      const contractAddress = deployTx.contractAddress
      console.log('\n✅ Contract deployed!')
      console.log(`📋 Address: ${contractAddress}`)
      console.log(`🔗 TX Hash: ${result.result}`)
      console.log(`\n👉 Paste this address in the YieldBTC frontend!\n`)

      fs.writeFileSync(
        path.join(__dirname, '../deployed.json'),
        JSON.stringify({
          contractAddress,
          txHash: result.result,
          network: 'testnet',
        }, null, 2)
      )
    } else {
      console.error('❌ Deploy failed:', result)
    }
  } catch (e) {
    console.error('❌ Error:', e.message)
    console.error(e.stack)
  }
}

deploy()
