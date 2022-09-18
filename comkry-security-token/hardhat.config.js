require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-web3");
require("@nomiclabs/hardhat-etherscan");
require("@nomiclabs/hardhat-truffle5");
require("solidity-coverage");
require('hardhat-deploy');
require('dotenv').config()

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async () => {
  const accounts = await ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */

 const MNEMONIC = process.env.MNEMONIC || 'sample-mnemonic'
 const BSC_API_KEY = process.env.BSC_API_KEY || 'bsc-api-key'
 const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || 'etherscan-api-key'
 const KOVAN_KEY = process.env.KOVAN_KEY || 'sample-kovan-key'
 
 module.exports = {
  solidity: {
    version: "0.8.4",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  namedAccounts: {
    deployer: 0,
  },
  networks: {
    bnb_testnet: {
      url: "https://data-seed-prebsc-1-s1.binance.org:8545",
      chainId: 97,
      gasPrice: 20000000000,
      accounts: {
        mnemonic: MNEMONIC
      }
    },
    kovan: {
      url: `https://eth-kovan.alchemyapi.io/v2/${KOVAN_KEY}`,
      accounts: {
        mnemonic: MNEMONIC
      }
    }
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
    // apiKey: BSC_API_KEY,
  },
  mocha: {
    timeout: 100000
  }
};
