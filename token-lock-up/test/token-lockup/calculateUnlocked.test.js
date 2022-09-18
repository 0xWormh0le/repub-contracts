const hre = require('hardhat')
const chai = require('chai')
const { expect } = chai
const { solidity } = require('ethereum-waffle')
chai.use(solidity)

function days (numDays) {
  return 60 * 60 * 24 * numDays
}

function months (numMonths) {
  return days(30 * numMonths)
}

describe('TokenLockup calculate unlocked', async function () {
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
      100,
      346896000 // 11 years
    )
  })

  describe('simple no delay 2 period 50/50', async () => {
    let scheduledId
    const commenced = 0
    const amount = 100

    beforeEach(async () => {
      const tx = await tokenLockup.connect(reserveAccount).createReleaseSchedule(
        2, // totalBatches
        0, // firstDelay
        5000, // firstBatchBips
        months(1) // batchDelay
      )
      scheduledId = tx.value.toString()
    })

    it('50% unlocked at start', async () => {
      const currentTime = commenced
      const unlocked = await tokenLockup['calculateUnlocked(uint256,uint256,uint256,uint256)'](commenced, currentTime, amount, scheduledId)
      expect(unlocked).to.equal(50)
    })

    it('100% unlocked after first batch bips', async () => {
      const currentTime = commenced + months(1)

      const unlockedAtStart = await tokenLockup['calculateUnlocked(uint256,uint256,uint256,uint256)'](commenced, currentTime, amount, scheduledId)
      expect(unlockedAtStart).to.equal(100)
    })
  })

  describe('simple 1 month delay then 2 period 50/50', async () => {
    let scheduledId
    const commenced = 0
    const amount = 100

    beforeEach(async () => {
      const tx = await tokenLockup.connect(reserveAccount).createReleaseSchedule(
        2, // totalBatches
        months(1), // firstDelay
        5000, // firstBatchBips
        months(1) // batchDelay
      )
      scheduledId = tx.value.toString()
    })

    it('0% unlocked at start', async () => {
      const currentTime = commenced

      const unlocked = await tokenLockup['calculateUnlocked(uint256,uint256,uint256,uint256)'](commenced, currentTime, amount, scheduledId)
      expect(unlocked).to.equal(0)
    })

    it('0% unlocked 1 second before the initial delay has elapsed', async () => {
      const currentTime = commenced + months(1) - 1

      const unlocked = await tokenLockup['calculateUnlocked(uint256,uint256,uint256,uint256)'](commenced, currentTime, amount, scheduledId)
      expect(unlocked).to.equal(0)
    })

    it('50% unlocked after 1 month', async () => {
      const currentTime = commenced + months(1)

      const unlocked = await tokenLockup['calculateUnlocked(uint256,uint256,uint256,uint256)'](commenced, currentTime, amount, scheduledId)
      expect(unlocked).to.equal(50)
    })

    it('50% unlocked 1 second before the 2nd final period has elapsed', async () => {
      const currentTime = commenced + months(2) - 1

      const unlocked = await tokenLockup['calculateUnlocked(uint256,uint256,uint256,uint256)'](commenced, currentTime, amount, scheduledId)
      expect(unlocked).to.equal(50)
    })

    it('100% unlocked after 2 months', async () => {
      const currentTime = commenced + months(2)

      const unlocked = await tokenLockup['calculateUnlocked(uint256,uint256,uint256,uint256)'](commenced, currentTime, amount, scheduledId)
      expect(unlocked).to.equal(100)
    })
  })

  describe('8% after 0 delay then remainder over 3 90 day periods with remainder in last period.', async () => {
    let scheduledId
    const commenced = 0
    const amount = 100

    beforeEach(async () => {
      const tx = await tokenLockup.connect(reserveAccount).createReleaseSchedule(
        4, // totalBatches
        0, // firstDelay
        800, // firstBatchBips
        days(90) // batchDelay
      )
      scheduledId = tx.value.toString()
    })

    it('8% unlocked at start', async () => {
      const currentTime = commenced

      const unlocked = await tokenLockup['calculateUnlocked(uint256,uint256,uint256,uint256)'](commenced, currentTime, amount, scheduledId)
      expect(unlocked).to.equal(8)
    })

    it('30 + 8 unlocked after 90 days', async () => {
      const currentTime = commenced + months(3)

      const unlocked = await tokenLockup['calculateUnlocked(uint256,uint256,uint256,uint256)'](commenced, currentTime, amount, scheduledId)
      expect(unlocked).to.equal(38)
    })

    it('60 + 9 unlocked after 180 days', async () => {
      const currentTime = commenced + months(6)

      const unlocked = await tokenLockup['calculateUnlocked(uint256,uint256,uint256,uint256)'](commenced, currentTime, amount, scheduledId)
      expect(unlocked).to.equal(69)
    })

    it('90 + 8 + remainder = 100 unlocked after 180 days', async () => {
      const currentTime = commenced + months(9)

      const unlocked = await tokenLockup['calculateUnlocked(uint256,uint256,uint256,uint256)'](commenced, currentTime, amount, scheduledId)
      expect(unlocked).to.equal(100)
    })
  })

  describe('7.7% released immediately and remainder released in equal amounts every 90 days for 360 days', async () => {
    let scheduledId
    const commenced = 0
    const amount = 1000

    beforeEach(async () => {
      const tx = await tokenLockup.connect(reserveAccount).createReleaseSchedule(
        5, // totalBatches, initial plus 4 90 day releases
        0, // firstDelay
        770, // firstBatchBips
        months(3) // batchDelay
      )
      scheduledId = tx.value.toString()
    })

    it('77 = 7.7% = 770 bips unlocked at start', async () => {
      const currentTime = commenced

      const unlocked = await tokenLockup['calculateUnlocked(uint256,uint256,uint256,uint256)'](commenced, currentTime, amount, scheduledId)
      expect(unlocked).to.equal(77)
    })

    it('307 = 77 + 230 // truncate((923x1)/4) unlocked after one 90 day period', async () => {
      const currentTime = commenced + months(3)

      const unlocked = await tokenLockup['calculateUnlocked(uint256,uint256,uint256,uint256)'](commenced, currentTime, amount, scheduledId)
      expect(unlocked).to.equal(307)
    })

    it('538 = 77 +  461 // truncate((923x2)/4) periods unlocked after 180 days', async () => {
      const currentTime = commenced + months(6)

      const unlocked = await tokenLockup['calculateUnlocked(uint256,uint256,uint256,uint256)'](commenced, currentTime, amount, scheduledId)
      expect(unlocked).to.equal(538)
    })

    it('769 = 77 + 692 // truncate((923x3)/4) unlocked after 270 days', async () => {
      const currentTime = commenced + months(9)

      const unlocked = await tokenLockup['calculateUnlocked(uint256,uint256,uint256,uint256)'](commenced, currentTime, amount, scheduledId)
      expect(unlocked).to.equal(769)
    })

    it('1000 = 77 + 923 * truncate((923x4)/4) unlocked after 360 days', async () => {
      const currentTime = commenced + months(12)

      const unlocked = await tokenLockup['calculateUnlocked(uint256,uint256,uint256,uint256)'](commenced, currentTime, amount, scheduledId)
      expect(unlocked).to.equal(1000)
    })
  })

  describe('7.2% released immediately and remainder released in equal amounts every 90 days for 540 days (6 quarters)', async () => {
    let scheduledId
    const commenced = 0
    const amount = 1000

    beforeEach(async () => {
      const tx = await tokenLockup.connect(reserveAccount).createReleaseSchedule(
        7, // totalBatches, initial plus 6 90 day releases
        0, // firstDelay
        720, // firstBatchBips
        days(90) // batchDelay
      )
      scheduledId = tx.value.toString()
    })

    it('72 = 7.2% = 720 bips unlocked at start', async () => {
      const currentTime = commenced

      const unlocked = await tokenLockup['calculateUnlocked(uint256,uint256,uint256,uint256)'](commenced, currentTime, amount, scheduledId)
      expect(unlocked).to.equal(72)
    })

    it('226 = 72 + 154(truncated period portion) unlocked after one 90 day period', async () => {
      const currentTime = commenced + days(90)

      const unlocked = await tokenLockup['calculateUnlocked(uint256,uint256,uint256,uint256)'](commenced, currentTime, amount, scheduledId)
      expect(unlocked).to.equal(226)
    })

    it('380 = 72 + 309 periods unlocked after 180 days', async () => {
      const currentTime = commenced + days(180)

      const unlocked = await tokenLockup['calculateUnlocked(uint256,uint256,uint256,uint256)'](commenced, currentTime, amount, scheduledId)
      expect(unlocked).to.equal(381)
    })

    it('534 = 72 + 464 periods unlocked after 270 days', async () => {
      const currentTime = commenced + days(270)

      const unlocked = await tokenLockup['calculateUnlocked(uint256,uint256,uint256,uint256)'](commenced, currentTime, amount, scheduledId)
      expect(unlocked).to.equal(536)
    })

    it('688 = 72 + 618 periods unlocked after 360 days', async () => {
      const currentTime = commenced + days(360)

      const unlocked = await tokenLockup['calculateUnlocked(uint256,uint256,uint256,uint256)'](commenced, currentTime, amount, scheduledId)
      expect(unlocked).to.equal(690)
    })

    it('842 = 72 + 773 periods unlocked after 450 days', async () => {
      const currentTime = commenced + days(450)

      const unlocked = await tokenLockup['calculateUnlocked(uint256,uint256,uint256,uint256)'](commenced, currentTime, amount, scheduledId)
      expect(unlocked).to.equal(845)
    })

    it('1000 = 72 + 154 * 6 periods + 4 (remainder) unlocked after 540 days', async () => {
      const currentTime = commenced + days(540)

      const unlocked = await tokenLockup['calculateUnlocked(uint256,uint256,uint256,uint256)'](commenced, currentTime, amount, scheduledId)
      expect(unlocked).to.equal(1000)
    })
  })

  describe('continuous vesting per second', async () => {
    let scheduledId
    const commenced = 0
    const numberOfSecondsInYear = 365 * 24 * 60 * 60 // 31,536,000
    const amount = numberOfSecondsInYear // 1 token per second

    beforeEach(async () => {
      const tx = await tokenLockup.connect(reserveAccount).createReleaseSchedule(
        numberOfSecondsInYear, // totalBatches
        0, // firstDelay
        0, // firstBatchBips
        1 // 1 per period
      )
      scheduledId = tx.value.toString()
    })

    it('0 unlocked at start', async () => {
      const currentTime = commenced

      const unlocked = await tokenLockup['calculateUnlocked(uint256,uint256,uint256,uint256)'](commenced, currentTime, amount, scheduledId)
      expect(unlocked).to.equal(0)
    })

    it('1 token unlocked each second for 1 year (365 days)', async () => {
      expect(await tokenLockup['calculateUnlocked(uint256,uint256,uint256,uint256)'](commenced, 1, amount, scheduledId)).to.equal(1)
      expect(await tokenLockup['calculateUnlocked(uint256,uint256,uint256,uint256)'](commenced, 1e6, amount, scheduledId)).to.equal(1e6)
      expect(await tokenLockup['calculateUnlocked(uint256,uint256,uint256,uint256)'](commenced, 31536000, amount, scheduledId)).to.equal(31536000)
      expect(await tokenLockup['calculateUnlocked(uint256,uint256,uint256,uint256)'](commenced, numberOfSecondsInYear, amount, scheduledId)).to.equal(numberOfSecondsInYear)
      expect(await tokenLockup['calculateUnlocked(uint256,uint256,uint256,uint256)'](commenced, numberOfSecondsInYear + 1, amount, scheduledId)).to.equal(numberOfSecondsInYear)
    })

    it('remainder of tokens delivered as evenly as possible if amount = 2 x numberOfPeriods - 10', async () => {
      // the formula should do truncate((amount + elapsedPeriods) / periods)
      // instead of truncate(amount / periods) * elapsed periods
      // this by delaying truncation this distributes tokens more evenly accross the time periods
      // the more time periods, the more these accumulations add up
      // this is most dramatic for distributions calculated every seconds for millions of seconds
      const amount = (numberOfSecondsInYear * 2) - 10
      expect(await tokenLockup['calculateUnlocked(uint256,uint256,uint256,uint256)'](commenced, 1, amount, scheduledId)).to.equal(1)

      // third period is where even distributions starts accumulating differently than if we divided all periods first then multiplied
      expect(await tokenLockup['calculateUnlocked(uint256,uint256,uint256,uint256)'](commenced, 3, amount, scheduledId)).to.equal(5)
      expect(await tokenLockup['calculateUnlocked(uint256,uint256,uint256,uint256)'](commenced, 10, amount, scheduledId)).to.equal(19)
      expect(await tokenLockup['calculateUnlocked(uint256,uint256,uint256,uint256)'](commenced, 100, amount, scheduledId)).to.equal(199)

      // at 1M seconds the difference in what is distributed using this method is double - 1. Very significant.
      expect(await tokenLockup['calculateUnlocked(uint256,uint256,uint256,uint256)'](commenced, 1e6, amount, scheduledId)).to.equal(1999999)
      expect(await tokenLockup['calculateUnlocked(uint256,uint256,uint256,uint256)'](commenced, numberOfSecondsInYear, amount, scheduledId)).to.equal(amount)
      expect(await tokenLockup['calculateUnlocked(uint256,uint256,uint256,uint256)'](commenced, numberOfSecondsInYear, amount, scheduledId)).to.equal(amount)
      expect(await tokenLockup['calculateUnlocked(uint256,uint256,uint256,uint256)'](commenced, numberOfSecondsInYear + 1, amount, scheduledId)).to.equal(amount)
    })
  })
})
