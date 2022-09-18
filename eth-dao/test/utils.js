const hre = require('hardhat')

module.exports.getEventArgs = async (fn, event, firstEvent = true) => {
  const tx = await fn;
  const receipt = await tx.wait()
  const events = receipt.events.filter(x => x.event === event)
  if (events && events.length) {
    if (firstEvent) {
      return events[0].args
    } else {
      return events.map(e => e.args)
    }
  } else {
    return []
  }
}

module.exports.advanceTime = async (seconds) => {
  await hre.network.provider.request({
    method: "evm_increaseTime",
    params: [seconds]
  })
  await hre.network.provider.request({
    method: "evm_mine",
    params: []
  })
}

module.exports.currentTimestamp = async () => {
  const block = await (ethers.getDefaultProvider()).getBlock('latest')
  return block.timestamp - 1000
}
