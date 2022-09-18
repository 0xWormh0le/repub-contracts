const hre = require('hardhat')
const chai = require('chai')
const { expect } = chai
const { solidity } = require('ethereum-waffle')
chai.use(solidity)

describe('TokenLockup create release schedule', async function () {
  let tokenLockup, token, reserveAccount, accounts
  const decimals = 10
  const totalSupply = 8e9

  beforeEach(async () => {
    accounts = await hre.ethers.getSigners()

    reserveAccount = accounts[0]

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
      1e4,
      346896000
    )
    await token.approve(tokenLockup.address, totalSupply)
  })

  it('increments the schedulerCount', async function () {
    await expect(tokenLockup.connect(reserveAccount).createReleaseSchedule(2, 0, 1, 1))
      .to.emit(tokenLockup, 'ScheduleCreated')
      .withArgs(reserveAccount.address, 0)
    expect(await tokenLockup.scheduleCount()).to.equal(1)

    await expect(tokenLockup.connect(reserveAccount).createReleaseSchedule(2, 0, 1, 1))
      .to.emit(tokenLockup, 'ScheduleCreated')
      .withArgs(reserveAccount.address, 1)
    expect(await tokenLockup.scheduleCount()).to.equal(2)
  })

  it('should be able to check if the lockup is cancelable', async () => {
    await expect(tokenLockup.connect(reserveAccount).createReleaseSchedule(2, 0, 1, 1))
      .to.emit(tokenLockup, 'ScheduleCreated')
      .withArgs(reserveAccount.address, 0)
    expect(await tokenLockup.scheduleCount()).to.equal(1)

    await tokenLockup.fundReleaseSchedule(accounts[1].address, 10000, 0, 0, [])
    const timelock = await tokenLockup.timelockOf(accounts[1].address, 0)
    expect(timelock.cancelableBy.length).to.equal(0)
  })

  it('funder cannot cancel a non existent timelock', async () => {
    await expect(tokenLockup.connect(reserveAccount).createReleaseSchedule(2, 0, 1, 1))
      .to.emit(tokenLockup, 'ScheduleCreated')
      .withArgs(reserveAccount.address, 0)
    expect(await tokenLockup.scheduleCount()).to.equal(1)
    await tokenLockup.fundReleaseSchedule(accounts[1].address, 10000, 0, 0, [])

    let errorMessage
    try {
      await tokenLockup.connect(reserveAccount).cancelTimelock(accounts[1].address, 0, 0, 0, 1000, accounts[0].address)
    } catch (e) {
      errorMessage = e.message
    }

    expect(errorMessage).to.match(/You are not allowed to cancel this timelock/)
  })

  it('emits a CreateSchedule event', async () => {
    await expect(tokenLockup.connect(reserveAccount).createReleaseSchedule(2, 0, 1, 1))
      .to.emit(tokenLockup, 'ScheduleCreated')
      .withArgs(reserveAccount.address, 0)
  })

  it('must have at least 1 release', async function () {
    let error
    try {
      await tokenLockup.connect(reserveAccount).createReleaseSchedule(0, 1, 1, 1)
    } catch (e) {
      error = e
    }

    expect(error.message).to.match(/< 1 release/)
  })

  it('if there is one release it must release all tokens', async function () {
    let error
    try {
      await tokenLockup.connect(reserveAccount).createReleaseSchedule(1, 0, 1, 1)
    } catch (e) {
      error = e
    }

    expect(error.message).to.match(/released < 100%/)
  })

  it('if there is one release it can release all tokens on the first batch', async function () {
    const tx = await tokenLockup.connect(reserveAccount).createReleaseSchedule(1, 0, 10000, 1)
    const scheduleId = tx.value.toString()
    expect(scheduleId).to.equal('0')
    const schedule = await tokenLockup.connect(reserveAccount).releaseSchedules(scheduleId)
    expect(schedule.initialReleasePortionInBips).to.equal(10000)
  })

  it('initial release amount cannot exceed 100% (100 00 bips', async function () {
    let error
    try {
      await tokenLockup.connect(reserveAccount).createReleaseSchedule(1, 0, 10001, 1)
    } catch (e) {
      error = e
    }

    expect(error.message).to.match(/release > 100%/)
  })

  it('must have a period duration of at least 1 second', async function () {
    let error
    try {
      await tokenLockup.connect(reserveAccount).createReleaseSchedule(2, 2, 5000, 0)
    } catch (e) {
      error = e
    }

    expect(error.message).to.match(/period = 0/)
  })
})
