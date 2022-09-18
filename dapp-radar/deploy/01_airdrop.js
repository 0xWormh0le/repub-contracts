module.exports = async ({ getNamedAccounts, deployments }) => {
  const {deploy, get, execute} = deployments;
  const {deployer} = await getNamedAccounts();
  const radarToken = await get('RadarToken')

  const owner = '0x3eae48c575a96e263b8f32a6827c9545b9af9c64' // jeff
  await deploy('Airdrop', {
    from: deployer,
    args: [
      owner, // radar token reserve address
      owner, // claim signer address
      radarToken.address, // radar token address
    ],
    log: true,
  });

  await execute('Airdrop', { from: deployer }, 'transferOwnership', owner)
};

module.exports.tags = ['Airdrop'];
