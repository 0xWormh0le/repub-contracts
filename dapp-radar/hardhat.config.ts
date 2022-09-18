import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-ethers";
import "solidity-coverage";
import 'hardhat-deploy';
import dotenv from 'dotenv';

// tasks

import accounts from './tasks/accounts';
import generateClaims from './tasks/generate-claims';

dotenv.config()

const tasks = () => {
  accounts()
  generateClaims()
}

tasks()

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */

const KOVAN_KEY = process.env.KOVAN_KEY || 'sample-kovan-key'
const RINKEBY_KEY = process.env.RINKEBY_KEY || 'sample-rinkeby-key'
const MNEMONIC = process.env.MNEMONIC || 'sample-mnemonic'
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || 'etherscan-api-key'

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
    hardhat: { },
    kovan: {
      url: `https://eth-kovan.alchemyapi.io/v2/${KOVAN_KEY}`,
      accounts: {
        mnemonic: MNEMONIC
      }
    },
    rinkeby: {
      url: `https://eth-rinkeby.alchemyapi.io/v2/${RINKEBY_KEY}`,
      accounts: {
        mnemonic: MNEMONIC
      }
    }
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY
  },
  mocha: {
    timeout: 100000
  }
};
