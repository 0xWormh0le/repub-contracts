const { expect } = require('chai')
const { ethers } = require('hardhat')
const { BigNumber } = require('ethers')
const { ecsign } = require("ethereumjs-util")
const privateKey = require('./privateKey');

function increaseTime (seconds) {
  ethers.provider.send('evm_increaseTime', [seconds])
  ethers.provider.send('evm_mine')
}

const token = BigNumber.from(10).pow(18) // a token is 18 decimals
const PERMIT_TYPEHASH = '0x6e71edae12b1b97f4d1f60370fef10105fa2faae0126114a169c64845d6126c9'

describe('Staking Rewards', () => {
  beforeEach(async () => {
    const users = await hre.ethers.getSigners()
    users.forEach((user, index) => {
      user.privateKey = privateKey(index).slice(2)
    });

    [owner, distributor, alice, bob] = users

    const MockERC20 = await ethers.getContractFactory('MockERC20')

    rewardsToken = await MockERC20.deploy(owner.address)
    stakingToken = await MockERC20.deploy(owner.address)

    const StakingRewards = await ethers.getContractFactory('StakingRewards')
    stakingRewards = await StakingRewards.deploy(
      owner.address,
      distributor.address,
      rewardsToken.address,
      stakingToken.address,
      7
    )

    const MockUniV2ERC20 = await ethers.getContractFactory('MockUniV2ERC20')
    uniV2Token = await MockUniV2ERC20.deploy(token.mul(1_000_000))

    stakingRewardsWithUniV2 = await StakingRewards.deploy(
        owner.address,
        distributor.address,
        rewardsToken.address,
        uniV2Token.address,
        7
    )

  })

  describe('Initial check', () => {
    it('check deploy requirements', async () => {
      const StakingRewards = await ethers.getContractFactory('StakingRewards')

      await expect(StakingRewards.deploy(
        ethers.constants.AddressZero,
        distributor.address,
        rewardsToken.address,
        stakingToken.address,
        1
      )).to.revertedWith('Ownable: new owner is the zero address')

      await expect(StakingRewards.deploy(
        owner.address,
        ethers.constants.AddressZero,
        rewardsToken.address,
        stakingToken.address,
        1
      )).to.revertedWith('RadarStakingRewards: invalid reward distribution')

      await expect(StakingRewards.deploy(
        owner.address,
        distributor.address,
        ethers.constants.AddressZero,
        stakingToken.address,
        1
      )).to.revertedWith('RadarStakingRewards: invalid reward token address')

      await expect(StakingRewards.deploy(
        owner.address,
        distributor.address,
        rewardsToken.address,
        ethers.constants.AddressZero,
        1
      )).to.revertedWith('RadarStakingRewards: invalid staking token address')

      await expect(StakingRewards.deploy(
        owner.address,
        distributor.address,
        rewardsToken.address,
        stakingToken.address,
        0
      )).to.revertedWith('RadarStakingRewards: invalid reward duration')
    })

    it('check balanceOf function', async () => {
      expect(await stakingRewards.connect(alice).balanceOf(alice.address)).to.be.equal(BigNumber.from(0))
    })

    it('check lastTimeRewardApplicable function', async () => {
      expect(await stakingRewards.connect(alice).lastTimeRewardApplicable()).to.be.equal(BigNumber.from(0))
    })

    it('check rewardPerToken function', async () => {
      expect(await stakingRewards.connect(alice).rewardPerToken()).to.be.equal(BigNumber.from(0))
    })

    it('check earned function', async () => {
      expect(await stakingRewards.connect(alice).earned(alice.address)).to.be.equal(BigNumber.from(0))
    })

    it('check getRewardForDuration function', async () => {
      expect(await stakingRewards.connect(alice).getRewardForDuration()).to.be.equal(BigNumber.from(0))
    })

    it('check stake function', async () => {
      await expect(stakingRewards.connect(alice).stake(0)).to.be.revertedWith('RadarStakingRewards: cannot stake 0')
    })

    it('check withdraw function', async () => {
      await expect(stakingRewards.connect(alice).withdraw(0)).to.be.revertedWith('RadarStakingRewards: cannot withdraw 0')
    })

    it('check exit function', async () => {
      await expect(stakingRewards.connect(alice).exit()).to.be.revertedWith('RadarStakingRewards: cannot withdraw 0')
    })

    it('check fundRewards function', async () => {
      await expect(stakingRewards.connect(alice).fundRewards(0)).to.be.revertedWith('RadarStakingRewards: invalid reward')

      await expect(stakingRewards.connect(alice).fundRewards(1234567890)).to.be.revertedWith('RadarStakingRewards: caller is not eligible to fund rewards')
    })
  })

  describe('Testing staking', () => {
    it('Guarantee the new owner was set successfully',async () => {
      await expect(await stakingRewards.owner()).to.be.eq(owner.address)
      await expect(await stakingRewards.owner()).to.not.be.eq(alice.address)
    })

    it('Add funds', async () => {
      const amount = BigNumber.from(2).pow(255)

      await expect(rewardsToken.connect(owner).mint(distributor.address, amount)).to.emit(rewardsToken, 'Transfer').withArgs(ethers.constants.AddressZero, distributor.address, amount)

      await rewardsToken.connect(distributor).approve(stakingRewards.address, amount)

      await expect(stakingRewards.connect(distributor).fundRewards(token.mul(10000))).to.emit(stakingRewards, 'RewardAdded').withArgs(token.mul(10000))
    })

    it('Stake and get reward', async () => {
      await expect(rewardsToken.connect(owner).mint(distributor.address, token.mul(10000))).to.emit(rewardsToken, 'Transfer').withArgs(ethers.constants.AddressZero, distributor.address, token.mul(10000))

      await rewardsToken.connect(distributor).approve(stakingRewards.address, token.mul(10000))
      await expect(stakingRewards.connect(distributor).fundRewards(token.mul(10000))).to.emit(stakingRewards, 'RewardAdded').withArgs(token.mul(10000))

      // Making sure the staking contract was truly funded
      await expect((await rewardsToken.balanceOf(stakingRewards.address)).toString()).to.eq(token.mul(10000))

      await expect(stakingToken.connect(owner).mint(alice.address, token.mul(321))).to.emit(stakingToken, 'Transfer').withArgs(ethers.constants.AddressZero, alice.address, token.mul(321))

      await expect(stakingToken.connect(owner).mint(bob.address, token.mul(123))).to.emit(stakingToken, 'Transfer').withArgs(ethers.constants.AddressZero, bob.address, token.mul(123))

      await stakingToken.connect(alice).approve(stakingRewards.address, token.mul(321))
      await stakingToken.connect(bob).approve(stakingRewards.address, token.mul(123))

      await expect(stakingRewards.connect(alice).stake(token.mul(321))).to.emit(stakingRewards, 'Staked').withArgs(alice.address, token.mul(321))

      await expect(stakingRewards.connect(bob).stake(token.mul(123))).to.emit(stakingRewards, 'Staked').withArgs(bob.address, token.mul(123))

      await stakingRewards.connect(bob).getReward()
      const balanceBefore = BigNumber.from(await rewardsToken.balanceOf(bob.address))

      //wait 3 days
      increaseTime(259200)

      await stakingRewards.connect(bob).getReward();
      const balance3DaysAfter = BigNumber.from(await rewardsToken.balanceOf(bob.address));

      expect(balance3DaysAfter.gt(balanceBefore)).to.be.true;
      console.log(`\nReward Balance Before: ${balanceBefore} >> 3 Days Later: ${balance3DaysAfter}\n`);

      //Alice exit
      await expect(stakingRewards.connect(alice).exit()).to.emit(stakingRewards, 'Withdrawn').withArgs(alice.address, token.mul(321))

      await expect(rewardsToken.connect(owner).mint(distributor.address, token.mul(15000))).to.emit(rewardsToken, 'Transfer').withArgs(ethers.constants.AddressZero, distributor.address, token.mul(15000))

      await rewardsToken.connect(distributor).approve(stakingRewards.address, token.mul(15000))
      await stakingRewards.connect(distributor).fundRewards(token.mul(15000))

      //wait 8 days
      increaseTime(691200)

      await stakingRewards.connect(bob).exit()

      const aliceBalanceRewards = BigNumber.from(await rewardsToken.balanceOf(alice.address))
      const bobBalanceRewards = BigNumber.from(await rewardsToken.balanceOf(bob.address))

      const aliceBalanceStaking = BigNumber.from(await stakingToken.balanceOf(alice.address))
      const bobBalanceStaking = BigNumber.from(await stakingToken.balanceOf(bob.address))

      console.log('RewardsToken delta: ', token.mul(25000).sub(aliceBalanceRewards).sub(bobBalanceRewards).toString())
      console.log('StakingToken delta: ', token.mul(444).sub(aliceBalanceStaking).sub(bobBalanceStaking).toString())

    })

    describe('Test Staking with permit', async function() {
      it('should throw when staking token does not support stakeWithPermit', async function() {
        const deadline = 1589205127399;
        const r = "0xc225220de6c6f5a829c07bf07444435619c98ac95fb5ce82205bc9be1def858b";
        const s = "0x5924bfb22181c58e4ec4bc26d42ae5b4edb53ffebf9045cad2e275baab4915ba";
        const v =  27;

        await expect(
            stakingRewards.connect(alice).stakeWithPermit(100, deadline, v, r, s)
        ).to.be.revertedWith("Transaction reverted: function selector was not recognized and there's no fallback function")
      });

      it('should work well when staking token supports stakeWithPermit', async function() {

        const domainSeparator = ethers.utils.keccak256(
            ethers.utils.defaultAbiCoder.encode(
                ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
                [
                    ethers.utils.keccak256(ethers.utils.toUtf8Bytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')),
                    ethers.utils.keccak256(ethers.utils.toUtf8Bytes('Uniswap V2')),
                    ethers.utils.keccak256(ethers.utils.toUtf8Bytes("1")),
                    ethers.provider.network.chainId,
                    uniV2Token.address
                ]
            )
        )

        const value = ethers.utils.parseUnits("100");
        const deadline = ethers.constants.MaxUint256
        const nonce = await uniV2Token.nonces(owner.address)

        const digest = ethers.utils.keccak256(
            ethers.utils.solidityPack(
                ['bytes1', 'bytes1', 'bytes32', 'bytes32'],
                [
                  '0x19',
                  '0x01',
                  domainSeparator,
                  ethers.utils.keccak256(
                      ethers.utils.defaultAbiCoder.encode(
                          ['bytes32', 'address', 'address', 'uint256', 'uint256', 'uint256'],
                          [PERMIT_TYPEHASH, owner.address, stakingRewardsWithUniV2.address, value, nonce, deadline]
                      )
                  ),
                ]
            )
        )

        const signingDigest = Buffer.from(digest.slice(2), 'hex');
        const { v, r, s } = ecsign(signingDigest, Buffer.from(owner.privateKey, 'hex'))

        // Record balance before calling stakeWithPermit
        const balanceBeforeStakeWithPermit = await uniV2Token.balanceOf(owner.address)
        expect(balanceBeforeStakeWithPermit).to.be.eq(token.mul(1000000))

        // Expect stakeWithPermit to run without errors
        await stakingRewardsWithUniV2.connect(owner).stakeWithPermit(value, deadline, v, r, s)

        const balanceAfterStakeWithPermit = await uniV2Token.balanceOf(owner.address)
        expect(balanceAfterStakeWithPermit).to.be.eq(token.mul(999900))

        expect(BigNumber.from(balanceBeforeStakeWithPermit).gt(BigNumber.from(balanceAfterStakeWithPermit))).to.be.true;
      });

    });

  })
})
