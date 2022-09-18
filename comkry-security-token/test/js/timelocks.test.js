const { expect } = require('chai');

describe("Timelocks", function () {
  let contractAdmin
  let reserveAdmin
  let unprivileged
  let token
  let transferAdmin

  let futureTimelock = Date.now() + 3600 * 24 * 30;
  
  beforeEach(async function () {
    const RestrictedToken = await ethers.getContractFactory('RestrictedToken')
    const TransferRules = await ethers.getContractFactory("TransferRules")
    const accounts = await ethers.getSigners()

    contractAdmin = accounts[0]
    transferAdmin = accounts[1]
    walletsAdmin = accounts[2]
    reserveAdmin = accounts[3]

    unprivileged = accounts[5]
    alice = accounts[6]
    bob = accounts[7]

    let rules = await TransferRules.deploy()
    token = await RestrictedToken.deploy(
      rules.address,
      contractAdmin.address,
      reserveAdmin.address,
      "xyz",
      "Ex Why Zee",
      6,
      100,
      1e6
    )

    await token.connect(contractAdmin).grantTransferAdmin(transferAdmin.address)

    await token.connect(contractAdmin).grantWalletsAdmin(walletsAdmin.address)

    await token.connect(reserveAdmin).mint(alice.address, 60)

    await token.connect(walletsAdmin).setAddressPermissions(alice.address, 0, 0, 0, 0, false)

    await token.connect(transferAdmin).setAllowGroupTransfer(0, 0, 1)
    
  })

  it('tokens should be transferable if no locks exist', async () => {
   await token.connect(alice).transfer(bob.address, 2)
  })

  it('one timelock correctly reserves its protected balance', async () => {
    await token.connect(walletsAdmin).addLockUntil(alice.address, futureTimelock, 40)

    expect(await token.getCurrentlyLockedBalance(alice.address))
      .to.equal(40)
    expect(await token.getCurrentlyUnlockedBalance(alice.address))
      .to.equal(20)

    await token.connect(alice).transfer(bob.address, 2)

    await expect(token.connect(alice).transfer(bob.address, 22))
      .to.revertedWith(
        "SENDER TOKENS LOCKED"
      )
  })

  it('timelock counter returns correct number of timelocks', async () => {
    await token.connect(walletsAdmin).addLockUntil(alice.address, futureTimelock, 40)

    expect(await token.getTotalLocksUntil(alice.address))
      .to.equal(1)

    await token.connect(walletsAdmin).addLockUntil(alice.address, futureTimelock, 1)

    expect(await token.getTotalLocksUntil(alice.address))
      .to.equal(1)

    await token.connect(walletsAdmin).addLockUntil(alice.address, futureTimelock + 1, 1)

    expect(await token.getTotalLocksUntil(alice.address))
      .to.equal(2)
  })

  it('timelock getter returns correct timestamps and amounts', async () => {
    await token.connect(walletsAdmin).addLockUntil(alice.address, futureTimelock, 40)

    const res = await token.getLockUntilIndexLookup(alice.address, 0)
    expect(res.lockedUntil)
      .to.equal(futureTimelock)
    expect(res.balanceLocked)
      .to.equal(40)
  })

  it('multiple timelocks reserve separate balances', async () => {
    await token.connect(walletsAdmin).addLockUntil(alice.address, futureTimelock, 30)

    await token.connect(walletsAdmin).addLockUntil(alice.address, futureTimelock + 5, 10)

    expect(await token.getCurrentlyLockedBalance(alice.address))
      .to.equal(40)
    expect(await token.getCurrentlyUnlockedBalance(alice.address))
      .to.equal(20)

    await token.connect(alice).transfer(bob.address, 2)

    await expect(token.connect(alice).transfer(bob.address, 22))
      .to.revertedWith('SENDER TOKENS LOCKED')
  })

  it('timelocks at the same timestamp add up instead of creating new lock entries', async () => {
    expect(await token.getTotalLocksUntil(alice.address))
      .to.equal(0)

    await token.connect(walletsAdmin).addLockUntil(alice.address, futureTimelock, 30)
    expect(await token.getTotalLocksUntil(alice.address))
      .to.equal(1)

    await token.connect(walletsAdmin).addLockUntil(alice.address, futureTimelock, 10)
    expect(await token.getTotalLocksUntil(alice.address))
      .to.equal(1)

    expect(await token.getCurrentlyLockedBalance(alice.address))
      .to.equal(40)
    expect(await token.getCurrentlyUnlockedBalance(alice.address))
      .to.equal(20)

    token.connect(alice).transfer(bob.address, 2)

    await expect(token.connect(alice).transfer(bob.address, 22))
      .to.revertedWith('SENDER TOKENS LOCKED')
  })

  it('timelocks can be removed by timestamp', async () => {
    await token.connect(walletsAdmin).addLockUntil(alice.address, futureTimelock, 10)
    await token.connect(walletsAdmin).addLockUntil(alice.address, futureTimelock + 1, 10)

    token.connect(walletsAdmin).removeLockUntilTimestampLookup(alice.address, futureTimelock)

    expect(await token.getTotalLocksUntil(alice.address))
      .to.equal(1)
  })

  it('timelocks can be removed by index', async () => {
    await token.connect(walletsAdmin).addLockUntil(alice.address, futureTimelock, 10)
    await token.connect(walletsAdmin).addLockUntil(alice.address, futureTimelock + 1, 10)

    await token.connect(walletsAdmin).removeLockUntilIndexLookup(alice.address, 0)

    expect(await token.getTotalLocksUntil(alice.address))
      .to.equal(1)
  })

  it('timelocks cannot be removed by a wrong index', async () => {
    await token.connect(walletsAdmin).addLockUntil(alice.address, futureTimelock, 10)

    await expect(token.connect(walletsAdmin).removeLockUntilIndexLookup(alice.address, 10))
      .to.revertedWith('Timelock index outside range')

    expect(await token.getTotalLocksUntil(alice.address))
      .to.equal(1)
  })

  it('multiple timelocks can be added and removed', async () => {
    await token.connect(walletsAdmin).addLockUntil(alice.address, futureTimelock, 10)
    await token.connect(walletsAdmin).addLockUntil(alice.address, futureTimelock + 1, 10)
    await token.connect(walletsAdmin).addLockUntil(alice.address, futureTimelock + 3, 10)

    await token.connect(walletsAdmin).removeLockUntilTimestampLookup(alice.address, futureTimelock)

    expect(await token.getTotalLocksUntil(alice.address))
      .to.equal(2)

    await token.connect(walletsAdmin).removeLockUntilIndexLookup(alice.address, 0)

    expect(await token.getTotalLocksUntil(alice.address))
      .to.equal(1)

    await token.connect(walletsAdmin).removeLockUntilIndexLookup(alice.address, 0)

    expect(await token.getTotalLocksUntil(alice.address))
      .to.equal(0)
  })
})
