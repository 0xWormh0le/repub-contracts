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

describe('TokenLockup unlock scheduling for a specific timelock', async function () {
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

    const totalBatches = 3
    const firstDelay = 0
    const firstBatchBips = 800 // 8%
    const batchDelay = 3600 * 24 * 4 // 4 days
    await tokenLockup.connect(reserveAccount).createReleaseSchedule(
      totalBatches,
      firstDelay,
      firstBatchBips,
      batchDelay
    )
  })

  it('can transfer tokens from a specific timelock', async () => {
    const commence = await exactlyMoreThanOneDayAgo()

    await token.connect(reserveAccount).approve(tokenLockup.address, 200)

    await tokenLockup.connect(reserveAccount).fundReleaseSchedule(
      recipient.address,
      100,
      commence,
      0, // scheduleId
      []
    )

    expect(await token.balanceOf(tokenLockup.address)).to.equal(100)

    expect(await tokenLockup.unlockedBalanceOf(recipient.address))
      .to.equal('8')

    expect(await tokenLockup.unlockedBalanceOfTimelock(recipient.address, 0))
      .to.equal('8')

    await tokenLockup.connect(recipient).transferTimelock(accounts[2].address, 7, 0)
    const balance = await token.connect(reserveAccount).balanceOf(accounts[2].address)
    expect(balance).to.equal(7)

    expect(await tokenLockup.unlockedBalanceOf(recipient.address))
      .to.equal('1')

    expect(await tokenLockup.unlockedBalanceOfTimelock(recipient.address, 0))
      .to.equal('1')

    expect(await tokenLockup.balanceOf(recipient.address))
      .to.equal('93')
  })

  it('returns true after transfer', async () => {
    const commence = await exactlyMoreThanOneDayAgo()

    await token.connect(reserveAccount).approve(tokenLockup.address, 200)

    await tokenLockup.connect(reserveAccount).fundReleaseSchedule(
      recipient.address,
      100,
      commence,
      0, // scheduleId
      []
    )

    expect(await tokenLockup.connect(recipient)
      .callStatic.transferTimelock(accounts[2].address, 7, 0))
      .to.equal(true)
  })

  it('cannot transfer more than the unlocked balance', async () => {
    const commence = await exactlyMoreThanOneDayAgo()

    await token.connect(reserveAccount).approve(tokenLockup.address, 200)

    await tokenLockup.connect(reserveAccount).fundReleaseSchedule(
      recipient.address,
      100,
      commence,
      0, // scheduleId
      []
    )

    expect(await token.balanceOf(tokenLockup.address)).to.equal(100)

    expect(await tokenLockup.unlockedBalanceOf(recipient.address))
      .to.equal('8')

    expect(await tokenLockup.unlockedBalanceOfTimelock(recipient.address, 0))
      .to.equal('8')

    let errorMessage
    try {
      await tokenLockup.connect(recipient).transferTimelock(accounts[2].address, 9, 0)
    } catch (e) {
      errorMessage = e.message
    }

    expect(errorMessage).to.match(/amount > unlocked/)

    const balance = await token.connect(reserveAccount).balanceOf(accounts[2].address)
    expect(balance).to.equal(0)

    expect(await tokenLockup.unlockedBalanceOf(recipient.address))
      .to.equal('8')

    expect(await tokenLockup.unlockedBalanceOfTimelock(recipient.address, 0))
      .to.equal('8')

    expect(await tokenLockup.balanceOf(recipient.address))
      .to.equal('100')
  })

  it('unlocked tokens can be transferred from a specific timelock', async () => {
    const totalBatches = 3
    const firstDelay = 0
    const firstBatchBips = 800 // 8%
    const batchDelay = 3600 * 24 * 4 // 4 days
    const commence = await exactlyMoreThanOneDayAgo()

    expect(await tokenLockup.unlockedBalanceOf(recipient.address))
      .to.equal(0)
    expect(await tokenLockup.scheduleCount())
      .to.equal(1)
    await token.connect(reserveAccount).approve(tokenLockup.address, 200)

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
      50,
      commence,
      0, // scheduleId
      []
    )

    expect(await token.balanceOf(tokenLockup.address)).to.equal(150)

    expect(await tokenLockup.unlockedBalanceOf(recipient.address))
      .to.equal('12')

    expect(await tokenLockup.unlockedBalanceOfTimelock(recipient.address, 0))
      .to.equal('8')

    expect(await tokenLockup.unlockedBalanceOfTimelock(recipient.address, 1))
      .to.equal('4')

    await tokenLockup.connect(recipient).transferTimelock(accounts[2].address, 7, 0)
    const balance = await token.connect(reserveAccount).balanceOf(accounts[2].address)
    expect(balance).to.equal(7)

    expect(await tokenLockup.unlockedBalanceOfTimelock(recipient.address, 0))
      .to.equal('1')

    expect(await tokenLockup.unlockedBalanceOfTimelock(recipient.address, 1))
      .to.equal('4')

    expect(await tokenLockup.unlockedBalanceOf(recipient.address))
      .to.equal('5')

    expect(await token.balanceOf(tokenLockup.address)).to.equal(143)
  })

  it('transferring from a timelock cannot use tokens from another timelock', async () => {
    const totalBatches = 3
    const firstDelay = 0
    const firstBatchBips = 800 // 8%
    const batchDelay = 3600 * 24 * 4 // 4 days
    const commence = await exactlyMoreThanOneDayAgo()

    expect(await tokenLockup.unlockedBalanceOf(recipient.address))
      .to.equal(0)
    expect(await tokenLockup.scheduleCount())
      .to.equal(1)
    await token.connect(reserveAccount).approve(tokenLockup.address, 200)

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
      50,
      commence,
      0, // scheduleId
      []
    )

    expect(await token.balanceOf(tokenLockup.address)).to.equal(150)

    expect(await tokenLockup.unlockedBalanceOf(recipient.address))
      .to.equal('12')

    expect(await tokenLockup.unlockedBalanceOfTimelock(recipient.address, 0))
      .to.equal('8')

    expect(await tokenLockup.unlockedBalanceOfTimelock(recipient.address, 1))
      .to.equal('4')

    let errorMessage
    try {
      await tokenLockup.connect(recipient).transferTimelock(accounts[2].address, 9, 0)
    } catch (e) {
      errorMessage = e.message
    }
    expect(errorMessage).to.match(/amount > unlocked/)

    const balance = await token.connect(reserveAccount).balanceOf(accounts[2].address)

    expect(balance).to.equal(0)

    expect(await token.balanceOf(tokenLockup.address)).to.equal(150)

    expect(await tokenLockup.unlockedBalanceOf(recipient.address))
      .to.equal('12')

    expect(await tokenLockup.unlockedBalanceOfTimelock(recipient.address, 0))
      .to.equal('8')

    expect(await tokenLockup.unlockedBalanceOfTimelock(recipient.address, 1))
      .to.equal('4')
  })
})
