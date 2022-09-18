require('@nomiclabs/hardhat-waffle')
require('solidity-coverage')
require('hardhat-gas-reporter')
require('@nomiclabs/hardhat-etherscan')
// require('hardhat-docgen')
require('dotenv').config({ path: '.env' })

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task('accounts', 'Prints the list of accounts', async () => {
  const accounts = await ethers.getSigners()

  for (const account of accounts) {
    console.log(account.address)
  }
})

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */

const tenBillionWithTenDecimalPrecision = BigInt('1' + '0'.repeat(10 + 10))
const wallet2Amount2 = BigInt('187500000000000000')
const walletAmount1 = tenBillionWithTenDecimalPrecision - wallet2Amount2
const sixYearsInSeconds = 189216000 // 6 years in seconds = 60 seconds * 60 minutes * 24 hours * 365 days * 6 years
const oneHundredTokensWithTenDecimalsPrecision = 100 * 1e10

module.exports = {
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {
      token: {
        name: 'Xavier Yolo Zeta',
        symbol: 'XYZ',
        decimals: 10,
        totalSupply: tenBillionWithTenDecimalPrecision.toString(), // 10B + 10 decimals
        mintAddresses: ['0xdFA017425c938c13ef362544D2662230cC7668eB', '0x421C655a9A40930c10eaD2b479ad529342973E68'],
        mintAmounts: [walletAmount1.toString(), wallet2Amount2.toString()]
      },
      lockup: {
        tokenAddress: null,
        tokenLockupAddress: null,
        minReleaseScheduleAmountInBaseTokens: oneHundredTokensWithTenDecimalsPrecision,
        maxReleaseDelay: sixYearsInSeconds// 10 tokens with 10 decimals
      },
      initialBaseFeePerGas: 0
    },
    kovan: {
      token: {
        name: 'Xavier Yolo Zeta',
        symbol: 'XYZ',
        decimals: 10,
        totalSupply: tenBillionWithTenDecimalPrecision.toString(), // 10B + 10 decimals
        mintAddresses: ['0xdFA017425c938c13ef362544D2662230cC7668eB', '0x421C655a9A40930c10eaD2b479ad529342973E68'],
        mintAmounts: [walletAmount1.toString(), wallet2Amount2.toString()]
      },
      lockup: {
        tokenAddress: null,
        tokenLockupAddress: null,
        minReleaseScheduleAmountInBaseTokens: oneHundredTokensWithTenDecimalsPrecision,
        maxReleaseDelay: sixYearsInSeconds// 10 tokens with 10 decimals
      },
      url: process.env.KOVAN_NETWORK_URL,
      accounts: {
        tokenAddress: null,
        mnemonic: process.env.KOVAN
      },
      gas: 4 * 1e6
    },
    rinkeby: {
      token: {
        name: 'Xavier Yolo Zeta',
        symbol: 'XYZ',
        decimals: 10,
        totalSupply: tenBillionWithTenDecimalPrecision.toString(), // 10B + 10 decimals
        mintAddresses: ['0xdFA017425c938c13ef362544D2662230cC7668eB', '0x421C655a9A40930c10eaD2b479ad529342973E68'],
        mintAmounts: [walletAmount1.toString(), wallet2Amount2.toString()]
      },
      lockup: {
        tokenAddress: '0xE322488096C36edccE397D179E7b1217353884BB',
        tokenLockupAddress: '0x88C31f534D8518E5BF175a7dc18A776EE8a7F4E5',
        minReleaseScheduleAmountInBaseTokens: oneHundredTokensWithTenDecimalsPrecision,
        maxReleaseDelay: sixYearsInSeconds// 10 tokens with 10 decimals
      },
      url: process.env.RINKEBY_NETWORK_URL,
      accounts: {
        mnemonic: process.env.RINKEBY
      },
      gas: 4 * 1e6
    },
    mainnet: {
      token: {
        name: 'Xavier Yolo Zeta',
        symbol: 'XYZ',
        decimals: 10,
        totalSupply: tenBillionWithTenDecimalPrecision.toString(), // 10B + 10 decimals
        mintAddresses: ['0xdFA017425c938c13ef362544D2662230cC7668eB', '0x421C655a9A40930c10eaD2b479ad529342973E68'],
        mintAmounts: [walletAmount1.toString(), wallet2Amount2.toString()]
      },
      lockup: {
        tokenAddress: null,
        tokenLockupAddress: null,
        minReleaseScheduleAmountInBaseTokens: oneHundredTokensWithTenDecimalsPrecision,
        maxReleaseDelay: sixYearsInSeconds// 10 tokens with 10 decimals
      },
      url: process.env.MAINNET_NETWORK_URL,
      accounts: {
        mnemonic: process.env.MAINNET
      }
    }
  },
  solidity: {
    version: '0.8.3',
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000
      }
    }
  },
  gasReporter: {
    coinmarketcap: process.env.COIN_MARKET_CAP_API,
    currency: 'USD',
    // gasPrice: 60,
    enabled: true
  },
  etherscan: {
    // Your API key for Etherscan
    // Obtain one at https://etherscan.io/
    apiKey: process.env.ETHERSCAN_API_KEY
  },
  docgen: {
    path: './docs',
    clear: true,
    runOnCompile: true
  }
}
