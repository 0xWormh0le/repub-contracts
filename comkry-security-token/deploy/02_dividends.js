
module.exports = async ({getNamedAccounts, deployments}) => {
  const {deploy, get} = deployments;
  const {deployer} = await getNamedAccounts();
  const restrictedSwap = await get('RestrictedSwap');

  await deploy('Dividends', {
	from: deployer,
	args: [
	  restrictedSwap.address, // transfer rules
	],
	log: true,
  });
};
module.exports.tags = ['Dividends'];
