const { expect } = require('chai')
const { currentTimestamp } = require('./helper')

describe('Tarnsfer restrictions', () => {
  let tokenContractOwner, alice, bob
  let groupA = 1, groupB = 2
  let transferTimeIsNow
  let maxTokens = 1000
  let lockedTokens = 100

  beforeEach(async () => {
    const RestrictedToken = await ethers.getContractFactory('RestrictedToken')
    const TransferRules = await ethers.getContractFactory("TransferRules")
    const accounts = await ethers.getSigners()

    tokenContractOwner = accounts[2]
    rules = await TransferRules.deploy()
    token = await RestrictedToken.deploy(
      rules.address,
      tokenContractOwner.address,
      tokenContractOwner.address,
      "xyz",
      "Ex Why Zee",
      0,
      100,
      1e6
    )
    token = token.connect(tokenContractOwner)
    await token.grantTransferAdmin(tokenContractOwner.address)
    await token.grantWalletsAdmin(tokenContractOwner.address)
    
    alice = accounts[3]
    bob = accounts[4]

    await token.setAddressPermissions(alice.address, groupA, 0, lockedTokens, maxTokens, false)
    await token.setAddressPermissions(bob.address, groupB, 0, lockedTokens, maxTokens, false)
    transferTimeIsNow = await currentTimestamp()
  })

  it('Transfer restrictions between users not on whitelist', async () => {
    let restrictionCode = await token.detectTransferRestriction(alice.address, bob.address, 17)
    expect(restrictionCode)
      .to.equal(7, "no transfers should work before transfer groups are approved")

    await token.setAllowGroupTransfer(groupA, groupB, transferTimeIsNow);
    restrictionCode = await token.detectTransferRestriction(alice.address, bob.address, maxTokens + 1);
    expect(restrictionCode)
      .to.equal(1, "should fail if max balance would be exceeded in transfer")

    await token.setAllowGroupTransfer(groupA, groupB, transferTimeIsNow + 3600 * 24)
    restrictionCode = await token.detectTransferRestriction(alice.address, bob.address, 17)
    expect(restrictionCode)
      .to.equal(8, "approved transfers should not work before the specified time")

    await token.setAllowGroupTransfer(groupA, groupB, transferTimeIsNow)
    restrictionCode = await token.detectTransferRestriction(alice.address, bob.address, 17)
    expect(restrictionCode)
      .to.equal(0, "approved transfers should work after the specified time")

    token.setAllowGroupTransfer(groupA, groupB, transferTimeIsNow)
    restrictionCode = await token.detectTransferRestriction(bob.address, alice.address, 17) // reversed transfer direction!
    expect(restrictionCode)
      .to.equal(7, "approved transfers should not work when transfer between groups is not approved")

    restrictionCode = await token.detectTransferRestriction(tokenContractOwner.address, token.address, 17)
    expect(restrictionCode)
      .to.equal(3, "should not be able to send tokens to the contract itself")

    restrictionCode = await token.detectTransferRestriction(tokenContractOwner.address, ethers.constants.AddressZero, 17)
    expect(restrictionCode)
      .to.equal(4, "should not be able to send tokens to the empty contract")
  })
})
