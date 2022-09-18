const { expect } = require('chai')
const fs = require('fs')
const { generateClaims } = require('../../tasks/generate-claims')
const privateKey = require('../privateKey')

const tmpPath = './test/tmp'
const inputFile = './test/tasks/airdrop.csv'
const outputFile = tmpPath + '/output.csv'
const privateKeyFile = tmpPath + '/private-key'


describe('Generate claims task', () => {
  before(async () => {
    const users = await ethers.getSigners()

    users.forEach((user, index) => {
      user.privateKey = privateKey(index)
    })

    this.users = users
    const [deployer] = users

    if (fs.existsSync(tmpPath)) {
      fs.rmdirSync(tmpPath, { recursive: true })
    }
    fs.mkdirSync(tmpPath)
    fs.writeFileSync(privateKeyFile, deployer.privateKey, { encoding: 'utf8', flag: 'w+' })

    this.claimsCount = await generateClaims(privateKeyFile, inputFile, outputFile)

    const claimList = fs.readFileSync(inputFile, 'utf8')
    this.claimList = claimList
      .split(/\r?\n/) // split by line
      .slice(1) // skip header
      .filter(x => x.length > 0) // skip empty line like the one at the end of the file
      .map(x => x.split(',')) // get field value
  })

  after(() => {
    fs.rmdirSync(tmpPath, { recursive: true })
  })

  it('check result', async () => {
    expect(this.claimsCount)
      .to.equal(this.claimList.length)

    const output = fs
      .readFileSync(outputFile, 'utf8')
      .split(/\r?\n/) // split by line
      .slice(1) // skip header
      .filter(x => x.length > 0) // skip empty line like the one at the end of the file 
    expect(output.length)
      .to.equal(this.claimList.length)
  })
})
