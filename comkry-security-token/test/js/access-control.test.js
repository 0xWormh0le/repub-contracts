const { expect } = require('chai');

describe("Access control tests", function () {
  let contractAdmin
  let transferAdmin
  let walletsAdmin
  let reserveAdmin
  let unprivileged
  let token
  let futureTimestamp = Date.now() + 3600 * 24 * 30;

  beforeEach(async function () {
    const accounts = await ethers.getSigners()
    contractAdmin = accounts[0]
    transferAdmin = accounts[1]
    walletsAdmin = accounts[2]
    reserveAdmin = accounts[3]

    unprivileged = accounts[5]

    const TransferRules = await ethers.getContractFactory("TransferRules")
    const RestrictedToken = await ethers.getContractFactory("RestrictedToken")

    const rules = await TransferRules.deploy()
    token = await RestrictedToken.deploy(
      rules.address, // transfer rules
      contractAdmin.address, // contract admin
      reserveAdmin.address, // token reserve admin
      "xyz", // symbol
      "Ex Why Zee", // name
      6, // decimal
      100, // total supply
      100e6 // max total supply
    )
    
    await rules.deployed()
    await token.deployed()

    await token.connect(contractAdmin).grantTransferAdmin(transferAdmin.address)
    await token.connect(contractAdmin).grantWalletsAdmin(walletsAdmin.address)
  })

  it("an unprivileged user can call the public getter functions", async () => {
    expect(await token.connect(unprivileged).symbol())
      .to.equal("xyz")
    expect(await token.connect(unprivileged).name())
      .to.equal("Ex Why Zee")
    expect(await token.connect(unprivileged).decimals())
      .to.equal(6)
    expect(await token.connect(unprivileged).totalSupply())
      .to.equal(100)
    expect(await token.connect(unprivileged).balanceOf(contractAdmin.address))
      .to.equal(0, "allocates no balance to the contract admin")
    expect(await token.connect(unprivileged).balanceOf(reserveAdmin.address))
      .to.equal(100, "allocates all tokens to the token reserve admin")
  })

  it("an unprivileged user can check transfer restrictions", async () => {
    await token.connect(walletsAdmin).setMaxBalance(reserveAdmin.address, 5)

    expect(
      await token.connect(unprivileged).detectTransferRestriction(
        contractAdmin.address,
        reserveAdmin.address,
        10
      )
    ).to.equal(1)

    expect(
      await token.connect(unprivileged).messageForTransferRestriction(1)
    ).to.equal("GREATER THAN RECIPIENT MAX BALANCE")
  })

  it("only Contract Admin can pause transfers", async () => {
    await token.connect(contractAdmin).pause()

    await expect(token.connect(transferAdmin).pause())
      .to.revertedWith("DOES NOT HAVE CONTRACT ADMIN ROLE")
    await expect(token.connect(walletsAdmin).pause())
      .to.revertedWith("DOES NOT HAVE CONTRACT ADMIN ROLE")
    await expect(token.connect(reserveAdmin).pause())
      .to.revertedWith("DOES NOT HAVE CONTRACT ADMIN ROLE")
    await expect(token.connect(unprivileged).pause())
      .to.revertedWith("DOES NOT HAVE CONTRACT ADMIN ROLE")
  })

  it("only contractAdmin can unpause transfers", async () => {
    await token.connect(contractAdmin).unpause()

    await expect(token.connect(transferAdmin).unpause())
      .to.revertedWith("DOES NOT HAVE CONTRACT ADMIN ROLE")
    await expect(token.connect(walletsAdmin).unpause())
      .to.revertedWith("DOES NOT HAVE CONTRACT ADMIN ROLE")
    await expect(token.connect(reserveAdmin).unpause())
      .to.revertedWith("DOES NOT HAVE CONTRACT ADMIN ROLE")
    await expect(token.connect(unprivileged).unpause())
      .to.revertedWith("DOES NOT HAVE CONTRACT ADMIN ROLE")
  })

  it("only Reserve Admin can mint", async () => {
    await token.connect(reserveAdmin).mint(unprivileged.address, 123)

    expect(await token.balanceOf(unprivileged.address))
      .to.equal(123)

    await expect(token.connect(contractAdmin).mint(unprivileged.address, 1))
      .to.revertedWith('DOES NOT HAVE RESERVE ADMIN ROLE')
    await expect(token.connect(walletsAdmin).mint(unprivileged.address, 1))
      .to.revertedWith('DOES NOT HAVE RESERVE ADMIN ROLE')
    await expect(token.connect(walletsAdmin).mint(unprivileged.address, 1))
      .to.revertedWith('DOES NOT HAVE RESERVE ADMIN ROLE')
    await expect(token.connect(unprivileged).mint(unprivileged.address, 1))
      .to.revertedWith('DOES NOT HAVE RESERVE ADMIN ROLE')
  })

  it("only Reserve Admin can burn", async () => {
    expect(await token.balanceOf(reserveAdmin.address))
      .to.equal(100)

    await token.connect(reserveAdmin).burn(reserveAdmin.address, 1)
    expect(await token.balanceOf(reserveAdmin.address))
      .equal(99)

    await expect(token.connect(contractAdmin).burn(reserveAdmin.address, 1))
      .to.revertedWith("DOES NOT HAVE RESERVE ADMIN ROLE")
    await expect(token.connect(transferAdmin).burn(reserveAdmin.address, 1))
      .to.revertedWith("DOES NOT HAVE RESERVE ADMIN ROLE")
    await expect(token.connect(walletsAdmin).burn(reserveAdmin.address, 1))
      .to.revertedWith("DOES NOT HAVE RESERVE ADMIN ROLE")
    await expect(token.connect(unprivileged).burn(reserveAdmin.address, 1))
      .to.revertedWith("DOES NOT HAVE RESERVE ADMIN ROLE")
  })

  it("only Wallets Admin and Reserve Admin can freeze", async () => {
    await token.connect(walletsAdmin).freeze(reserveAdmin.address, true)
    await token.connect(reserveAdmin).freeze(reserveAdmin.address, true)

    await expect(token.connect(contractAdmin).freeze(reserveAdmin.address, true))
      .to.revertedWith("DOES NOT HAVE WALLETS ADMIN OR RESERVE ADMIN ROLE")
    await expect(token.connect(unprivileged).freeze(reserveAdmin.address, true))
      .to.revertedWith("DOES NOT HAVE WALLETS ADMIN OR RESERVE ADMIN ROLE")
  })

  // GRANTING AND REVOKING ADMIN PRIVILEGES

  it("only contractAdmin can grant contractAdmin privileges", async () => {
    await expect(token.connect(transferAdmin).grantContractAdmin(unprivileged.address))
      .to.revertedWith('DOES NOT HAVE CONTRACT ADMIN ROLE')
    await expect(token.connect(transferAdmin).grantContractAdmin(transferAdmin.address))
      .to.revertedWith('DOES NOT HAVE CONTRACT ADMIN ROLE')
    await expect(token.connect(transferAdmin).grantContractAdmin(reserveAdmin.address))
      .to.revertedWith('DOES NOT HAVE CONTRACT ADMIN ROLE')
    await expect(token.connect(transferAdmin).grantContractAdmin(unprivileged.address))
      .to.revertedWith('DOES NOT HAVE CONTRACT ADMIN ROLE')
    await token.connect(contractAdmin).grantContractAdmin(unprivileged.address)
  })

  it("only contractAdmin can revoke contractAdmin privileges", async () => {
    await expect(token.connect(transferAdmin).revokeContractAdmin(unprivileged.address))
      .to.revertedWith('DOES NOT HAVE CONTRACT ADMIN ROLE')
    await expect(token.connect(reserveAdmin).revokeContractAdmin(unprivileged.address))
      .to.revertedWith('DOES NOT HAVE CONTRACT ADMIN ROLE')
    await expect(token.connect(unprivileged).revokeContractAdmin(unprivileged.address))
      .to.revertedWith('DOES NOT HAVE CONTRACT ADMIN ROLE')

    await token.connect(contractAdmin).grantContractAdmin(unprivileged.address)
    expect(await token.contractAdminCount())
      .to.equal(2, "will need two contract admins so that there is the one required remaining after revokeContractAdmin contractAdmin")
    await token.connect(contractAdmin).revokeContractAdmin(unprivileged.address)
  })

  it("only contractAdmin can grant transferAdmin privileges", async () => {
    await expect(token.connect(transferAdmin).grantTransferAdmin(unprivileged.address))
      .to.revertedWith('DOES NOT HAVE CONTRACT ADMIN ROLE')
    await expect(token.connect(walletsAdmin).grantTransferAdmin(unprivileged.address))
      .to.revertedWith('DOES NOT HAVE CONTRACT ADMIN ROLE')
    await expect(token.connect(reserveAdmin).grantTransferAdmin(unprivileged.address))
      .to.revertedWith('DOES NOT HAVE CONTRACT ADMIN ROLE')
    await expect(token.connect(unprivileged).grantTransferAdmin(unprivileged.address))
      .to.revertedWith('DOES NOT HAVE CONTRACT ADMIN ROLE')

    await token.connect(contractAdmin).grantTransferAdmin(unprivileged.address)
  })

  it("only contractAdmin can revoke transferAdmin privileges", async () => {
    await token.connect(contractAdmin).grantTransferAdmin(unprivileged.address)

    expect(token.connect(transferAdmin).revokeTransferAdmin(unprivileged.address))
      .to.revertedWith('DOES NOT HAVE CONTRACT ADMIN ROLE')
    expect(token.connect(walletsAdmin).revokeTransferAdmin(unprivileged.address))
      .to.revertedWith('DOES NOT HAVE CONTRACT ADMIN ROLE')
    expect(token.connect(reserveAdmin).revokeTransferAdmin(unprivileged.address))
      .to.revertedWith('DOES NOT HAVE CONTRACT ADMIN ROLE')
    expect(token.connect(unprivileged).revokeTransferAdmin(unprivileged.address))
      .to.revertedWith('DOES NOT HAVE CONTRACT ADMIN ROLE')

    await token.connect(contractAdmin).revokeTransferAdmin(unprivileged.address)
  })

  it("only contractAdmin can grant walletsAdmin privileges", async () => {
    expect(token.connect(walletsAdmin).grantWalletsAdmin(unprivileged.address))
      .to.revertedWith('DOES NOT HAVE CONTRACT ADMIN ROLE')
    expect(token.connect(reserveAdmin).grantWalletsAdmin(unprivileged.address))
      .to.revertedWith('DOES NOT HAVE CONTRACT ADMIN ROLE')
    expect(token.connect(unprivileged).grantWalletsAdmin(unprivileged.address))
      .to.revertedWith('DOES NOT HAVE CONTRACT ADMIN ROLE')
    await token.connect(contractAdmin).grantWalletsAdmin(unprivileged.address)
  })

  it("only contractAdmin can revoke walletsAdmin privileges", async () => {
    await token.connect(contractAdmin).grantWalletsAdmin(unprivileged.address)

    await expect(token.connect(walletsAdmin).revokeWalletsAdmin(unprivileged.address))
      .to.revertedWith('DOES NOT HAVE CONTRACT ADMIN ROLE')
    await expect(token.connect(reserveAdmin).revokeWalletsAdmin(unprivileged.address))
      .to.revertedWith('DOES NOT HAVE CONTRACT ADMIN ROLE')
    await expect(token.connect(unprivileged).revokeWalletsAdmin(unprivileged.address))
      .to.revertedWith('DOES NOT HAVE CONTRACT ADMIN ROLE')

    await token.connect(contractAdmin).revokeWalletsAdmin(unprivileged.address)
  })

  it("only contractAdmin can grant reserveAdmin privileges", async () => {
    await expect(token.connect(reserveAdmin).grantReserveAdmin(unprivileged.address))
      .to.revertedWith('DOES NOT HAVE CONTRACT ADMIN ROLE')
    await expect(token.connect(walletsAdmin).grantReserveAdmin(unprivileged.address))
      .to.revertedWith('DOES NOT HAVE CONTRACT ADMIN ROLE')
    await expect(token.connect(unprivileged).grantReserveAdmin(unprivileged.address))
      .to.revertedWith('DOES NOT HAVE CONTRACT ADMIN ROLE')

    await token.connect(contractAdmin).grantReserveAdmin(unprivileged.address)
  })

  it("only contractAdmin can revoke reserveAdmin privileges", async () => {
    await token.connect(contractAdmin).grantReserveAdmin(unprivileged.address)
    await expect(token.connect(reserveAdmin).revokeReserveAdmin(unprivileged.address))
      .to.revertedWith('DOES NOT HAVE CONTRACT ADMIN ROLE')
    await expect(token.connect(walletsAdmin).revokeReserveAdmin(unprivileged.address))
      .to.revertedWith('DOES NOT HAVE CONTRACT ADMIN ROLE')
    await expect(token.connect(unprivileged).revokeReserveAdmin(unprivileged.address))
      .to.revertedWith('DOES NOT HAVE CONTRACT ADMIN ROLE')

    await token.connect(contractAdmin).revokeReserveAdmin(unprivileged.address)
  })

  // TRANSFER ADMIN FUNCTIONS 
  
  it("only Transfer Admin can change and upgrade the transfer rules with upgradeTransferRules", async () => {
    const TransferRules = await ethers.getContractFactory("TransferRules")
    const nextTransferRules = await TransferRules.deploy()
    await token.connect(transferAdmin).upgradeTransferRules(nextTransferRules.address)

    await expect(token.connect(contractAdmin).upgradeTransferRules(nextTransferRules.address))
      .to.revertedWith("DOES NOT HAVE TRANSFER ADMIN ROLE")
      await expect(token.connect(walletsAdmin).upgradeTransferRules(nextTransferRules.address))
      .to.revertedWith("DOES NOT HAVE TRANSFER ADMIN ROLE")
    await expect(token.connect(reserveAdmin).upgradeTransferRules(nextTransferRules.address))
      .to.revertedWith("DOES NOT HAVE TRANSFER ADMIN ROLE")
    await expect(token.connect(unprivileged).upgradeTransferRules(nextTransferRules.address))
      .to.revertedWith("DOES NOT HAVE TRANSFER ADMIN ROLE")
  })

  it("only transferAdmin can setAllowGroupTransfer", async () => {
    await expect(token.connect(contractAdmin).setAllowGroupTransfer(0, 1, 17))
      .to.revertedWith('DOES NOT HAVE TRANSFER ADMIN ROLE')
    await expect(token.connect(walletsAdmin).setAllowGroupTransfer(0, 1, 17))
      .to.revertedWith('DOES NOT HAVE TRANSFER ADMIN ROLE')
    await expect(token.connect(reserveAdmin).setAllowGroupTransfer(0, 1, 17))
      .to.revertedWith('DOES NOT HAVE TRANSFER ADMIN ROLE')
    await expect(token.connect(unprivileged).setAllowGroupTransfer(0, 1, 17))
      .to.revertedWith('DOES NOT HAVE TRANSFER ADMIN ROLE')
  })

  // WALLETS ADMIN FUNCTIONS 
  
  it("only Wallets Admin can setMaxBalance", async () => {
    await expect(token.connect(contractAdmin).setMaxBalance(unprivileged.address, 100))
      .revertedWith('DOES NOT HAVE WALLETS ADMIN ROLE')
    await expect(token.connect(transferAdmin).setMaxBalance(unprivileged.address, 100))
      .revertedWith('DOES NOT HAVE WALLETS ADMIN ROLE')
    await expect(token.connect(reserveAdmin).setMaxBalance(unprivileged.address, 100))
      .revertedWith('DOES NOT HAVE WALLETS ADMIN ROLE')
    await expect(token.connect(unprivileged).setMaxBalance(unprivileged.address, 100))
      .revertedWith('DOES NOT HAVE WALLETS ADMIN ROLE')

    await token.connect(walletsAdmin).setMaxBalance(unprivileged.address, 100)
  })

  it("only Wallets Admin can addLockUntil", async () => {
    await expect(
      token.connect(contractAdmin).addLockUntil(unprivileged.address, futureTimestamp, 5)
    ).revertedWith('DOES NOT HAVE WALLETS ADMIN ROLE')
    await expect(
      token.connect(transferAdmin).addLockUntil(unprivileged.address, futureTimestamp, 5)
    ).revertedWith('DOES NOT HAVE WALLETS ADMIN ROLE')
    await expect(
      token.connect(reserveAdmin).addLockUntil(unprivileged.address, futureTimestamp, 5)
    ).revertedWith('DOES NOT HAVE WALLETS ADMIN ROLE')
    await expect(
      token.connect(unprivileged).addLockUntil(unprivileged.address, futureTimestamp, 5)
    ).revertedWith('DOES NOT HAVE WALLETS ADMIN ROLE')
    await token.connect(walletsAdmin).addLockUntil(unprivileged.address, futureTimestamp, 5)
  })

  it("only Wallets Admin can removeLockUntilTimestampLookup", async () => {
    await expect(
      token.connect(contractAdmin).removeLockUntilTimestampLookup(unprivileged.address, futureTimestamp)
    ).revertedWith('DOES NOT HAVE WALLETS ADMIN ROLE')
    await expect(
      token.connect(transferAdmin).removeLockUntilTimestampLookup(unprivileged.address, futureTimestamp)
    ).revertedWith('DOES NOT HAVE WALLETS ADMIN ROLE')
    await expect(
      token.connect(reserveAdmin).removeLockUntilTimestampLookup(unprivileged.address, futureTimestamp)
    ).revertedWith('DOES NOT HAVE WALLETS ADMIN ROLE')
    await expect(
      token.connect(unprivileged).removeLockUntilTimestampLookup(unprivileged.address, futureTimestamp)
    ).revertedWith('DOES NOT HAVE WALLETS ADMIN ROLE')

    await token.connect(walletsAdmin).addLockUntil(unprivileged.address, futureTimestamp, 5)
    await token.connect(walletsAdmin).removeLockUntilTimestampLookup(unprivileged.address, futureTimestamp)
  })

  it("only Wallets Admin can removeLockUntilIndexLookup", async () => {
    await expect(
      token.connect(contractAdmin).removeLockUntilIndexLookup(unprivileged.address, 0)
    ).revertedWith('DOES NOT HAVE WALLETS ADMIN ROLE')
    await expect(
      token.connect(transferAdmin).removeLockUntilIndexLookup(unprivileged.address, 0)
    ).revertedWith('DOES NOT HAVE WALLETS ADMIN ROLE')
    await expect(
      token.connect(reserveAdmin).removeLockUntilIndexLookup(unprivileged.address, 0)
    ).revertedWith('DOES NOT HAVE WALLETS ADMIN ROLE')
    await expect(
      token.connect(unprivileged).removeLockUntilIndexLookup(unprivileged.address, 0)
    ).revertedWith('DOES NOT HAVE WALLETS ADMIN ROLE')

    await token.connect(walletsAdmin).addLockUntil(unprivileged.address, futureTimestamp, 5)
    await token.connect(walletsAdmin).removeLockUntilIndexLookup(unprivileged.address, 0)
  })

  it("only Wallets Admin can setTransferGroup", async () => {
    await expect(
      token.connect(contractAdmin).setTransferGroup(unprivileged.address, 1)
    ).revertedWith('DOES NOT HAVE WALLETS ADMIN ROLE')
    await expect(
      token.connect(transferAdmin).setTransferGroup(unprivileged.address, 1)
    ).revertedWith('DOES NOT HAVE WALLETS ADMIN ROLE')
    await expect(
      token.connect(reserveAdmin).setTransferGroup(unprivileged.address, 1)
    ).revertedWith('DOES NOT HAVE WALLETS ADMIN ROLE')
    await expect(
      token.connect(unprivileged).setTransferGroup(unprivileged.address, 1)
    ).revertedWith('DOES NOT HAVE WALLETS ADMIN ROLE')
    await token.connect(walletsAdmin).setTransferGroup(unprivileged.address, 1)
  })

  it("only Wallets Admin can setAddressPermissions", async () => {
    await expect(
      token.connect(contractAdmin).setAddressPermissions(unprivileged.address, 1, futureTimestamp, 5, 100, false)
    ).revertedWith('DOES NOT HAVE WALLETS ADMIN ROLE')
    await expect(
      token.connect(transferAdmin).setAddressPermissions(unprivileged.address, 1, futureTimestamp, 5, 100, false)
    ).revertedWith('DOES NOT HAVE WALLETS ADMIN ROLE')
    await expect(
      token.connect(reserveAdmin).setAddressPermissions(unprivileged.address, 1, futureTimestamp, 5, 100, false)
    ).revertedWith('DOES NOT HAVE WALLETS ADMIN ROLE')
    await expect(
      token.connect(unprivileged).setAddressPermissions(unprivileged.address, 1, futureTimestamp, 5, 100, false)
    ).revertedWith('DOES NOT HAVE WALLETS ADMIN ROLE')
    await token.connect(walletsAdmin).setAddressPermissions(unprivileged.address, 1, futureTimestamp, 5, 100, false)
  })

  it("must have at least one contractAdmin", async () => {
    // await token.grantContractAdmin(unprivileged, {from: contractAdmin})
    expect(await token.contractAdminCount())
      .to.equal(1)
    await expect(token.connect(contractAdmin).revokeContractAdmin(contractAdmin.address))
      .to.revertedWith('Must have at least one contract admin')
    expect(await token.contractAdminCount())
      .to.equal(1)
  })

  it("keeps a count of the number of contract admins", async () => {
    expect(await token.contractAdminCount())
      .to.equal(1)

    await token.connect(contractAdmin).grantContractAdmin(unprivileged.address)
    expect(await token.contractAdminCount()).to.equal(2)
    await token.connect(contractAdmin).revokeContractAdmin(unprivileged.address)
    expect(await token.contractAdminCount()).to.equal(1)
  })
})
