const hre = require('hardhat')
const chai = require('chai')
const { expect } = chai
const { solidity } = require('ethereum-waffle')
chai.use(solidity)

async function currentTimestamp (offsetInSeconds = 0) {
  return (await hre.ethers.provider.getBlock()).timestamp + offsetInSeconds
}

async function exactlyMoreThanOneDayAgo () {
  return await currentTimestamp(-3601)
}

function days (numDays) {
  return 60 * 60 * 24 * numDays
}

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

describe('TokenLockup unlock scheduling', async function () {
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
      30,
      346896000
    )
  })

  it('unlocked tokens can be transferred', async () => {
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

    expect(await token.balanceOf(tokenLockup.address)).to.equal(100)

    expect(await tokenLockup.unlockedBalanceOf(recipient.address))
      .to.equal('8')

    await tokenLockup.connect(recipient).transfer(accounts[2].address, 7)
    const balance = await token.connect(reserveAccount).balanceOf(accounts[2].address)
    expect(balance).to.equal(7)

    expect(await tokenLockup.lockedBalanceOfTimelock(recipient.address, 0))
      .to.equal('92')

    expect(await tokenLockup.unlockedBalanceOfTimelock(recipient.address, 0))
      .to.equal('1')

    expect(await tokenLockup.unlockedBalanceOf(recipient.address))
      .to.equal('1')

    expect(await tokenLockup.balanceOf(recipient.address))
      .to.equal('93')

    expect(await tokenLockup.lockedBalanceOf(recipient.address))
      .to.equal('92')
  })

  it('unlocked tokens can be transferred from two batches', async () => {
    const releaseCount = 2
    const firstDelay = 0
    const firstBatchBips = 5000
    const commence = await currentTimestamp()
    const periodBetweenReleases = days(4)
    const recipientAccount = accounts[2].address

    await token.connect(reserveAccount).approve(tokenLockup.address, 200)

    expect(await tokenLockup.totalSupply()).to.equal('0')
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

    await tokenLockup.connect(reserveAccount).fundReleaseSchedule(
      recipient.address,
      100,
      commence,
      0, // scheduleId
      []
    )
    expect(await tokenLockup.totalSupply()).to.equal('200')

    // check the starting state is as expected
    expect(await token.balanceOf(tokenLockup.address)).to.equal(200)
    expect(await tokenLockup.unlockedBalanceOf(recipient.address)).to.equal('100')
    expect(await tokenLockup.unlockedBalanceOfTimelock(recipient.address, 0)).to.equal('50')
    expect(await tokenLockup.lockedBalanceOfTimelock(recipient.address, 0)).to.equal('50')
    expect(await tokenLockup.balanceOfTimelock(recipient.address, 0)).to.equal('100')
    expect(await tokenLockup.unlockedBalanceOfTimelock(recipient.address, 1)).to.equal('50')
    expect(await tokenLockup.lockedBalanceOfTimelock(recipient.address, 1)).to.equal('50')
    expect(await tokenLockup.balanceOfTimelock(recipient.address, 1)).to.equal('100')
    expect(await token.connect(reserveAccount).balanceOf(recipientAccount)).to.equal(0)

    // transfer 50 from the first timelock and 1 from the second timelock
    await tokenLockup.connect(recipient).transfer(recipientAccount, 51)

    expect(await tokenLockup.unlockedBalanceOfTimelock(recipient.address, 0)).to.equal('0')
    expect(await tokenLockup.lockedBalanceOfTimelock(recipient.address, 0)).to.equal('50')
    expect(await tokenLockup.balanceOfTimelock(recipient.address, 0)).to.equal('50')

    expect(await tokenLockup.unlockedBalanceOfTimelock(recipient.address, 1)).to.equal('49')
    expect(await tokenLockup.lockedBalanceOfTimelock(recipient.address, 1)).to.equal('50')
    expect(await tokenLockup.balanceOfTimelock(recipient.address, 1)).to.equal('99')
    expect(await token.connect(reserveAccount).balanceOf(recipientAccount)).to.equal(51)

    // transfer 50 from the first timelock and 1 from the second timelock
    await tokenLockup.connect(recipient).transfer(recipientAccount, 49)

    expect(await tokenLockup.unlockedBalanceOfTimelock(recipient.address, 0)).to.equal('0')
    expect(await tokenLockup.lockedBalanceOfTimelock(recipient.address, 0)).to.equal('50')
    expect(await tokenLockup.balanceOfTimelock(recipient.address, 0)).to.equal('50')

    expect(await tokenLockup.unlockedBalanceOfTimelock(recipient.address, 1)).to.equal('0')
    expect(await tokenLockup.lockedBalanceOfTimelock(recipient.address, 1)).to.equal('50')
    expect(await tokenLockup.balanceOfTimelock(recipient.address, 1)).to.equal('50')

    expect(await token.connect(reserveAccount).balanceOf(recipientAccount)).to.equal(100)

    // unlock the remaining tokens and check the state
    advanceTime(4)
    expect(await token.balanceOf(tokenLockup.address)).to.equal(100)
    expect(await tokenLockup.unlockedBalanceOf(recipient.address)).to.equal('100')
    expect(await tokenLockup.unlockedBalanceOfTimelock(recipient.address, 0)).to.equal('50')
    expect(await tokenLockup.lockedBalanceOfTimelock(recipient.address, 0)).to.equal('0')
    expect(await tokenLockup.balanceOfTimelock(recipient.address, 0)).to.equal('50')
    expect(await tokenLockup.unlockedBalanceOfTimelock(recipient.address, 1)).to.equal('50')
    expect(await tokenLockup.lockedBalanceOfTimelock(recipient.address, 1)).to.equal('0')
    expect(await tokenLockup.balanceOfTimelock(recipient.address, 1)).to.equal('50')

    // transfer 50 from the second timelock and 1 from the second timelock
    await tokenLockup.connect(recipient).transfer(recipientAccount, 51)

    expect(await tokenLockup.unlockedBalanceOfTimelock(recipient.address, 0)).to.equal('0')
    expect(await tokenLockup.lockedBalanceOfTimelock(recipient.address, 0)).to.equal('0')
    expect(await tokenLockup.balanceOfTimelock(recipient.address, 0)).to.equal('0')

    expect(await tokenLockup.unlockedBalanceOfTimelock(recipient.address, 1)).to.equal('49')
    expect(await tokenLockup.lockedBalanceOfTimelock(recipient.address, 1)).to.equal('0')
    expect(await tokenLockup.balanceOfTimelock(recipient.address, 1)).to.equal('49')
    expect(await token.connect(reserveAccount).balanceOf(recipientAccount)).to.equal(151)

    // transfer 50 from the second timelock and 1 from the second timelock
    await tokenLockup.connect(recipient).transfer(recipientAccount, 49)

    expect(await tokenLockup.unlockedBalanceOfTimelock(recipient.address, 0)).to.equal('0')
    expect(await tokenLockup.lockedBalanceOfTimelock(recipient.address, 0)).to.equal('0')
    expect(await tokenLockup.balanceOfTimelock(recipient.address, 0)).to.equal('0')

    expect(await tokenLockup.unlockedBalanceOfTimelock(recipient.address, 1)).to.equal('0')
    expect(await tokenLockup.lockedBalanceOfTimelock(recipient.address, 1)).to.equal('0')
    expect(await tokenLockup.balanceOfTimelock(recipient.address, 1)).to.equal('0')
    expect(await token.connect(reserveAccount).balanceOf(recipientAccount)).to.equal(200)
  })
  it('unlocked tokens can transfer from just the first timelock of several', async () => {
    const releaseCount = 2
    const firstDelay = 0
    const firstBatchBips = 5000
    const commence = await currentTimestamp()
    const periodBetweenReleases = days(4)
    const recipientAccount = accounts[2].address

    await token.connect(reserveAccount).approve(tokenLockup.address, 200)

    expect(await tokenLockup.totalSupply()).to.equal('0')
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

    await tokenLockup.connect(reserveAccount).fundReleaseSchedule(
      recipient.address,
      100,
      commence,
      0, // scheduleId
      []
    )
    expect(await tokenLockup.totalSupply()).to.equal('200')

    // check the starting state is as expected
    expect(await token.balanceOf(tokenLockup.address)).to.equal(200)
    expect(await tokenLockup.unlockedBalanceOf(recipient.address)).to.equal('100')
    expect(await tokenLockup.unlockedBalanceOfTimelock(recipient.address, 0)).to.equal('50')
    expect(await tokenLockup.lockedBalanceOfTimelock(recipient.address, 0)).to.equal('50')
    expect(await tokenLockup.balanceOfTimelock(recipient.address, 0)).to.equal('100')
    expect(await tokenLockup.unlockedBalanceOfTimelock(recipient.address, 1)).to.equal('50')
    expect(await tokenLockup.lockedBalanceOfTimelock(recipient.address, 1)).to.equal('50')
    expect(await tokenLockup.balanceOfTimelock(recipient.address, 1)).to.equal('100')
    expect(await token.connect(reserveAccount).balanceOf(recipientAccount)).to.equal(0)

    // transfer 49 from the first timelock and 0 from the second timelock
    await tokenLockup.connect(recipient).transfer(recipientAccount, 49)

    expect(await tokenLockup.unlockedBalanceOfTimelock(recipient.address, 0)).to.equal('1')
    expect(await tokenLockup.lockedBalanceOfTimelock(recipient.address, 0)).to.equal('50')
    expect(await tokenLockup.balanceOfTimelock(recipient.address, 0)).to.equal('51')

    expect(await tokenLockup.unlockedBalanceOfTimelock(recipient.address, 1)).to.equal('50')
    expect(await tokenLockup.lockedBalanceOfTimelock(recipient.address, 1)).to.equal('50')
    expect(await tokenLockup.balanceOfTimelock(recipient.address, 1)).to.equal('100')
    expect(await token.connect(reserveAccount).balanceOf(recipientAccount)).to.equal(49)
  })
})
