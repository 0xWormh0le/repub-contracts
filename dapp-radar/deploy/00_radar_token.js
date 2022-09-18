const { BigNumber } = require('ethers')

const token = BigNumber.from(10).pow(18) // a token is 18 decimals

module.exports = async ({ getNamedAccounts, deployments }) => {
  const {deploy} = deployments;
  const {deployer} = await getNamedAccounts();

  await deploy('RadarToken', {
    from: deployer,
    args: [
      'DappRadar', // name
      'RADAR', // symbol
      [
        '0x5bd4c29b0802b443e2b9040ab0fc449c843ef3b6', // Skirmitas
        '0xae7ab36abaefd0f0bb245494ce14406a6b8fc9d6', // Noah
        '0x3eae48c575a96e263b8f32a6827c9545b9af9c64' // Jeff
      ], // mint addresses
      [
        token.mul(BigNumber.from(10).pow(9)), // 1b for Skirmitas
        token.mul(BigNumber.from(10).pow(9)), // 1b for Noah
        token.mul(BigNumber.from(10).pow(9).mul(8)) // 8b for Jeff
      ] // mint amounts
    ],
    log: true,
  });
};

module.exports.tags = ['RadarToken'];
