const hre = require('hardhat')
const chai = require('chai')
const { expect } = chai
const { solidity } = require('ethereum-waffle')
chai.use(solidity)

const advanceTime = async (days) => {
  await hre.network.provider.request({
    method: 'evm_increaseTime',
    params: [days * 3600 * 24]
  })
  await hre.network.provider.request({
    method: 'evm_mine',
    params: []
  })
}

function days (numDays) {
  return 60 * 60 * 24 * numDays
}

async function currentTimestamp (offsetInSeconds = 0) {
  return (await hre.ethers.provider.getBlock()).timestamp + offsetInSeconds
}

async function exactlyMoreThanOneDayAgo () {
  return await currentTimestamp(-3601)
}

describe('TokenLockup timelock balances', async function () {
  let tokenLockup, token, reserveAccount, recipient, accounts
  const decimals = 10
  const totalSupply = 8e9
  beforeEach(async () => {
    accounts = await hre.ethers.getSigners()

    reserveAccount = accounts[0]
    recipient = accounts[1]

    const Token = await hre.ethers.getContractFactory('Token')

    token = await Token.deploy(
      'Test Scheduled Release Token',
      'SCHR',
      decimals,
      totalSupply,
      [accounts[0].address],
      [totalSupply]
    )

    const TokenLockup = await hre.ethers.getContractFactory('TokenLockup')
    tokenLockup = await TokenLockup.deploy(
      token.address,
      'Xavier Yolo Zeus Token Lockup Release Scheduler',
      'XYZ Lockup',
      100,
      346896000
    )
  })

  it('timelock creation with immediately unlocked tokens', async () => {
    const totalRecipientAmount = 100
    const totalBatches = 3
    const firstDelay = 0
    const firstBatchBips = 800 // 8%
    const batchDelay = 3600 * 24 * 4 // 4 days
    const commence = await exactlyMoreThanOneDayAgo()

    expect(await tokenLockup.unlockedBalanceOf(recipient.address))
      .to.equal(0)
    expect(await tokenLockup.scheduleCount())
      .to.equal(0)
    await token.connect(reserveAccount).approve(tokenLockup.address, totalRecipientAmount)

    await tokenLockup.connect(reserveAccount).createReleaseSchedule(
      totalBatches,
      firstDelay,
      firstBatchBips,
      batchDelay
    )

    await tokenLockup.connect(reserveAccount).fundReleaseSchedule(
      recipient.address,
      totalRecipientAmount,
      commence,
      0, // scheduleId
      []
    )

    expect(await tokenLockup.unlockedBalanceOf(recipient.address))
      .to.equal('8')

    expect(await tokenLockup.lockedBalanceOf(recipient.address))
      .to.equal('92')

    expect(await tokenLockup.balanceOf(recipient.address))
      .to.equal('100')

    await advanceTime('5')

    // firstBatch + ((totalRecipientAmount - firstBatch) / 2)
    // 8 + ((100 - 8) / 2) = 8 + (92 / 2) = 8 + 46 = 54
    expect(await tokenLockup.unlockedBalanceOf(recipient.address))
      .to.equal('54')

    expect(await tokenLockup.lockedBalanceOf(recipient.address))
      .to.equal('46')

    expect(await tokenLockup.balanceOf(recipient.address))
      .to.equal('100')

    await advanceTime('5')

    expect(await tokenLockup.unlockedBalanceOf(recipient.address))
      .to.equal(totalRecipientAmount)
    expect(await tokenLockup.lockedBalanceOf(recipient.address))
      .to.equal('0')

    expect(await tokenLockup.balanceOf(recipient.address))
      .to.equal('100')
  })

  it('can return all balance types of locked and unlocked tokens in multiple release schedules', async () => {
    const totalBatches = 3
    const firstDelay = 0
    const firstBatchBips = 800 // 8%
    const batchDelay = 3600 * 24 * 4 // 4 days
    const commence = await exactlyMoreThanOneDayAgo()

    expect(await tokenLockup.unlockedBalanceOf(recipient.address))
      .to.equal(0)
    expect(await tokenLockup.scheduleCount())
      .to.equal(0)
    await token.connect(reserveAccount).approve(tokenLockup.address, 300)

    await tokenLockup.connect(reserveAccount).createReleaseSchedule(
      totalBatches,
      firstDelay,
      firstBatchBips,
      batchDelay
    )

    await tokenLockup.connect(reserveAccount).createReleaseSchedule(
      totalBatches,
      firstDelay,
      firstBatchBips,
      batchDelay
    )

    await tokenLockup.connect(reserveAccount).fundReleaseSchedule(
      recipient.address,
      100,
      commence,
      0, // scheduleId
      []
    )

    await tokenLockup.connect(reserveAccount).fundReleaseSchedule(
      recipient.address,
      200,
      commence,
      1, // scheduleId
      []
    )

    await advanceTime(1)

    expect(await tokenLockup.unlockedBalanceOf(recipient.address))
      .to.equal('24')
    expect(await tokenLockup.unlockedBalanceOfTimelock(recipient.address, 0))
      .to.equal('8')
    expect(await tokenLockup.unlockedBalanceOfTimelock(recipient.address, 1))
      .to.equal('16')

    expect(await tokenLockup.lockedBalanceOf(recipient.address))
      .to.equal('276')
    expect(await tokenLockup.lockedBalanceOfTimelock(recipient.address, 0))
      .to.equal('92')
    expect(await tokenLockup.lockedBalanceOfTimelock(recipient.address, 1))
      .to.equal('184')

    expect(await tokenLockup.balanceOfTimelock(recipient.address, 0))
      .to.equal(8 + 92)
    expect(await tokenLockup.balanceOfTimelock(recipient.address, 1))
      .to.equal(16 + 184)

    expect(await tokenLockup.balanceOf(recipient.address))
      .to.equal('300')
  })

  it('it can set a schedule to a balance in the past', async () => {
    const totalRecipientAmount = 100
    const totalBatches = 3
    const firstDelay = 0
    const firstBatchBips = 800 // 8%
    const batchDelay = 3600 * 24 * 365 * 200 // 200 years
    const commence = currentTimestamp(-(60 * 60 * 24 * 365 * 10))

    expect(await tokenLockup.unlockedBalanceOf(recipient.address))
      .to.equal(0)
    expect(await tokenLockup.scheduleCount())
      .to.equal(0)
    await token.connect(reserveAccount).approve(tokenLockup.address, totalRecipientAmount * 2)

    await tokenLockup.connect(reserveAccount).createReleaseSchedule(
      totalBatches,
      firstDelay,
      firstBatchBips,
      batchDelay
    )

    await tokenLockup.connect(reserveAccount).fundReleaseSchedule(
      recipient.address,
      totalRecipientAmount,
      commence,
      0, // scheduleId
      []
    )

    expect(await tokenLockup.unlockedBalanceOf(recipient.address))
      .to.equal('8')

    expect(await tokenLockup.lockedBalanceOf(recipient.address))
      .to.equal('92')

    expect(await tokenLockup.balanceOf(recipient.address))
      .to.equal('100')

    await tokenLockup.connect(reserveAccount).fundReleaseSchedule(
      recipient.address,
      totalRecipientAmount,
      commence,
      0, // scheduleId
      []
    )

    expect(await tokenLockup.unlockedBalanceOf(recipient.address))
      .to.equal('16')

    expect(await tokenLockup.lockedBalanceOf(recipient.address))
      .to.equal('184')

    expect(await tokenLockup.balanceOf(recipient.address))
      .to.equal('200')

    expect(await tokenLockup.lockedBalanceOfTimelock(recipient.address, 0))
      .to.equal('92')

    expect(await tokenLockup.unlockedBalanceOfTimelock(recipient.address, 0))
      .to.equal('8')

    expect(await tokenLockup.lockedBalanceOfTimelock(recipient.address, 1))
      .to.equal('92')

    expect(await tokenLockup.unlockedBalanceOfTimelock(recipient.address, 1))
      .to.equal('8')

    expect(await tokenLockup.balanceOfTimelock(recipient.address, 0))
      .to.equal(92 + 8)
    expect(await tokenLockup.balanceOfTimelock(recipient.address, 1))
      .to.equal(92 + 8)
  })

  it('creating a timelock increases the totalSupply and transferring decreases it', async () => {
    expect(await tokenLockup.totalSupply()).to.equal('0')

    const releaseCount = 2
    const firstDelay = 0
    const firstBatchBips = 5000
    const commence = await currentTimestamp()
    const periodBetweenReleases = days(4)
    const recipientAccount = accounts[2].address

    await token.connect(reserveAccount).approve(tokenLockup.address, 200)

    await tokenLockup.connect(reserveAccount).createReleaseSchedule(
      releaseCount,
      firstDelay,
      firstBatchBips,
      periodBetweenReleases
    )

    // half of the 100 tokens from each release are available
    await tokenLockup.connect(reserveAccount).fundReleaseSchedule(
      recipient.address,
      100,
      commence,
      0, // scheduleId
      []
    )
    expect(await tokenLockup.totalSupply()).to.equal('100')

    await tokenLockup.connect(reserveAccount).createReleaseSchedule(
      releaseCount,
      firstDelay,
      firstBatchBips,
      periodBetweenReleases
    )
    await tokenLockup.connect(reserveAccount).fundReleaseSchedule(
      recipient.address,
      100,
      commence,
      1, // scheduleId
      []
    )
    expect(await tokenLockup.totalSupply()).to.equal('200')

    // transfer 50 from the first timelock and 1 from the second timelock
    await tokenLockup.connect(recipient).transfer(recipientAccount, 51)
    expect(await tokenLockup.totalSupply()).to.equal('149')

    // transfer 50 from the first timelock and 1 from the second timelock
    await tokenLockup.connect(recipient).transfer(recipientAccount, 49)
    expect(await tokenLockup.totalSupply()).to.equal('100')

    // unlock the remaining tokens and check the state
    advanceTime(4)

    // transfer 50 from the second timelock and 1 from the second timelock
    await tokenLockup.connect(recipient).transfer(recipientAccount, 51)
    expect(await tokenLockup.totalSupply()).to.equal('49')

    // transfer 50 from the second timelock and 1 from the second timelock
    await tokenLockup.connect(recipient).transfer(recipientAccount, 49)
    expect(await tokenLockup.totalSupply()).to.equal('0')
  })

  it('it can set a schedule to a balance in the future within the maxCommencementTimeInSeconds', async () => {
    const totalRecipientAmount = 100
    const totalBatches = 3
    const firstDelay = 0
    const firstBatchBips = 800 // 8%
    const batchDelay = 3600 * 24 * 365 * 200 // 200 years
    const commence = currentTimestamp((60 * 60 * 24 * 365 * 10))

    expect(await tokenLockup.unlockedBalanceOf(recipient.address))
      .to.equal(0)
    expect(await tokenLockup.scheduleCount())
      .to.equal(0)
    await token.connect(reserveAccount).approve(tokenLockup.address, totalRecipientAmount * 2)

    await tokenLockup.connect(reserveAccount).createReleaseSchedule(
      totalBatches,
      firstDelay,
      firstBatchBips,
      batchDelay
    )

    await tokenLockup.connect(reserveAccount).fundReleaseSchedule(
      recipient.address,
      totalRecipientAmount,
      commence,
      0, // scheduleId
      []
    )

    expect(await tokenLockup.unlockedBalanceOf(recipient.address))
      .to.equal('0')

    expect(await tokenLockup.lockedBalanceOf(recipient.address))
      .to.equal('100')

    expect(await tokenLockup.balanceOf(recipient.address))
      .to.equal('100')

    await tokenLockup.connect(reserveAccount).fundReleaseSchedule(
      recipient.address,
      totalRecipientAmount,
      commence,
      0, // scheduleId
      []
    )

    expect(await tokenLockup.unlockedBalanceOf(recipient.address))
      .to.equal('0')

    expect(await tokenLockup.lockedBalanceOf(recipient.address))
      .to.equal('200')

    expect(await tokenLockup.balanceOf(recipient.address))
      .to.equal('200')

    expect(await tokenLockup.lockedBalanceOfTimelock(recipient.address, 0))
      .to.equal('100')

    expect(await tokenLockup.unlockedBalanceOfTimelock(recipient.address, 0))
      .to.equal('0')

    expect(await tokenLockup.lockedBalanceOfTimelock(recipient.address, 1))
      .to.equal('100')

    expect(await tokenLockup.unlockedBalanceOfTimelock(recipient.address, 1))
      .to.equal('0')

    expect(await tokenLockup.balanceOfTimelock(recipient.address, 0))
      .to.equal('100')

    expect(await tokenLockup.balanceOfTimelock(recipient.address, 1))
      .to.equal('100')
  })
})
