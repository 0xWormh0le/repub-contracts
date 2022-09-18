// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.

const hre = require('hardhat')
const fs = require('fs')
const deploymentParamsLog = './deployment.json'
console.log('Deploy Network: ', hre.network.name)

// Publishing contract details to Etherscan is a separate script
// because Etherscan intermittenly refuses the API request
async function main () {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  // load deployment info for the current environment

  const deploymentInfo = JSON.parse(fs.readFileSync(deploymentParamsLog))[hre.network.name.toString()]
  console.log(deploymentInfo)

  // wait for the deployed contract to be confirmed enough times to successfully post the definition to Etherscan
  console.log('checking 5 confirmations completed')
  await ethers.provider.waitForTransaction(deploymentInfo.token.transaction, 5)
  console.log('5 confirmations have been completed')

  // // upload the contracts Etherscan for verification
  console.log('uploading the contract definition to Etherscan')
  await hre.run('verify:verify', {
    address: deploymentInfo.token.address,
    constructorArguments: deploymentInfo.token.args
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
