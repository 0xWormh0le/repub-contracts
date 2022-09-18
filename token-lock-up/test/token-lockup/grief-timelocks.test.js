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

describe('TokenLockup griefer resilience', async function () {
  let tokenLockup, token, reserveAccount, recipient, accounts
  beforeEach(async () => {
    const decimals = 10
    const totalSupply = 8e9

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

    expect(await tokenLockup.unlockedBalanceOf(recipient.address))
      .to.equal(0)
    expect(await tokenLockup.scheduleCount())
      .to.equal(0)
    await token.connect(reserveAccount).approve(tokenLockup.address, 100e6)

    // legit token release schedule 50% available on commencement 50% after 30 days
    await tokenLockup.connect(reserveAccount).createReleaseSchedule(
      2, // batches
      0, // delay
      5000, // initial release
      days(30) // period between batches
    )

    // griefer release schedule A - min amount 1 period to be placed far in the future
    await tokenLockup.connect(reserveAccount).createReleaseSchedule(
      100e3, // batches
      0, // delay
      0, // initial release
      1 // period between batches
    )
  })

  it('unlocked tokens can be transferred when there are 101 timelocks created in the future', async () => {
    const commence = await exactlyMoreThanOneDayAgo()
    await tokenLockup.connect(reserveAccount).fundReleaseSchedule(
      recipient.address,
      1000,
      commence,
      0, // scheduleId
      []
    )

    const fundings = []
    for (let i = 0; i < 100; i++) {
      fundings.push(
        tokenLockup.connect(reserveAccount).fundReleaseSchedule(
          recipient.address,
          1000,
          (commence + days(1000)),
          0, // scheduleId
          []
        )
      )
    }
    await Promise.all(fundings)
    expect(await tokenLockup.timelockCountOf(recipient.address))
      .to.equal('101')

    expect(await tokenLockup.unlockedBalanceOf(recipient.address))
      .to.equal('500')

    await tokenLockup.connect(recipient).transfer(accounts[2].address, 500)
    const balance = await token.connect(reserveAccount).balanceOf(accounts[2].address)
    expect(balance).to.equal(500)
  }).timeout(10000)

  it('unlocked tokens can be transferred when there are 101 timelocks running in parallel', async () => {
    const commence = await exactlyMoreThanOneDayAgo()
    await tokenLockup.connect(reserveAccount).fundReleaseSchedule(
      recipient.address,
      1000,
      commence,
      0, // scheduleId
      []
    )

    const fundings = []
    for (let i = 0; i < 100; i++) {
      fundings.push(
        tokenLockup.connect(reserveAccount).fundReleaseSchedule(
          recipient.address,
          100e3,
          commence,
          1, // scheduleId
          []
        )
      )
    }
    await Promise.all(fundings)
    expect(await tokenLockup.timelockCountOf(recipient.address))
      .to.equal('101')

    const unlocked = parseInt(await tokenLockup.unlockedBalanceOf(recipient.address))
    expect(unlocked)
      .to.greaterThan(300000)

    await tokenLockup.connect(recipient).transfer(accounts[2].address, 500)
    const balance = await token.connect(reserveAccount).balanceOf(accounts[2].address)
    expect(balance).to.equal(500)
  }).timeout(10000)
})
