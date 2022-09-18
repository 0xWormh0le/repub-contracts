const hre = require('hardhat')
const config = hre.network.config
const createReleaseSchedules = require('../../lib/createReleaseScheduleExample1')

console.log('Deploy Network: ', hre.network.name)
console.log(config.lockup)

async function main () {
  const publicAddress = hre.ethers.Wallet.fromMnemonic(config.accounts.mnemonic)
  console.log('signer address', publicAddress.address)
  const signerAccount = await hre.ethers.getSigner(publicAddress.address)
  await createReleaseSchedules(hre, signerAccount, config.lockup.tokenLockupAddress)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
