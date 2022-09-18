const { expect } = require('chai')
const { ethers } = require('hardhat')
const { BigNumber } = require('ethers')
const { randomBytes32, toBytes32, getEventArgs } = require('./utils')


const chainlinkConf = {
  kovan: {
    vrfCoordinator: '0xdD3782915140c8f3b190B5D67eAc6dc5760C46E9',
    link: '0xa36085F69e2889c224210F603D836748e7dC0088',
    keyHash: '0x6c3699283bda56ad74f6b855546325b68d482e983852a7a82979cc4807b641f4'
  }
}

const oneLink = BigNumber.from(10).pow(18)

const poolSize = 10

const metaHashes = Array(poolSize).fill(0).map(() => randomBytes32())


describe ('Swapper', () => {
  before(async () => {
    const RandomGenerator = await ethers.getContractFactory('MockRandomGenerator')
    const SwapperFactory = await ethers.getContractFactory('SwapperFactory')
    const AccessToken = await ethers.getContractFactory('MockERC1155')
    const LinkToken = await ethers.getContractFactory('MockErc20')

    this.linkToken = await LinkToken.deploy('LINK', 'LINK')

    this.randomGenerator = await RandomGenerator.deploy(
      chainlinkConf.kovan.vrfCoordinator,
      this.linkToken.address,
      chainlinkConf.kovan.keyHash,
      oneLink.div(10) // 0.1 LINK
    )

    this.swapperFactory = await SwapperFactory.deploy(this.randomGenerator.address)

    this.accessToken = await AccessToken.deploy()

    this.users = await ethers.getSigners()

    const tokenHolder = this.users[0]

    await Promise.all(
      metaHashes.map((_, index) =>
        this.accessToken.connect(tokenHolder).mint(tokenHolder.address, index, 1)
      )
    )
  })

  describe('SwapperFactory', () => {
    it('create fails: caller is not deployer', async () => {
      const [, bob] = this.users

      await expect(
        this.swapperFactory
          .connect(bob)
          .create(
            'FantasyIsland',
            'FIT',
            'https://example.com/',
            metaHashes,
            this.accessToken.address
          )
      ).to.revertedWith('Ownable: caller is not the owner')
    })

    it('create succeeds', async () => {
      const [alice] = this.users

      const [swapperAddr, destNftAddr] = await getEventArgs(
        this.swapperFactory
          .connect(alice)
          .create(
            'FantasyIsland',
            'FIT',
            'https://example.com/',
            metaHashes,
            this.accessToken.address
          ),
        'NewSwapperCreated'
      )

      this.swapper = await ethers.getContractAt('Swapper', swapperAddr)
      this.destNft = await ethers.getContractAt('DestNFT', destNftAddr)
    })

    it('create fails: cannot create again', async () => {
      const [alice] = this.users

      await expect(
        this.swapperFactory
          .connect(alice)
          .create(
            'FantasyIsland',
            'FIT',
            'https://example.com/',
            metaHashes,
            this.accessToken.address
          )
      ).to.revertedWith('Already created')
    })
  })

  describe('DestNft', () => {
    it('randomMint fails: only swapper can call', async () => {
      const [alice] = this.users
      await expect(
        this.destNft.connect(alice).randomMint(alice.address)
      ).to.revertedWith('Ownable: caller is not the owner')
    })

    it('randomMintCallback fails: only random generator can call', async () => {
      const [alice] = this.users
      await expect(
        this.destNft.connect(alice).randomMintCallback(0, alice.address)
      ).to.revertedWith('Only random generator')
    })
  })

  describe('Swapper.claim', () => {
    before(async () => {
      const [tokenHolder] = this.users
      await Promise.all(
        metaHashes.map(() =>
          this.accessToken.connect(tokenHolder)
            .setApprovalForAll(this.swapper.address, true)
        )
      )
    })

    it('fails: caller is not access token id owner', async () => {
      const [, alice] = this.users
      await expect(this.swapper.connect(alice).claim(0))
        .to.revertedWith('Incorrect access token id owner')
    })

    it('fails: link balance is not enough', async () => {
      const [alice] = this.users
      await expect(this.swapper.connect(alice).claim(0))
        .to.revertedWith('Not enough LINK balance')
    })

    it('succeeds', async () => {
      const [alice] = this.users

      // mint some LINK to RandomGenerator
      await this.linkToken.connect(alice).mint(this.randomGenerator.address, oneLink.div(10))

      // claim
      await this.swapper.connect(alice).claim(0)
      const requestId = await this.randomGenerator.requestIdNonce()
      await expect(
        this.randomGenerator.connect(alice)
          .mockFulfillRandomness(toBytes32(requestId.sub(1)), 0)
      ).to.emit(this.destNft, 'MetadataHashClaimed')
        .withArgs(alice.address, metaHashes[0])
    })

    it('fails: access token id already purchased', async () => {
      const [alice] = this.users

      await expect(
        this.swapper.connect(alice).claim(0)
      ).to.revertedWith('Incorrect access token id owner')
    })
  })

  describe('Swapper.batchClaim', () => {
    it('succeeds', async () => {
      const [alice] = this.users

      await this.swapper
        .connect(alice)
        .batchClaim(metaHashes.slice(1).map((_, i) => i + 1))

      await Promise.all(metaHashes.slice(1).map(
        (_, i) => this.randomGenerator.connect(alice).mockFulfillRandomness(toBytes32(i), 0)
      ))

      expect(
        await this.destNft.tokenIdTracker()
      ).to.equal(poolSize)
    })

    it('claim fails: All tokens have been claimed', async () => {
      const [alice] = this.users

      await this.accessToken.connect(alice).mint(alice.address, 0, 1)

      await expect(
        this.swapper.connect(alice).claim(0)
      ).to.revertedWith('All tokens have been claimed')
    })
  })

  describe('RandomGenerator.updateChainlink', () => {
    it('succeeds', async () => {
      const [alice] = this.users

      const keyHash = toBytes32(123)
      const fee = 1000

      await expect(
        this.randomGenerator.connect(alice).updateChainlink(keyHash, fee)
      ).to.emit(this.randomGenerator, 'ChainlinkConfigured')
        .withArgs(keyHash, fee)

      // zero values are not set
      await expect(
        this.randomGenerator.connect(alice).updateChainlink(toBytes32(0), 0)
      ).to.emit(this.randomGenerator, 'ChainlinkConfigured')
        .withArgs(keyHash, fee)
    })
  })

  describe('DestNFT.url', () => {
    it('works correctly', async () => {
      const tokenUri = await this.destNft.tokenURI(0)

      expect(tokenUri.startsWith('https://example.com/0x'))
        .to.equal(true)
    })
  })
})
