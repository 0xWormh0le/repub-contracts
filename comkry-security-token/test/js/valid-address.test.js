const { expect } = require('chai');

let RestrictedToken
let TransferRules

describe("Validation of addresses", function () {
  let contractAdmin
  let transferAdmin
  let reserveAdmin
  let unpermissioned
  let emptyAddress = ethers.constants.AddressZero
  let futureTimestamp = Date.now() + 3600;

  beforeEach(async function () {
    RestrictedToken = await ethers.getContractFactory('RestrictedToken')
    TransferRules = await ethers.getContractFactory("TransferRules")

    const accounts = await ethers.getSigners()

    contractAdmin = accounts[0]
    transferAdmin = accounts[1]
    reserveAdmin = accounts[2]
    unpermissioned = accounts[3]
  })

  it("cannot setup the contract with valid addresses", async () => {
    const rules = await TransferRules.deploy()
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
  })

  it("cannot set token owner address to 0x0", async () => {
    const rules = await TransferRules.deploy()

    await expect(
      RestrictedToken.connect(unpermissioned).deploy(
        rules.address,
        emptyAddress,
        reserveAdmin.address,
        "xyz",
        "Ex Why Zee",
        6,
        100,
        1e6
      )
    ).to.revertedWith(
      "Token owner address cannot be 0x0"
    )
  })

  it("cannot set token reserve admin address to 0x0", async () => {
    const rules = await TransferRules.deploy()

    await expect(
      RestrictedToken.connect(unpermissioned).deploy(
        rules.address,
        contractAdmin.address,
        emptyAddress,
        "xyz",
        "Ex Why Zee",
        6,
        100,
        1e6,
      )
    ).to.revertedWith(
      "Token reserve admin address cannot be 0x0"
    )
  })

  it("cannot set transfer rules address to 0x0", async () => {
    await expect(
      RestrictedToken.connect(unpermissioned).deploy(
        emptyAddress,
        contractAdmin.address,
        reserveAdmin.address,
        "xyz",
        "Ex Why Zee",
        6,
        100,
        1e6
      )
    ).to.revertedWith(
      "Transfer rules address cannot be 0x0"
    )
  })

  describe("Mutator addresses cannot be 0x0 for", async () => {
    let token
    let expectedError = "Address cannot be 0x0"

    beforeEach(async () => {
      const rules = await TransferRules.deploy()
      token = await RestrictedToken.deploy(
        rules.address,
        contractAdmin.address,
        reserveAdmin.address,
        "xyz",
        "Ex Why Zee",
        6,
        1e6,
        100
      )
    })

    it("grantTransferAdmin", async () => {
      await expect(
        token.connect(unpermissioned).grantTransferAdmin(emptyAddress)
      ).to.revertedWith(expectedError)
    })

    it("revokeTransferAdmin", async () => {
      await expect(
        token.connect(unpermissioned).revokeTransferAdmin(emptyAddress)
      ).to.revertedWith(expectedError)
    })

    it("grantContractAdmin", async () => {
      await expect(
        token.connect(unpermissioned).grantContractAdmin(emptyAddress)
      ).to.revertedWith(expectedError)
    })

    it("revokeContractAdmin", async () => {
      await expect(
        token.connect(unpermissioned).revokeContractAdmin(emptyAddress)
      ).to.revertedWith(expectedError)
    })

    it("setMaxBalance", async () => {
      await expect(
        token.connect(unpermissioned).setMaxBalance(emptyAddress, 100)
      ).to.revertedWith(expectedError)
    })

    it("addLockUntil", async () => {
      await expect(
        token.connect(unpermissioned).addLockUntil(emptyAddress, futureTimestamp, 100)
      ).to.revertedWith(expectedError)
    })

    it("removeLockUntilTimestampLookup", async () => {
      await expect(
        token.connect(unpermissioned).removeLockUntilTimestampLookup(emptyAddress, futureTimestamp)
      ).to.revertedWith(expectedError)
    })

    it("setTransferGroup", async () => {
      await expect(
        token.connect(unpermissioned).setTransferGroup(emptyAddress, 1)
      ).to.revertedWith(expectedError)
    })

    it("freeze", async () => {
      await expect(
        token.connect(unpermissioned).freeze(emptyAddress, true)
      ).to.revertedWith(expectedError)
    })

    it("setAddressPermissions", async () => {
      await expect(
        token.connect(unpermissioned).setAddressPermissions(emptyAddress, 1, 0, 0, 4, true)
      ).to.revertedWith(expectedError)
    })

    it("burn", async () => {
      await expect(
        token.connect(unpermissioned).burn(emptyAddress, 10)
      ).to.revertedWith(expectedError)
    })

    it("mint", async () => {
      await expect(
        token.connect(unpermissioned).mint(emptyAddress, 10)
      ).to.revertedWith(expectedError)
    })

    it("upgradeTransferRules", async () => {
      await token.connect(contractAdmin).grantTransferAdmin(transferAdmin.address)

      await expect(
        token.connect(transferAdmin).upgradeTransferRules(emptyAddress)
      ).to.revertedWith(expectedError)
    })

    it("transfer", async () => {
      await expect(
        token.connect(unpermissioned).transfer(emptyAddress, 10)
      ).to.revertedWith(expectedError)
    })

    it("approve", async () => {
      await expect(
        token.connect(unpermissioned).approve(emptyAddress, 1)
      ).to.revertedWith("ERC20: approve to the zero address")
    })

    it("safeApprove", async () => {
      await expect(
        token.connect(unpermissioned).safeApprove(emptyAddress, 1)
      ).to.revertedWith("ERC20: approve to the zero address")
    })

    it("transferFrom", async () => {
      await expect(
        token.connect(unpermissioned).transferFrom(emptyAddress, unpermissioned.address, 1)
      ).to.revertedWith(expectedError)
    })

    it("transferFrom", async () => {
      await expect(
        token.connect(unpermissioned).transferFrom(unpermissioned.address, emptyAddress, 1)
      ).to.revertedWith(expectedError)
    })
  })
})
