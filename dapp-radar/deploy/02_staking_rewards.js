module.exports = async ({ getNamedAccounts, deployments }) => {
  const {deploy, get} = deployments;
  const {deployer} = await getNamedAccounts();

  await deploy('StakingRewards', {
    from: deployer,
    args: [
      '0xae7ab36abaefd0f0bb245494ce14406a6b8fc9d6', // owner: noah
      '0xae7ab36abaefd0f0bb245494ce14406a6b8fc9d6', // reward distribution: noah
      '0x022e292b44b5a146f2e8ee36ff44d3dd863c915c', // reward token: Xeenus on rinkeby
      '0xc6fde3fd2cc2b173aec24cc3f267cb3cd78a26b7', // staking token: Yeenus on rinkeby
      4, // reward duration in days
    ],
    log: true,
  });
};

module.exports.tags = ['StakingRewards'];
