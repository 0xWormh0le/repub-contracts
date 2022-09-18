const { expect } = require('chai');

describe('Getters and setters', () => {
  let rules, token
  let owner, alice

  beforeEach(async () => {
    const RestrictedToken = await ethers.getContractFactory('RestrictedToken')
    const TransferRules = await ethers.getContractFactory("TransferRules")

    const accounts = await ethers.getSigners()
    owner = accounts[2]
    rules = await TransferRules.deploy()
    token = await RestrictedToken.deploy(
      rules.address,
      owner.address,
      owner.address,
      "xyz",
      "Ex Why Zee",
      0,
      100,
      1e6
    )
    token = token.connect(owner)
    alice = accounts[3]
  })

  it('Cannot mint more than max uint value', async () => {
    const maxUint256 = await token.MAX_UINT256()
    await expect(token.mint(alice.address, maxUint256))
      .to.revertedWith('')
  })
})
