// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.

const hre = require('hardhat')
const config = hre.network.config
const fs = require('fs')
const deploymentParamsLog = 'deployment.json'

async function main () {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  // token deployment
  const Token = await hre.ethers.getContractFactory('Token')
  console.log('Deploy Network: ', await Token.signer.provider.getNetwork())

  const tokenArgs = [
    config.token.name,
    config.token.symbol,
    config.token.decimals.toString(),
    config.token.totalSupply.toString(),
    config.token.mintAddresses,
    config.token.mintAmounts.map(a => a.toString())
  ]
  console.log(tokenArgs)
  const token = await Token.deploy(...tokenArgs)
  console.log('Deployed token at: ', token.address)

  fs.writeFileSync(
    deploymentParamsLog,
    JSON.stringify({
      [hre.network.name.toString()]: {
        token: {
          args: tokenArgs,
          transaction: token.deployTransaction.hash,
          address: token.address
        }
      }
    })
  )
  console.log('Wrote token deployment config to: ', deploymentParamsLog)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
