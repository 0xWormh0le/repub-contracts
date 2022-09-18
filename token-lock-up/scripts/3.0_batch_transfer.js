// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require('hardhat')
const config = hre.network.config
console.log('Deploy Network: ', hre.network.name)
console.log(config.token)

async function main () {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  const BatchTransfer = await hre.ethers.getContractFactory('BatchTransfer')
  const batchTransfer = await BatchTransfer.deploy()

  console.log('Deployed BatchTransfer to: ', batchTransfer.address)

  await batchTransfer.deployTransaction.wait(5)
  console.log('5 confirmations completed')

  // upload the contracts Etherscan for verification
  await hre.run('verify:verify', {
    address: batchTransfer.address,
    constructorArguments: []
  })
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
