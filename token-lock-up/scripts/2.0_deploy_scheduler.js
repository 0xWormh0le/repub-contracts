// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require('hardhat')
const fs = require('fs')
const deploymentParamsLog = 'deployment.json'
const config = hre.network.config
console.log('\n\nDeploy Network: ', hre.network.name)
console.log('hardhat.config.js lockup params:')
console.log(config.lockup)

if (config.lockup.tokenAddress === null ||
  config.lockup.tokenAddress === undefined ||
  config.lockup.tokenAddress === '') {
  throw new Error('config.lockup.tokenAddress must be configured in hardhat.config.js')
}

// Hardhat always runs the compile task when running scripts with its command
// line interface.
//
// If this script is run directly using `node` you may want to call compile
// manually to make sure everything is compiled
// await hre.run('compile');

async function main () {
  const tokenArtifact = await hre.artifacts.readArtifact('TokenLockup')
  const token = new ethers.Contract(config.lockup.tokenAddress, tokenArtifact.abi, ethers.provider)

  console.log('token details for TokenLockup deployment:')
  console.log('[tokenAddress, TokenLockup name, TokenLockup symbol, minReleaseScheduleAmountInBaseTokens, maxReleaseDelay]')
  const TokenLockupArgs = [
    await token.address, // tokenAddress '0xE322488096C36edccE397D179E7b1217353884BB'
    await token.name() + ' Lockup', // tokenLockup name (different than token)
    await token.symbol() + ' Lockup', // tokenLockup symbol (different than token)
    config.lockup.minReleaseScheduleAmountInBaseTokens,
    config.lockup.maxReleaseDelay
  ]
  console.log(TokenLockupArgs)

  console.log('deploying token lockup')
  const TokenLockup = await hre.ethers.getContractFactory('TokenLockup')

  const tokenLockup = await TokenLockup.deploy(
    ...TokenLockupArgs,
    {
      gasLimit: 4000000
    })
  console.log('Deployed tokenLockup at: ', tokenLockup.address)
  console.log('waiting for 5 blockchain block confirmations')
  await tokenLockup.deployTransaction.wait(5)
  console.log('5 confirmations completed')

  const deploymentParamsLogFile = fs.readFileSync(deploymentParamsLog)
  const deploymentParamsLogContent = JSON.parse(deploymentParamsLogFile)

  const updatedContent = Object.assign(deploymentParamsLogContent, {
    [hre.network.name.toString()]: {
      tokenLockup: {
        args: TokenLockupArgs,
        transaction: tokenLockup.deployTransaction.hash,
        address: tokenLockup.address
      }
    }
  })

  fs.writeFileSync(
    deploymentParamsLog,
    JSON.stringify(updatedContent)
  )

  console.log('done!')
  console.log('now run scripts to upload contract definitions for TokenLockup contracts to Ethersacn')
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
