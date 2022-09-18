// pass in the hardhat instance "hre" which has the config file and other definitions
async function create (hre, signerAccount, tokenLockupAddress) {
  const TokenLockupArtifact = await hre.artifacts.readArtifact('TokenLockup')
  const tokenLockup = new hre.ethers.Contract(tokenLockupAddress, TokenLockupArtifact.abi, hre.ethers.provider)

  const ninetyDaysInSeconds = 60 * 60 * 24 * 90 // 7776000

  // 0: 7.7% unlocked at distribution, the rest vesting in equal portions every 90 days for 360 days
  const txn0 = await tokenLockup.connect(signerAccount).createReleaseSchedule(
    5, // release count including initial
    0, // delay till first release
    770, // initial release portion in Bips 100ths of 1%
    ninetyDaysInSeconds // period between releases in seconds
  )
  await txn0.wait(1)
  console.log('created release schedule 0')

  // 1: 7.2% unlocked at distribution, the rest vesting in equal portions every 90 days for 540 days
  const txn1 = await tokenLockup.connect(signerAccount).createReleaseSchedule(
    7, // release count including initial
    0, // delay till first release
    720, // initial release portion in Bips 100ths of 1%
    ninetyDaysInSeconds // period between releases in seconds
  )
  await txn1.wait(1)
  console.log('created release schedule 1')

  // 2: 20% unlocked at distribution, the rest vesting in equal portions every 90 days for 360 days
  const txn2 = await tokenLockup.connect(signerAccount).createReleaseSchedule(
    5, // release count including initial
    0, // delay till first release
    2000, // initial release portion in Bips 100ths of 1%
    ninetyDaysInSeconds // period between releases in seconds
  )
  await txn2.wait(1)
  console.log('created release schedule 2')

  // 3: 25% unlocked at distribution, the rest vesting in equal portions every 90 days for 360 days
  const txn3 = await tokenLockup.connect(signerAccount).createReleaseSchedule(
    5, // release count including initial
    0, // delay till first release
    2500, // initial release portion in Bips 100ths of 1%
    ninetyDaysInSeconds // period between releases in seconds
  )
  await txn3.wait(1)
  console.log('created release schedule 3')
}

module.exports = create
