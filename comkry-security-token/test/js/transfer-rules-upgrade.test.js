const { expect } = require('chai')

describe('Transfer rules upgrade', () => {
  let token
  let owner
  let nextRules
  let receiver
  
  beforeEach(async () => {
    const RestrictedToken = await ethers.getContractFactory('RestrictedToken')
    const TransferRules = await ethers.getContractFactory("TransferRules")
    const TransferRulesUpgrade = await ethers.getContractFactory("TransferRulesUpgrade")
    const accounts = await ethers.getSigners()

    let decimalsWeWillPassToTransferRules = 6

    owner = accounts[2]
    receiver = accounts[3]

    rules = await TransferRules.deploy()
    token = await RestrictedToken.deploy(
      rules.address,
      owner.address,
      owner.address,
      "xyz",
      "Ex Why Zee",
      decimalsWeWillPassToTransferRules,
      100,
      1e6
    )
    nextRules = await TransferRulesUpgrade.deploy()

    token = token.connect(owner)

    await token.grantTransferAdmin(owner.address)
    await token.setAllowGroupTransfer(0, 0, 1) // don't restrict default group transfers
  })
  
  it('Replace transfer rules', async () => {
    let code = await token.detectTransferRestriction(owner.address, receiver.address, 1)
    expect(code)
      .to.equal(0, "initial TransferRules should return code 0")

    // upgrade the TransferRules
    await token.upgradeTransferRules(nextRules.address)

    code = await token.detectTransferRestriction(owner.address, owner.address, 1)
    expect(code)
      .to.equal(6, "custom code should be returned after setting new TransferRules")

    expect(await token.messageForTransferRestriction(6))
      .to.equal("HELLO UPGRADE", "should return the new transfer restriction messages")
  })
})
