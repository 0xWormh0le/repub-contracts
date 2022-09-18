const {expect} = require('chai');
const {BigNumber} = require("ethers");

describe("Shapshot", function (accounts) {
  let contractAdmin
  let reserveAdmin
  let transferAdmin
  let exchangeOmnibus
  let foreignInvestorS1
  let foreignInvestorS2

  let groupDefault
  let groupReserve
  let groupExchange
  let groupForeignS
  let token
  let dividends
  let erc20Token

  let tokenPrecisionDivider;

  const totalSupply = 0

  beforeEach(async function () {
    const accounts = await ethers.getSigners()
    const TransferRules = await ethers.getContractFactory("TransferRules")
    const RestrictedToken = await ethers.getContractFactory("RestrictedToken")
    const Dividends = await ethers.getContractFactory("Dividends")
    const Erc20 = await ethers.getContractFactory('Erc20Mock')

    contractAdmin = accounts[0]
    transferAdmin = accounts[1]
    walletsAdmin = accounts[2]
    reserveAdmin = accounts[3]
    exchangeOmnibus = accounts[4]
    foreignInvestorS1 = accounts[5]
    foreignInvestorS2 = accounts[6]
    foreignInvestorS3 = accounts[7]
    foreignInvestorS4 = accounts[8]
    foreignInvestorS5 = accounts[9]

    groupDefault = 0
    groupReserve = 1
    groupExchange = 2
    groupForeignS = 3

    erc20Token = await Erc20.deploy('USDCToken', 'USDCT')

    const rules = await TransferRules.deploy()
    token = await RestrictedToken.deploy(
      rules.address,
      contractAdmin.address,
      reserveAdmin.address,
      "xyz",
      "Ex Why Zee",
      6,
      totalSupply,
      1e6
    )

    // configure initial transferAdmin
    await token.connect(contractAdmin).grantTransferAdmin(transferAdmin.address)
    await token.connect(contractAdmin).grantWalletsAdmin(walletsAdmin.address)

    dividends = await Dividends.deploy(
      token.address
    );

    tokenPrecisionDivider = BigNumber.from( 10000 )
  })

  it('create snapshot and check balance of Restricted tokens', async () => {
    await token.connect(reserveAdmin).mint(foreignInvestorS1.address, 1250);
    let balance1 = await token.connect(contractAdmin).balanceOf(foreignInvestorS1.address); // 1250

    expect(balance1.toNumber()).to.equal(1250)

    await token.connect(reserveAdmin).mint(foreignInvestorS2.address, 1000);
    let balance2 = await token.connect(contractAdmin).balanceOf(foreignInvestorS2.address); // 1000

    expect(balance2.toNumber()).to.equal(1000)

    let snapID1 = await token.getCurrentSnapshotId();
    expect(snapID1.toNumber()).to.equal(0)

    await token.connect(contractAdmin).snapshot(); // create new snapshot

    let snapID2 = await token.getCurrentSnapshotId();
    expect(snapID2.toNumber()).to.equal(1);

    await token.connect(reserveAdmin).mint(foreignInvestorS2.address, 1000);
    balance2 = await token.connect(contractAdmin).balanceOf(foreignInvestorS2.address); // 2000

    expect(balance2.toNumber()).to.equal(2000) // 2000

    let oldBalance2 = await token.connect(contractAdmin).balanceOfAt(foreignInvestorS2.address, 1); // 1000

    expect(oldBalance2.toNumber()).to.equal(1000) // 1000
  });

  it('fund ERC20 token & check Funded event', async () => {
    await token.connect(contractAdmin).snapshot(); // create new snapshot

    await erc20Token.connect(foreignInvestorS1).mint(20000);

    let balanceOfUSDCT = await erc20Token.balanceOf(foreignInvestorS1.address);

    expect(balanceOfUSDCT.toNumber()).to.equal(20000);

    // Approve transfer tokens
    await erc20Token.connect(foreignInvestorS1).approve(dividends.address, 2000);

    expect(await dividends.connect(foreignInvestorS1).fundDividend(erc20Token.address, 2000, 1))
      .to.emit(dividends, 'Funded')
      .withArgs(foreignInvestorS1.address, erc20Token.address, 2000, 1)

    balanceOfUSDCT = await erc20Token.balanceOf(foreignInvestorS1.address);

    expect(balanceOfUSDCT.toNumber()).to.equal(18000);
  });

  describe('Claim deposit', async () => {
    beforeEach(async function () {
      await token.connect(reserveAdmin).mint(foreignInvestorS1.address, 1250)

      await token.connect(reserveAdmin).mint(foreignInvestorS2.address, 1000)

      await token.connect(contractAdmin).snapshot()

      await token.connect(reserveAdmin).mint(foreignInvestorS2.address, 1000)

      await erc20Token.connect(foreignInvestorS1).mint(20000)

      await erc20Token.connect(foreignInvestorS1).approve(dividends.address, 2000)

      await dividends.connect(foreignInvestorS1).fundDividend(erc20Token.address, 2000, 1)
    });

    it('grant contract admin', async () => {
      await dividends.connect(contractAdmin).grantContractAdmin(foreignInvestorS1.address);
      expect( await dividends.checkContractAdmin(foreignInvestorS1.address) ).to.equal(true);
    });

    it('revoke contract admin', async () => {
      await dividends.connect(contractAdmin).grantContractAdmin(foreignInvestorS2.address);
      expect( await dividends.checkContractAdmin(foreignInvestorS2.address) ).to.equal(true);

      await dividends.connect(foreignInvestorS2).revokeContractAdmin(contractAdmin.address);
      expect( await dividends.checkContractAdmin(contractAdmin.address) ).to.equal(false);
    });

    it('only Contract Admin withdrawal remains', async () => {

      await expect(
        dividends.connect(foreignInvestorS2).withdrawalRemains(erc20Token.address, 1)
      ).to.revertedWith(
        'DOES NOT HAVE CONTRACT ADMIN ROLE'
      )

      let balanceAtToken = await dividends.tokensAt(erc20Token.address, 1);

      expect(await dividends.connect(contractAdmin).withdrawalRemains(erc20Token.address, 1))
        .to.emit(dividends, 'Withdrawn')
        .withArgs(contractAdmin.address, erc20Token.address, balanceAtToken, 1)

    });

    it('withdrawal remains + Withdrawn event', async () => {

      let totalSupplyAt = await token.totalSupplyAt(1);
      let ballanceAt = await token.balanceOfAt(foreignInvestorS2.address, 1);

      let fundsAtSnapshot = await dividends.fundsAt(erc20Token.address, 1);

      expect( await dividends.tokensAt(erc20Token.address, 1) ).to.equal( fundsAtSnapshot.toNumber() );

      let canClaim = ballanceAt.mul(tokenPrecisionDivider).mul(fundsAtSnapshot).div(totalSupplyAt).div(tokenPrecisionDivider);

      await dividends.connect(foreignInvestorS2).claimDividend(erc20Token.address, 1);

      expect(await erc20Token.balanceOf(foreignInvestorS2.address)).to.equal(canClaim);

      expect( await dividends.tokensAt(erc20Token.address, 1) ).to.equal( fundsAtSnapshot.toNumber() - canClaim.toNumber() );

      expect(await dividends.connect(contractAdmin).withdrawalRemains(erc20Token.address, 1))
        .to.emit(dividends, 'Withdrawn')
        .withArgs(contractAdmin.address, erc20Token.address, fundsAtSnapshot.toNumber() - canClaim.toNumber(), 1)

      expect( await dividends.tokensAt(erc20Token.address, 1) ).to.equal( 0 );

      let contractAdminERC20Ballance = await erc20Token.balanceOf(contractAdmin.address);

      expect( contractAdminERC20Ballance ).to.equal( fundsAtSnapshot.toNumber() - canClaim.toNumber() );
    });

    it('claim once & check amount', async () => {

      let totalSupplyAt = await token.totalSupplyAt(1);

      let ballanceAt = await token.balanceOfAt(foreignInvestorS2.address, 1);

      let tokensOnSnapshot = await dividends.fundsAt(erc20Token.address, 1);

      let canClaim = ballanceAt.mul(tokenPrecisionDivider).mul(tokensOnSnapshot).div(totalSupplyAt).div(tokenPrecisionDivider);

      await dividends.connect(foreignInvestorS2).claimDividend(erc20Token.address, 1);

      expect(await erc20Token.balanceOf(foreignInvestorS2.address)).to.equal(canClaim);
    });

    it('claim twice', async () => {
      await dividends.connect(foreignInvestorS2).claimDividend(erc20Token.address, 1);

      await erc20Token.balanceOf(foreignInvestorS2.address);

      await expect(
        dividends.connect(foreignInvestorS2).claimDividend(erc20Token.address, 1)
      ).to.revertedWith(
        'YOU CAN`T RECEIVE MORE TOKENS'
      )
    });

    it('claim first investor & check Claimed event', async () => {

      let totalSupplyAt = await token.totalSupplyAt(1);

      let ballanceAt = await token.balanceOfAt(foreignInvestorS1.address, 1);

      let tokensOnSnapshot = await dividends.fundsAt(erc20Token.address, 1);

      let canClaim = ballanceAt.mul(tokenPrecisionDivider).mul(tokensOnSnapshot).div(totalSupplyAt).div(tokenPrecisionDivider);

      let balanceBefore = await erc20Token.balanceOf(foreignInvestorS1.address);

      expect(await dividends.connect(foreignInvestorS1).claimDividend(erc20Token.address, 1))
        .to.emit(dividends, 'Claimed')
        .withArgs(foreignInvestorS1.address, erc20Token.address, canClaim, 1)

      let balanceAfter = await erc20Token.balanceOf(foreignInvestorS1.address);

      let balanceDiff = balanceAfter.sub(balanceBefore);

      expect(balanceDiff).to.equal(canClaim);
    });

  });

  describe('Claimed by 2 holders (1000 each) with totalSupply=2000', async () => {
    beforeEach(async function () {
      await token.connect(reserveAdmin).mint(foreignInvestorS1.address, 1000)
      await token.connect(reserveAdmin).mint(foreignInvestorS2.address, 1000)

      await token.connect(contractAdmin).snapshot()

      await erc20Token.connect(foreignInvestorS3).mint(100)
    });

    it('fund 1, claimed=0', async () => {

      await erc20Token.connect(foreignInvestorS3).approve(dividends.address, 1)
      await dividends.connect(foreignInvestorS3).fundDividend(erc20Token.address, 1, 1)

      let tokensOnSnapshot = await dividends.fundsAt(erc20Token.address, 1);

      expect( tokensOnSnapshot.toNumber() ).to.equal( 1 );

      let totalSupplyAt = await token.totalSupplyAt(1);

      let ballance1At = await token.balanceOfAt(foreignInvestorS1.address, 1);
      let ballance2At = await token.balanceOfAt(foreignInvestorS2.address, 1);

      let canClaim1 = ballance1At.mul(tokenPrecisionDivider).mul(tokensOnSnapshot).div(totalSupplyAt).div(tokenPrecisionDivider);

      expect( canClaim1.toNumber() ).to.equal(0);

      await expect(
        dividends.connect(foreignInvestorS1).claimDividend(erc20Token.address, 1)
      ).to.revertedWith(
        'YOU CAN`T RECEIVE MORE TOKENS'
      )

      let canClaim2 = ballance2At.mul(tokenPrecisionDivider).mul(tokensOnSnapshot).div(totalSupplyAt).div(tokenPrecisionDivider);

      expect( canClaim2.toNumber() ).to.equal(0);

      await expect(
        dividends.connect(foreignInvestorS2).claimDividend(erc20Token.address, 1)
      ).to.revertedWith(
        'YOU CAN`T RECEIVE MORE TOKENS'
      )

    });

    it('fund 3, claimed=1', async () => {

      await erc20Token.connect(foreignInvestorS3).approve(dividends.address, 3)
      await dividends.connect(foreignInvestorS3).fundDividend(erc20Token.address, 3, 1)

      let tokensOnSnapshot = await dividends.fundsAt(erc20Token.address, 1);

      expect( tokensOnSnapshot.toNumber() ).to.equal( 3 );

      let totalSupplyAt = await token.totalSupplyAt(1);

      let ballance1At = await token.balanceOfAt(foreignInvestorS1.address, 1);
      let ballance2At = await token.balanceOfAt(foreignInvestorS2.address, 1);

      let canClaim1 = ballance1At.mul(tokenPrecisionDivider).mul(tokensOnSnapshot).div(totalSupplyAt).div(tokenPrecisionDivider);

      let canClaim2 = ballance2At.mul(tokenPrecisionDivider).mul(tokensOnSnapshot).div(totalSupplyAt).div(tokenPrecisionDivider);

      expect( canClaim1.toNumber() ).to.equal(1);

      expect(await dividends.connect(foreignInvestorS1).claimDividend(erc20Token.address, 1))
        .to.emit(dividends, 'Claimed')
        .withArgs(foreignInvestorS1.address, erc20Token.address, canClaim1, 1)

      expect( canClaim2.toNumber() ).to.equal(1);

      expect(await dividends.connect(foreignInvestorS2).claimDividend(erc20Token.address, 1))
        .to.emit(dividends, 'Claimed')
        .withArgs(foreignInvestorS2.address, erc20Token.address, canClaim2, 1)

    });

    it('fund 5, claimed=2', async () => {

      await erc20Token.connect(foreignInvestorS3).approve(dividends.address, 5)
      await dividends.connect(foreignInvestorS3).fundDividend(erc20Token.address, 5, 1)

      let tokensOnSnapshot = await dividends.fundsAt(erc20Token.address, 1);

      expect( tokensOnSnapshot.toNumber() ).to.equal( 5 );

      let totalSupplyAt = await token.totalSupplyAt(1);

      let ballance1At = await token.balanceOfAt(foreignInvestorS1.address, 1);
      let ballance2At = await token.balanceOfAt(foreignInvestorS2.address, 1);

      let canClaim1 = ballance1At.mul(tokenPrecisionDivider).mul(tokensOnSnapshot).div(totalSupplyAt).div(tokenPrecisionDivider);

      let canClaim2 = ballance2At.mul(tokenPrecisionDivider).mul(tokensOnSnapshot).div(totalSupplyAt).div(tokenPrecisionDivider);

      expect( canClaim1.toNumber() ).to.equal(2);

      expect(await dividends.connect(foreignInvestorS1).claimDividend(erc20Token.address, 1))
        .to.emit(dividends, 'Claimed')
        .withArgs(foreignInvestorS1.address, erc20Token.address, canClaim1, 1)


      expect( canClaim2.toNumber() ).to.equal(2);

      expect(await dividends.connect(foreignInvestorS2).claimDividend(erc20Token.address, 1))
        .to.emit(dividends, 'Claimed')
        .withArgs(foreignInvestorS2.address, erc20Token.address, canClaim2, 1)

    });

  });

  describe('Claimed by 5 holders (1000 each) with totalSupply=5000', async () => {
    beforeEach(async function () {
      await token.connect(reserveAdmin).mint(foreignInvestorS1.address, 1000)
      await token.connect(reserveAdmin).mint(foreignInvestorS2.address, 1000)
      await token.connect(reserveAdmin).mint(foreignInvestorS3.address, 1000)
      await token.connect(reserveAdmin).mint(foreignInvestorS4.address, 1000)
      await token.connect(reserveAdmin).mint(foreignInvestorS5.address, 1000)

      await token.connect(contractAdmin).snapshot()

      await erc20Token.connect(transferAdmin).mint(100)
    });

    it('fund 9, claimed=1', async () => {

      await erc20Token.connect(transferAdmin).approve(dividends.address, 9)
      await dividends.connect(transferAdmin).fundDividend(erc20Token.address, 9, 1)

      let tokensOnSnapshot = await dividends.fundsAt(erc20Token.address, 1);

      expect( tokensOnSnapshot.toNumber() ).to.equal( 9 );

      let totalSupplyAt = await token.totalSupplyAt(1);

      let ballance1At = await token.balanceOfAt(foreignInvestorS1.address, 1);
      let ballance2At = await token.balanceOfAt(foreignInvestorS2.address, 1);
      let ballance3At = await token.balanceOfAt(foreignInvestorS3.address, 1);
      let ballance4At = await token.balanceOfAt(foreignInvestorS4.address, 1);
      let ballance5At = await token.balanceOfAt(foreignInvestorS5.address, 1);

      let canClaim1 = ballance1At.mul(tokenPrecisionDivider).mul(tokensOnSnapshot).div(totalSupplyAt).div(tokenPrecisionDivider);
      let canClaim2 = ballance2At.mul(tokenPrecisionDivider).mul(tokensOnSnapshot).div(totalSupplyAt).div(tokenPrecisionDivider);
      let canClaim3 = ballance3At.mul(tokenPrecisionDivider).mul(tokensOnSnapshot).div(totalSupplyAt).div(tokenPrecisionDivider);
      let canClaim4 = ballance4At.mul(tokenPrecisionDivider).mul(tokensOnSnapshot).div(totalSupplyAt).div(tokenPrecisionDivider);
      let canClaim5 = ballance5At.mul(tokenPrecisionDivider).mul(tokensOnSnapshot).div(totalSupplyAt).div(tokenPrecisionDivider);

      expect( canClaim1.toNumber() ).to.equal(1);

      expect(await dividends.connect(foreignInvestorS1).claimDividend(erc20Token.address, 1))
        .to.emit(dividends, 'Claimed')
        .withArgs(foreignInvestorS1.address, erc20Token.address, canClaim1, 1)

      expect( canClaim2.toNumber() ).to.equal(1);

      expect(await dividends.connect(foreignInvestorS2).claimDividend(erc20Token.address, 1))
        .to.emit(dividends, 'Claimed')
        .withArgs(foreignInvestorS2.address, erc20Token.address, canClaim2, 1)

      expect( canClaim3.toNumber() ).to.equal(1);

      expect(await dividends.connect(foreignInvestorS3).claimDividend(erc20Token.address, 1))
        .to.emit(dividends, 'Claimed')
        .withArgs(foreignInvestorS3.address, erc20Token.address, canClaim3, 1)

      expect( canClaim4.toNumber() ).to.equal(1);

      expect(await dividends.connect(foreignInvestorS4).claimDividend(erc20Token.address, 1))
        .to.emit(dividends, 'Claimed')
        .withArgs(foreignInvestorS4.address, erc20Token.address, canClaim4, 1)

      expect( canClaim5.toNumber() ).to.equal(1);

      expect(await dividends.connect(foreignInvestorS5).claimDividend(erc20Token.address, 1))
        .to.emit(dividends, 'Claimed')
        .withArgs(foreignInvestorS5.address, erc20Token.address, canClaim5, 1)

    });

    it('fund 11, claimed=2', async () => {

      await erc20Token.connect(transferAdmin).approve(dividends.address, 11)
      await dividends.connect(transferAdmin).fundDividend(erc20Token.address, 11, 1)

      let tokensOnSnapshot = await dividends.fundsAt(erc20Token.address, 1);

      expect( tokensOnSnapshot.toNumber() ).to.equal( 11 );

      let totalSupplyAt = await token.totalSupplyAt(1);

      let ballance1At = await token.balanceOfAt(foreignInvestorS1.address, 1);
      let ballance2At = await token.balanceOfAt(foreignInvestorS2.address, 1);
      let ballance3At = await token.balanceOfAt(foreignInvestorS3.address, 1);
      let ballance4At = await token.balanceOfAt(foreignInvestorS4.address, 1);
      let ballance5At = await token.balanceOfAt(foreignInvestorS5.address, 1);

      let canClaim1 = ballance1At.mul(tokenPrecisionDivider).mul(tokensOnSnapshot).div(totalSupplyAt).div(tokenPrecisionDivider);
      let canClaim2 = ballance2At.mul(tokenPrecisionDivider).mul(tokensOnSnapshot).div(totalSupplyAt).div(tokenPrecisionDivider);
      let canClaim3 = ballance3At.mul(tokenPrecisionDivider).mul(tokensOnSnapshot).div(totalSupplyAt).div(tokenPrecisionDivider);
      let canClaim4 = ballance4At.mul(tokenPrecisionDivider).mul(tokensOnSnapshot).div(totalSupplyAt).div(tokenPrecisionDivider);
      let canClaim5 = ballance5At.mul(tokenPrecisionDivider).mul(tokensOnSnapshot).div(totalSupplyAt).div(tokenPrecisionDivider);

      expect( canClaim1.toNumber() ).to.equal(2);

      expect(await dividends.connect(foreignInvestorS1).claimDividend(erc20Token.address, 1))
        .to.emit(dividends, 'Claimed')
        .withArgs(foreignInvestorS1.address, erc20Token.address, canClaim1, 1)

      expect( canClaim2.toNumber() ).to.equal(2);

      expect(await dividends.connect(foreignInvestorS2).claimDividend(erc20Token.address, 1))
        .to.emit(dividends, 'Claimed')
        .withArgs(foreignInvestorS2.address, erc20Token.address, canClaim2, 1)

      expect( canClaim3.toNumber() ).to.equal(2);

      expect(await dividends.connect(foreignInvestorS3).claimDividend(erc20Token.address, 1))
        .to.emit(dividends, 'Claimed')
        .withArgs(foreignInvestorS3.address, erc20Token.address, canClaim3, 1)

      expect( canClaim4.toNumber() ).to.equal(2);

      expect(await dividends.connect(foreignInvestorS4).claimDividend(erc20Token.address, 1))
        .to.emit(dividends, 'Claimed')
        .withArgs(foreignInvestorS4.address, erc20Token.address, canClaim4, 1)

      expect( canClaim5.toNumber() ).to.equal(2);

      expect(await dividends.connect(foreignInvestorS5).claimDividend(erc20Token.address, 1))
        .to.emit(dividends, 'Claimed')
        .withArgs(foreignInvestorS5.address, erc20Token.address, canClaim5, 1)

    });

  });

})

