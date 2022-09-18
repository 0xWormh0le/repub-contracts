const { BigNumber } = require('ethers')

module.exports = async ({getNamedAccounts, deployments}) => {
  const {deploy, get} = deployments;
  const {deployer} = await getNamedAccounts();
  const transferRules = await get('TransferRules')

  await deploy('RestrictedSwap', {
    from: deployer,
    args: [
      transferRules.address, // transfer rules
      deployer, // contract admin
      deployer, // token reserve admin
      'RSTT', // symbol
      'RSTT', // name
      18, // decimals
      BigNumber.from(10).pow(10), // total supply
      BigNumber.from(10).pow(10), // max total supply
    ],
    log: true,
  });
};
module.exports.tags = ['RestrictedSwap'];
