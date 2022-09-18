module.exports = async ({getNamedAccounts, deployments}) => {
  const {deploy, get} = deployments;
  const {deployer} = await getNamedAccounts();

  const randomGenerator = await get('RandomGenerator')

  await deploy('SwapperFactory', {
    from: deployer,
    args: [
      randomGenerator.address,
    ],
    log: true,
  });
};

module.exports.tags = ['SwapperFactory'];
