const {expect} = require('chai');
const {BigNumber} = require('ethers')

describe('RestrictedSwap', function () {
  beforeEach(async () => {
    const accounts = await ethers.getSigners()
    const RestrictedSwap = await ethers.getContractFactory('RestrictedSwap')
    const Erc20 = await ethers.getContractFactory('Erc20Mock')
    const TransferRules = await ethers.getContractFactory("TransferRules")

    this.accounts = accounts
    this.owner = accounts[0]
    this.swapAdmins = accounts.slice(1, 2)
    this.contractAdmin = accounts[3]
    this.reserveAdmin = accounts[4]

    this.rules = await TransferRules.deploy()
    this.quoteToken = await Erc20.deploy('20', '20')
    this.restrictedSwap = await RestrictedSwap.deploy(
      this.rules.address,
      this.contractAdmin.address,
      this.reserveAdmin.address,
      'xyz',
      'ex why xyz',
      6,
      0,
      10000
    )

    this.restrictedTokenSender = accounts[5]
    this.restrictedTokenAmount = BigNumber.from(10)
    this.quoteTokenSender = accounts[6]
    this.quoteTokenAmount = BigNumber.from(15)

    await Promise.all([
      this.restrictedSwap.connect(this.reserveAdmin).mint(this.restrictedTokenSender.address, 9999),
      this.quoteToken.connect(this.quoteTokenSender).mint(9999),
      this.quoteToken.connect(this.quoteTokenSender).approve(
        this.restrictedSwap.address,
        9999,
      ),
    ])

    const transferLockedUntil = BigNumber.from(Math.floor(Date.now() / 1000))
    await this.restrictedSwap.connect(this.contractAdmin).grantTransferAdmin(accounts[3].address)
    await this.restrictedSwap.connect(accounts[3]).setAllowGroupTransfer(0, 0, transferLockedUntil)
  })

  describe('New configuration', async () => {
    it('configure sell succeed', async () => {
      const funderBalance = await this.restrictedSwap.balanceOf(this.restrictedTokenSender.address)
      const swapBalance = await this.restrictedSwap.balanceOf(this.restrictedSwap.address)
      const swapNumber = await this.restrictedSwap.swapNumber()

      // check event
      await expect(this.restrictedSwap.connect(this.restrictedTokenSender).configureSell(
        this.restrictedTokenAmount,
        this.quoteToken.address,
        this.quoteTokenSender.address,
        this.quoteTokenAmount
      )).to.emit(this.restrictedSwap, 'SwapConfigured')
        .withArgs(
          swapNumber.add(1),
          this.restrictedTokenSender.address,
          this.restrictedTokenAmount,
          this.quoteToken.address,
          this.quoteTokenSender.address,
          this.quoteTokenAmount
        )

      // check funds moved to swap
      expect((await this.restrictedSwap.balanceOf(this.restrictedTokenSender.address)).toNumber())
        .to.equal(funderBalance.sub(this.restrictedTokenAmount).toNumber())
      expect((await this.restrictedSwap.balanceOf(this.restrictedSwap.address)).toNumber())
        .to.equal(swapBalance.add(this.restrictedTokenAmount).toNumber())
    })

    it('configure buy succeed', async () => {
      const funderBalance = await this.quoteToken.balanceOf(this.quoteTokenSender.address)
      const swapBalance = await this.quoteToken.balanceOf(this.restrictedSwap.address)
      const swapNumber = await this.restrictedSwap.swapNumber()

      // check event
      await expect(this.restrictedSwap.connect(this.quoteTokenSender).configureBuy(
        this.restrictedTokenAmount,
        this.restrictedTokenSender.address,
        this.quoteToken.address,
        this.quoteTokenAmount
      )).to.emit(this.restrictedSwap, 'SwapConfigured')
        .withArgs(
          swapNumber.add(1),
          this.restrictedTokenSender.address,
          this.restrictedTokenAmount,
          this.quoteToken.address,
          this.quoteTokenSender.address,
          this.quoteTokenAmount
        )

      // check funds moved to swap
      expect((await this.quoteToken.balanceOf(this.quoteTokenSender.address)).toNumber())
        .to.equal(funderBalance.sub(this.quoteTokenAmount).toNumber())
      expect((await this.quoteToken.balanceOf(this.restrictedSwap.address)).toNumber())
        .to.equal(swapBalance.add(this.quoteTokenAmount).toNumber())
    })
  })

  describe('Configuring swap fails when', async () => {
    it('restricted token is not approved to swap', async () => {
      await this.restrictedSwap.connect(this.reserveAdmin).freeze(this.restrictedTokenSender.address, true)
      await expect(
        this.restrictedSwap.connect(this.restrictedTokenSender).configureSell(
          this.restrictedTokenAmount,
          this.quoteToken.address,
          this.quoteTokenSender.address,
          this.quoteTokenAmount,
        )
      ).to.revertedWith(
        'SENDER ADDRESS IS FROZEN'
      )
    })

    it('quoteToken is ERC1404 and it is not approved to swap', async () => {
      const Erc1404 = await ethers.getContractFactory('Erc1404Mock')
      const quoteToken = await Erc1404.deploy(
        this.rules.address,
        this.contractAdmin.address,
        this.reserveAdmin.address,
        'xyz',
        'ex why xyz',
        6,
        0,
        10000
      )
      await quoteToken.connect(this.reserveAdmin).freeze(this.restrictedTokenSender.address, true)
      await expect(
        this.restrictedSwap.connect(this.restrictedTokenSender).configureSell(
          this.restrictedTokenAmount,
          quoteToken.address,
          this.quoteTokenSender.address,
          this.quoteTokenAmount,
        )
      ).to.revertedWith(
        'RECIPIENT ADDRESS IS FROZEN'
      )
    })
  })

  describe('Complete swap with payment token', async () => {
    beforeEach(async () => {
      await this.restrictedSwap.connect(this.restrictedTokenSender).configureSell(
        this.restrictedTokenAmount,
        this.quoteToken.address,
        this.quoteTokenSender.address,
        this.quoteTokenAmount,
      )
    })

    it('fails when already completed', async () => {
      await this.restrictedSwap.connect(this.quoteTokenSender).completeSwapWithPaymentToken(BigNumber.from(1))
      await expect(
        this.restrictedSwap.connect(this.quoteTokenSender).completeSwapWithPaymentToken(BigNumber.from(1))
      ).to.revertedWith(
        'Already completed'
      )
    })

    it('fails in case of incorrect quoteToken funder', async () => {
      await expect(
        this.restrictedSwap.connect(this.accounts[0]).completeSwapWithPaymentToken(BigNumber.from(1))
      ).to.revertedWith(
        'You are not appropriate token sender for this swap'
      )
    })

    it('succeeds', async () => {
      const balances = {
        restrictedTokenSender: {
          quoteToken: await this.quoteToken.balanceOf(this.restrictedTokenSender.address)
        },
        quoteTokenSender: {
          restrictedToken: await this.restrictedSwap.balanceOf(this.quoteTokenSender.address),
          quoteToken: await this.quoteToken.balanceOf(this.quoteTokenSender.address)
        },
        swap: {
          restrictedToken: await this.restrictedSwap.balanceOf(this.restrictedSwap.address)
        }
      }

      await expect(
        this.restrictedSwap.connect(this.quoteTokenSender).completeSwapWithPaymentToken(BigNumber.from(1))
      ).to.emit(this.restrictedSwap, 'SwapComplete')
        .withArgs(
          BigNumber.from(1),
          this.restrictedTokenSender.address,
          this.restrictedTokenAmount,
          this.quoteTokenSender.address,
          this.quoteToken.address,
          this.quoteTokenAmount
        )

      // check balances after swap completion

      expect(
        await this.quoteToken.balanceOf(this.restrictedTokenSender.address)
      ).to.equal(
        balances.restrictedTokenSender.quoteToken.add(this.quoteTokenAmount)
      )

      expect(
        await this.restrictedSwap.balanceOf(this.quoteTokenSender.address),
      ).to.equal(
        balances.quoteTokenSender.restrictedToken.add(this.restrictedTokenAmount)
      )

      expect(
        await this.quoteToken.balanceOf(this.quoteTokenSender.address)
      ).to.equal(
        balances.quoteTokenSender.quoteToken.sub(this.quoteTokenAmount)
      )

      expect(
        await this.restrictedSwap.balanceOf(this.restrictedSwap.address)
      ).to.equal(
        balances.swap.restrictedToken.sub(this.restrictedTokenAmount)
      )
    })
  })

  describe('Complete swap with restricted token', async () => {
    beforeEach(async () => {
      await this.restrictedSwap.connect(this.quoteTokenSender).configureBuy(
        this.restrictedTokenAmount,
        this.restrictedTokenSender.address,
        this.quoteToken.address,
        this.quoteTokenAmount
      )
    })

    it('fails when already completed', async () => {
      await this.restrictedSwap.connect(this.restrictedTokenSender).completeSwapWithRestrictedToken(BigNumber.from(1))
      await expect(
        this.restrictedSwap.connect(this.restrictedTokenSender).completeSwapWithRestrictedToken(BigNumber.from(1))
      ).to.revertedWith(
        'Already completed'
      )
    })

    it('fails in case of incorrect quoteToken funder', async () => {
      await expect(
        this.restrictedSwap.connect(this.accounts[0]).completeSwapWithRestrictedToken(BigNumber.from(1))
      ).to.revertedWith(
        'You are not appropriate token sender for this swap'
      )
    })

    it('succeeds', async () => {
      const balances = {
        restrictedTokenSender: {
          quoteToken: await this.quoteToken.balanceOf(this.restrictedTokenSender.address),
          restrictedToken: await this.restrictedSwap.balanceOf(this.restrictedTokenSender.address)
        },
        quoteTokenSender: {
          restrictedToken: await this.restrictedSwap.balanceOf(this.quoteTokenSender.address),
        },
        swap: {
          quoteToken: await this.quoteToken.balanceOf(this.restrictedSwap.address)
        }
      }

      await expect(
        this.restrictedSwap.connect(this.restrictedTokenSender).completeSwapWithRestrictedToken(BigNumber.from(1))
      ).to.emit(this.restrictedSwap, 'SwapComplete')
        .withArgs(
          BigNumber.from(1),
          this.restrictedTokenSender.address,
          this.restrictedTokenAmount,
          this.quoteTokenSender.address,
          this.quoteToken.address,
          this.quoteTokenAmount
        )

      // check balances after swap completion

      expect(
        await this.quoteToken.balanceOf(this.restrictedTokenSender.address)
      ).to.equal(
        balances.restrictedTokenSender.quoteToken.add(this.quoteTokenAmount)
      )

      expect(
        await this.restrictedSwap.balanceOf(this.restrictedTokenSender.address)
      ).to.equal(
        balances.restrictedTokenSender.restrictedToken.sub(this.restrictedTokenAmount)
      )

      expect(
        await this.restrictedSwap.balanceOf(this.quoteTokenSender.address),
      ).to.equal(
        balances.quoteTokenSender.restrictedToken.add(this.restrictedTokenAmount)
      )

      expect(
        await this.quoteToken.balanceOf(this.restrictedSwap.address)
      ).to.equal(
        balances.swap.quoteToken.sub(this.quoteTokenAmount)
      )
    })
  })

  describe('Cancel check', async () => {
    beforeEach(async () => {
      await this.restrictedSwap.connect(this.restrictedTokenSender).configureSell(
        this.restrictedTokenAmount,
        this.quoteToken.address,
        this.quoteTokenSender.address,
        this.quoteTokenAmount,
      )
    })

    it('cannot cancel again', async () => {
      await this.restrictedSwap.connect(this.restrictedTokenSender).cancelSell(1)
      await expect(
        this.restrictedSwap.connect(this.restrictedTokenSender).cancelSell(1)
      ).to.revertedWith(
        'Already canceled'
      )
    })

    it('cannot cancel with an invalid swap number', async () => {
      await expect(
        this.restrictedSwap.connect(this.restrictedTokenSender).cancelSell(2)
      ).to.revertedWith(
        'This swap is not configured'
      )
    })

    it('cannot cancel swap completed swap', async () => {
      await this.restrictedSwap.connect(this.quoteTokenSender).completeSwapWithPaymentToken(1)
      await expect(
        this.restrictedSwap.connect(this.swapAdmins[0]).cancelSell(1)
      ).to.revertedWith(
        'Already completed'
      )
    })

    it('only configurator can cancel swap', async () => {
      await expect(
        this.restrictedSwap.connect(this.quoteTokenSender).cancelSell(1)
      ).to.revertedWith(
        'Only swap configurator can cancel the swap'
      )
    })

    it('succeeds', async () => {
      const balances = {
        restrictedTokenSender: {
          restrictedToken: await this.restrictedSwap.balanceOf(this.restrictedTokenSender.address)
        },
        swap: {
          restrictedToken: await this.restrictedSwap.balanceOf(this.restrictedSwap.address)
        }
      }

      await expect(
        this.restrictedSwap.connect(this.restrictedTokenSender).cancelSell(1)
      ).to.emit(this.restrictedSwap, 'SwapCanceled')
        .withArgs(this.restrictedTokenSender.address, BigNumber.from(1))

      expect(
        await this.restrictedSwap.balanceOf(this.restrictedTokenSender.address)
      ).to.equal(
        balances.restrictedTokenSender.restrictedToken.add(this.restrictedTokenAmount)
      )

      expect(
        await this.restrictedSwap.balanceOf(this.restrictedSwap.address)
      ).to.equal(
        balances.swap.restrictedToken.sub(this.restrictedTokenAmount)
      )
    })
  })

  describe('Check deposit revert with token with transaction fee', async () => {
    let erc20TxFee = null

    beforeEach(async () => {
      const Erc20TxFee = await ethers.getContractFactory('Erc20TxFeeMock')
      erc20TxFee = await Erc20TxFee.deploy('20', '20')

      await Promise.all([
        erc20TxFee.connect(this.quoteTokenSender).mint(9999),
        erc20TxFee.connect(this.quoteTokenSender).approve(
          this.restrictedSwap.address,
          9999
        ),
      ])

      await this.restrictedSwap.connect(this.restrictedTokenSender).configureSell(
        this.restrictedTokenAmount,
        erc20TxFee.address,
        this.quoteTokenSender.address,
        this.quoteTokenAmount,
      )
    })

    it('deposit reverts and funder balance gets restored', async () => {
      const senderBalance = await erc20TxFee.balanceOf(this.quoteTokenSender.address)
      const swapBalance = await erc20TxFee.balanceOf(this.restrictedSwap.address)

      await expect(
        this.restrictedSwap.connect(this.quoteTokenSender).completeSwapWithPaymentToken(1)
      ).to.revertedWith(
        'Deposit reverted for incorrect result of deposited amount'
      )

      expect((await erc20TxFee.balanceOf(this.quoteTokenSender.address)))
        .to.equal(senderBalance)
      expect((await erc20TxFee.balanceOf(this.restrictedSwap.address)))
        .to.equal(swapBalance)
    })
  })

  describe('Swap status', async () => {
    beforeEach(async () => {
      this.swapStatusEnum = [
        "SellConfigured",
        "BuyConfigured",
        "Complete",
        "Canceled"
      ];
    })

    it('status is SellConfigured', async () => {
      await this.restrictedSwap.connect(this.restrictedTokenSender).configureSell(
        this.restrictedTokenAmount,
        this.quoteToken.address,
        this.quoteTokenSender.address,
        this.quoteTokenAmount
      );
      const swapNumber = await this.restrictedSwap.swapNumber()
      const swapStatus = await this.restrictedSwap.swapStatus(swapNumber)

      expect(this.swapStatusEnum).contain.key(swapStatus)
      expect(this.swapStatusEnum[swapStatus]).to.equal("SellConfigured")
    });

    it('status is BuyConfigured', async () => {
      // check event
      await this.restrictedSwap.connect(this.quoteTokenSender).configureBuy(
        this.restrictedTokenAmount,
        this.restrictedTokenSender.address,
        this.quoteToken.address,
        this.quoteTokenAmount
      )

      const swapNumber = await this.restrictedSwap.swapNumber()
      const swapStatus = await this.restrictedSwap.swapStatus(swapNumber)

      expect(this.swapStatusEnum).contain.key(swapStatus)
      expect(this.swapStatusEnum[swapStatus]).to.equal("BuyConfigured")
    });

    it('status is Complete', async () => {
      await this.restrictedSwap.connect(this.restrictedTokenSender).configureSell(
        this.restrictedTokenAmount,
        this.quoteToken.address,
        this.quoteTokenSender.address,
        this.quoteTokenAmount,
      )

      const swapNumber = await this.restrictedSwap.swapNumber()

      await this.restrictedSwap.connect(this.quoteTokenSender).completeSwapWithPaymentToken(swapNumber)

      const swapStatus = await this.restrictedSwap.swapStatus(swapNumber)

      expect(this.swapStatusEnum).contain.key(swapStatus)
      expect(this.swapStatusEnum[swapStatus]).to.equal("Complete")
    })

    it('status is Canceled', async () => {
      await this.restrictedSwap.connect(this.restrictedTokenSender).configureSell(
        this.restrictedTokenAmount,
        this.quoteToken.address,
        this.quoteTokenSender.address,
        this.quoteTokenAmount,
      )

      const swapNumber = await this.restrictedSwap.swapNumber()

      await this.restrictedSwap.connect(this.restrictedTokenSender).cancelSell(swapNumber)

      const swapStatus = await this.restrictedSwap.swapStatus(swapNumber)

      expect(this.swapStatusEnum).contain.key(swapStatus)
      expect(this.swapStatusEnum[swapStatus]).to.equal("Canceled")
    })
  })

})
