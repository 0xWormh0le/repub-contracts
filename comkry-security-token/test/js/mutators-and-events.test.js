const { expect } = require('chai');
const { eventArgs }= require('./helper');

describe("Mutator calls and events", function () {
  let contractAdmin
  let reserveAdmin
  let transferAdmin
  let recipient
  let unprivileged
  let defaultGroup
  let token
  let startingRules
  let emptyAddress = ethers.constants.AddressZero
  let futureTimestamp = Date.now() + 3600 * 24 * 30;

  beforeEach(async function () {
    const accounts = await ethers.getSigners()
    const TransferRules = await ethers.getContractFactory("TransferRules")
    const RestrictedToken = await ethers.getContractFactory("RestrictedToken")

    contractAdmin = accounts[0]
    transferAdmin = accounts[1]
    walletsAdmin = accounts[2]
    reserveAdmin = accounts[3]
    recipient = accounts[4]
    unprivileged = accounts[5]
    defaultGroup = 0

    startingRules = await TransferRules.deploy()
    token = await RestrictedToken.deploy(
      startingRules.address,
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

    await token.connect(transferAdmin).setAllowGroupTransfer(0, 0, 1)

    await token.connect(walletsAdmin).setAddressPermissions(reserveAdmin.address, defaultGroup, 0, 0, 1000, false)

    await token.connect(walletsAdmin).setAddressPermissions(recipient.address, defaultGroup, 0, 0, 1000, false)

  })

  it('events', async () => {
    expect(await token.balanceOf(contractAdmin.address))
      .to.equal(0, 'allocates no balance to the contractAdmin')
  })

  it("transfer with Transfer event", async () => {
    await expect(token.connect(reserveAdmin).transfer(recipient.address, 10))
      .to.emit(token, 'Transfer')
      .withArgs(reserveAdmin.address, recipient.address, 10)
    expect(await token.balanceOf(recipient.address))
      .to.equal(10)
  })

  it("transfer with Transfer event", async () => {
    await expect(token.connect(reserveAdmin).transfer(recipient.address, 10))
      .to.emit(token, 'Transfer')
      .withArgs(reserveAdmin.address, recipient.address, 10)
    expect(await token.balanceOf(recipient.address))
      .to.equal(10)
  })

  it("grantTransferAdmin with RoleChange event", async () => {
    await expect(token.connect(contractAdmin).grantTransferAdmin(recipient.address))
      .to.emit(token, 'RoleChange')
      .withArgs(contractAdmin.address, recipient.address, 'TransferAdmin', true)
  })

  it("revokeTransferAdmin with RoleChange event", async () => {
    await token.connect(contractAdmin).grantTransferAdmin(recipient.address)
    await expect(token.connect(contractAdmin).revokeTransferAdmin(recipient.address))
      .to.emit(token, 'RoleChange')
      .withArgs(contractAdmin.address, recipient.address, 'TransferAdmin', false)
  })

  it("grantContractAdmin with RoleChange event", async () => {
    await expect(token.connect(contractAdmin).grantContractAdmin(recipient.address))
      .to.emit(token, 'RoleChange')
      .withArgs(contractAdmin.address, recipient.address, 'ContractAdmin', true)
  })

  it("revokeContractAdmin with RoleChange event", async () => {
    await token.connect(contractAdmin).grantContractAdmin(recipient.address)
    await expect(token.connect(contractAdmin).revokeContractAdmin(recipient.address))
      .to.emit(token, 'RoleChange')
      .withArgs(contractAdmin.address, recipient.address, 'ContractAdmin', false)
  })


  it("setMaxBalance with events", async () => {
    await expect(token.connect(walletsAdmin).setMaxBalance(recipient.address, 100))
      .to.emit(token, 'AddressMaxBalance')
      .withArgs(walletsAdmin.address, recipient.address, 100)
    expect(await token.getMaxBalance(recipient.address))
      .to.equal(100)
  })

  it("addLockUntil with events", async () => {
    await expect(token.connect(walletsAdmin).addLockUntil(recipient.address, futureTimestamp, 97))
      .to.emit(token, 'AddressTimeLockAdded')
      .withArgs(walletsAdmin.address, recipient.address, futureTimestamp, 97)
    expect(await token.getLockUntilAtTimestamp(recipient.address, futureTimestamp - 1))
      .to.equal(97)
      
    const args = await eventArgs(
      token.connect(walletsAdmin).removeLockUntilIndexLookup(recipient.address, 0),
      'AddressTimeLockRemoved'
    )
    expect(args[0]).to.equal(walletsAdmin.address)
    expect(args[1]).to.equal(recipient.address)
    expect(args[3]).to.equal(97)

    expect(await token.getCurrentlyLockedBalance(recipient.address))
      .to.equal(0)
  })

  it("setTransferGroup with events", async () => {
    await expect(token.connect(walletsAdmin).setTransferGroup(recipient.address, 9))
      .to.emit(token, 'AddressTransferGroup')
      .withArgs(walletsAdmin.address, recipient.address, 9)
    expect(await token.getTransferGroup(recipient.address))
      .to.equal(9)
  })

  it("setAddressPermissions with events from all inner function calls", async () => {
    const tx = await token.connect(walletsAdmin).setAddressPermissions(unprivileged.address, 9, 0, 0, 1000, true)
    const res = await tx.wait()

    const evt1 = res.events.filter(e => e.event === 'AddressTransferGroup')
    expect(evt1[0].args[0])
      .to.equal(walletsAdmin.address)
    expect(evt1[0].args[1])
      .to.equal(unprivileged.address)
    expect(evt1[0].args[2])
      .to.equal(9)

    const evt2 = res.events.filter(e => e.event === 'AddressMaxBalance')
    expect(evt2[0].args[0])
      .to.equal(walletsAdmin.address)
    expect(evt2[0].args[1])
      .to.equal(unprivileged.address)
    expect(evt2[0].args[2])
      .to.equal(1000)

    const evt3 = res.events.filter(e => e.event === 'AddressFrozen')
    expect(evt3[0].args[0])
      .to.equal(walletsAdmin.address)
    expect(evt3[0].args[1])
      .to.equal(unprivileged.address)
    expect(evt3[0].args[2])
      .to.equal(true)
    
    expect(await token.getTransferGroup(unprivileged.address))
      .to.equal(9)
    expect(await token.getCurrentlyLockedBalance(recipient.address))
      .to.equal(0)
    expect(await token.getMaxBalance(unprivileged.address))
      .to.equal(1000)
    expect(await token.getFrozenStatus(unprivileged.address))
      .to.equal(true)  
  })

  it("freeze with events", async () => {
    await expect(token.connect(walletsAdmin).freeze(recipient.address, true))
      .to.emit(token, 'AddressFrozen')
      .withArgs(walletsAdmin.address, recipient.address, true)

    expect(await token.getFrozenStatus(recipient.address))
      .to.equal(true)

    await expect(token.connect(walletsAdmin).freeze(recipient.address, false))
      .to.emit(token, 'AddressFrozen')
      .withArgs(walletsAdmin.address, recipient.address, false)

    expect(await token.getFrozenStatus(recipient.address))
      .to.equal(false)
  })

  it("setAllowGroupTransfer with event and retreive wiith getAllowGroupTransferTime", async () => {
    await expect(token.connect(transferAdmin).setAllowGroupTransfer(0, 1, 203))
      .to.emit(token, 'AllowGroupTransfer')
      .withArgs(transferAdmin.address, 0, 1, 203)
    expect(await token.getAllowGroupTransferTime(0, 1))
      .to.equal(203)
  })

  it("burn with events", async () => {
    await expect(token.connect(reserveAdmin).burn(reserveAdmin.address, 17))
      .to.emit(token, 'Transfer')
      .withArgs(reserveAdmin.address, emptyAddress, 17)

    expect(await token.balanceOf(reserveAdmin.address))
      .to.equal(83)
    expect(await token.totalSupply())
      .to.equal(83)
  })

  it("mint with events", async () => {
    await expect(token.connect(reserveAdmin).mint(recipient.address, 17))
      .to.emit(token, 'Transfer')
      .withArgs(emptyAddress, recipient.address, 17)
    expect(await token.balanceOf(recipient.address))
      .to.equal(17)
  })

  it("pause/unpause with events", async () => {
    expect(await token.isPaused())
      .to.equal(false)

    await expect(token.connect(contractAdmin).pause())
      .to.emit(token, 'Pause')
      .withArgs(contractAdmin.address, true)

    expect(await token.isPaused())
      .to.equal(true)

    await expect(token.connect(contractAdmin).unpause())
      .to.emit(token, 'Pause')
      .withArgs(contractAdmin.address, false)

    expect(await token.isPaused())
      .to.equal(false)
  })

  it("upgrade transfer rules with events", async () => {
    const TransferRules = await ethers.getContractFactory("TransferRules")
    const newRules = await TransferRules.deploy()

    await expect(token.connect(transferAdmin).upgradeTransferRules(newRules.address))
      .to.emit(token, 'Upgrade')
      .withArgs(transferAdmin.address, startingRules.address, newRules.address)

    expect(await token.transferRules())
      .to.equal(newRules.address)
  })

  it("can check if an address has TransferAdmin permissions", async () => {
    expect(await token.checkTransferAdmin(transferAdmin.address))
      .to.equal(true)
    expect(await token.checkTransferAdmin(unprivileged.address))
      .to.equal(false)
  })

  it("can check if an address has ContractAdmin permissions", async () => {
    expect(await token.checkContractAdmin(contractAdmin.address))
      .to.equal(true)
    expect(await token.checkContractAdmin(unprivileged.address))
      .to.equal(false)
  })
})
