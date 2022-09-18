const { utils } = require('ethers')
const { ecsign } = require('ethereumjs-util')

const { keccak256, solidityPack } = utils

module.exports = (
  privateKey,
  data
) => {
  const { recipient, amount } = data
  const msg = keccak256(
    solidityPack(
      ['address', 'uint256'],
      [recipient, amount]
    )
  )
  const { v, r, s } = ecsign(
    Buffer.from(msg.slice(2), 'hex'),
    Buffer.from(privateKey.slice(2), 'hex')
  )

  return '0x' + r.toString('hex') + s.toString('hex') + v.toString(16)
}
