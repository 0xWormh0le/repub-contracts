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

const createReleaseSchedule = require('../../lib/createReleaseScheduleExample1')

describe('test lockup periods for token release example', async function () {
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
    await createReleaseSchedule(hre, reserveAccount, tokenLockup.address)

    await token.connect(reserveAccount).approve(tokenLockup.address, totalSupply)
  })

  it('has the expected release schedules, count and ids', async function () {
    expect(await tokenLockup.scheduleCount()).to.equal(4)

    expect((await tokenLockup.releaseSchedules(0)).releaseCount).to.equal('5')
    expect((await tokenLockup.releaseSchedules(0)).delayUntilFirstReleaseInSeconds).to.equal('0')
    expect((await tokenLockup.releaseSchedules(0)).initialReleasePortionInBips).to.equal('770')
    expect((await tokenLockup.releaseSchedules(0)).periodBetweenReleasesInSeconds).to.equal(days(90))

    expect((await tokenLockup.releaseSchedules(1)).releaseCount).to.equal('7')
    expect((await tokenLockup.releaseSchedules(1)).delayUntilFirstReleaseInSeconds).to.equal('0')
    expect((await tokenLockup.releaseSchedules(1)).initialReleasePortionInBips).to.equal('720')
    expect((await tokenLockup.releaseSchedules(1)).periodBetweenReleasesInSeconds).to.equal(days(90))

    expect((await tokenLockup.releaseSchedules(2)).releaseCount).to.equal('5')
    expect((await tokenLockup.releaseSchedules(2)).delayUntilFirstReleaseInSeconds).to.equal('0')
    expect((await tokenLockup.releaseSchedules(2)).initialReleasePortionInBips).to.equal('2000')
    expect((await tokenLockup.releaseSchedules(2)).periodBetweenReleasesInSeconds).to.equal(days(90))

    expect((await tokenLockup.releaseSchedules(3)).releaseCount).to.equal('5')
    expect((await tokenLockup.releaseSchedules(3)).delayUntilFirstReleaseInSeconds).to.equal('0')
    expect((await tokenLockup.releaseSchedules(3)).initialReleasePortionInBips).to.equal('2500')
    expect((await tokenLockup.releaseSchedules(3)).periodBetweenReleasesInSeconds).to.equal(days(90))
  })

  it('releases tokens on the expected schedules', async () => {
    const commence = currentTimestamp()
    const fundingAmount = 10000
    const recipient0 = accounts[2]
    const recipient1 = accounts[3]
    const recipient2 = accounts[4]
    const recipient3 = accounts[5]

    // last argument is the schedule id
    await tokenLockup.connect(reserveAccount).fundReleaseSchedule(recipient0.address, fundingAmount, commence, 0, [])
    await tokenLockup.connect(reserveAccount).fundReleaseSchedule(recipient1.address, fundingAmount, commence, 1, [])
    await tokenLockup.connect(reserveAccount).fundReleaseSchedule(recipient2.address, fundingAmount, commence, 2, [])
    await tokenLockup.connect(reserveAccount).fundReleaseSchedule(recipient3.address, fundingAmount, commence, 3, [])

    // RELEASE 1: check starting balances
    expect(await tokenLockup.balanceOf(recipient0.address)).to.equal(fundingAmount)
    expect(await tokenLockup.balanceOf(recipient1.address)).to.equal(fundingAmount)
    expect(await tokenLockup.balanceOf(recipient2.address)).to.equal(fundingAmount)
    expect(await tokenLockup.balanceOf(recipient3.address)).to.equal(fundingAmount)

    expect(await tokenLockup.unlockedBalanceOf(recipient0.address)).to.equal('770')
    expect(await tokenLockup.unlockedBalanceOf(recipient1.address)).to.equal('720')
    expect(await tokenLockup.unlockedBalanceOf(recipient2.address)).to.equal('2000')
    expect(await tokenLockup.unlockedBalanceOf(recipient3.address)).to.equal('2500')

    // advance to just before the initial 90 day lockup is over - the unlocked balances should be the same
    await advanceTime(89)
    expect(await tokenLockup.unlockedBalanceOf(recipient0.address)).to.equal('770')
    expect(await tokenLockup.unlockedBalanceOf(recipient1.address)).to.equal('720')
    expect(await tokenLockup.unlockedBalanceOf(recipient2.address)).to.equal('2000')
    expect(await tokenLockup.unlockedBalanceOf(recipient3.address)).to.equal('2500')

    // RELEASE 2: 90 days out all the the unlocked balances should increase (+1 day from last check)
    await advanceTime(1)
    expect(await tokenLockup.unlockedBalanceOf(recipient0.address)).to.equal('3077')
    expect(await tokenLockup.unlockedBalanceOf(recipient1.address)).to.equal('2266')
    expect(await tokenLockup.unlockedBalanceOf(recipient2.address)).to.equal('4000')
    expect(await tokenLockup.unlockedBalanceOf(recipient3.address)).to.equal('4375')

    // 89 days out, still the same
    await advanceTime(89)
    expect(await tokenLockup.unlockedBalanceOf(recipient0.address)).to.equal('3077')
    expect(await tokenLockup.unlockedBalanceOf(recipient1.address)).to.equal('2266')
    expect(await tokenLockup.unlockedBalanceOf(recipient2.address)).to.equal('4000')
    expect(await tokenLockup.unlockedBalanceOf(recipient3.address)).to.equal('4375')

    // RELEASE 3: 90 days out (+1 day from last check)
    await advanceTime(1)
    expect(await tokenLockup.unlockedBalanceOf(recipient0.address)).to.equal('5385')
    expect(await tokenLockup.unlockedBalanceOf(recipient1.address)).to.equal('3813')
    expect(await tokenLockup.unlockedBalanceOf(recipient2.address)).to.equal('6000')
    expect(await tokenLockup.unlockedBalanceOf(recipient3.address)).to.equal('6250')

    // 89 days out, still the same
    await advanceTime(89)
    expect(await tokenLockup.unlockedBalanceOf(recipient0.address)).to.equal('5385')
    expect(await tokenLockup.unlockedBalanceOf(recipient1.address)).to.equal('3813')
    expect(await tokenLockup.unlockedBalanceOf(recipient2.address)).to.equal('6000')
    expect(await tokenLockup.unlockedBalanceOf(recipient3.address)).to.equal('6250')

    // RELEASE 4: 90 days out (+1 day from last check)
    await advanceTime(1)
    expect(await tokenLockup.unlockedBalanceOf(recipient0.address)).to.equal('7692')
    expect(await tokenLockup.unlockedBalanceOf(recipient1.address)).to.equal('5360')
    expect(await tokenLockup.unlockedBalanceOf(recipient2.address)).to.equal('8000')
    expect(await tokenLockup.unlockedBalanceOf(recipient3.address)).to.equal('8125')

    // 89 days out, still the same
    await advanceTime(89)
    expect(await tokenLockup.unlockedBalanceOf(recipient0.address)).to.equal('7692')
    expect(await tokenLockup.unlockedBalanceOf(recipient1.address)).to.equal('5360')
    expect(await tokenLockup.unlockedBalanceOf(recipient2.address)).to.equal('8000')
    expect(await tokenLockup.unlockedBalanceOf(recipient3.address)).to.equal('8125')

    // RELEASE 5: 90 days out (+1 day from last check)
    await advanceTime(1)
    expect(await tokenLockup.unlockedBalanceOf(recipient0.address)).to.equal('10000') // fully allocated
    expect(await tokenLockup.unlockedBalanceOf(recipient1.address)).to.equal('6906')
    expect(await tokenLockup.unlockedBalanceOf(recipient2.address)).to.equal('10000') // fully allocated
    expect(await tokenLockup.unlockedBalanceOf(recipient3.address)).to.equal('10000') // fully allocated

    // 89 days out, still the same
    await advanceTime(89)
    expect(await tokenLockup.unlockedBalanceOf(recipient0.address)).to.equal('10000') // fully allocated
    expect(await tokenLockup.unlockedBalanceOf(recipient1.address)).to.equal('6906')
    expect(await tokenLockup.unlockedBalanceOf(recipient2.address)).to.equal('10000') // fully allocated
    expect(await tokenLockup.unlockedBalanceOf(recipient3.address)).to.equal('10000') // fully allocated

    // RELEASE 6: 90 days out (+1 day from last check)
    await advanceTime(1)
    expect(await tokenLockup.unlockedBalanceOf(recipient0.address)).to.equal('10000') // fully allocated
    expect(await tokenLockup.unlockedBalanceOf(recipient1.address)).to.equal('8453')
    expect(await tokenLockup.unlockedBalanceOf(recipient2.address)).to.equal('10000') // fully allocated
    expect(await tokenLockup.unlockedBalanceOf(recipient3.address)).to.equal('10000') // fully allocated

    // 89 days out, still the same
    await advanceTime(89)
    expect(await tokenLockup.unlockedBalanceOf(recipient0.address)).to.equal('10000') // fully allocated
    expect(await tokenLockup.unlockedBalanceOf(recipient1.address)).to.equal('8453')
    expect(await tokenLockup.unlockedBalanceOf(recipient2.address)).to.equal('10000') // fully allocated
    expect(await tokenLockup.unlockedBalanceOf(recipient3.address)).to.equal('10000') // fully allocated

    // RELEASE 7: 90 days out (+1 day from last check)
    await advanceTime(1)
    expect(await tokenLockup.unlockedBalanceOf(recipient0.address)).to.equal('10000') // fully allocated
    expect(await tokenLockup.unlockedBalanceOf(recipient1.address)).to.equal('10000')
    expect(await tokenLockup.unlockedBalanceOf(recipient2.address)).to.equal('10000') // fully allocated
    expect(await tokenLockup.unlockedBalanceOf(recipient3.address)).to.equal('10000') // fully allocated

    // lockedBalances should all be 0 now
    expect(await tokenLockup.lockedBalanceOf(recipient0.address)).to.equal('0') // fully allocated
    expect(await tokenLockup.lockedBalanceOf(recipient1.address)).to.equal('0')
    expect(await tokenLockup.lockedBalanceOf(recipient2.address)).to.equal('0') // fully allocated
    expect(await tokenLockup.lockedBalanceOf(recipient3.address)).to.equal('0') // fully allocated
  })
})
