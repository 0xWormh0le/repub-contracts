module.exports.eventArgs = async (fn, event) => {
  const tx = await fn
  const res = await tx.wait()
  const evt = res.events.filter(e => e.event === event)
  if (evt.length) {
    return evt[0].args
  } else {
    return null
  }
}

module.exports.currentTimestamp = async () => {
  const block = await (ethers.getDefaultProvider()).getBlock('latest')
  return block.timestamp - 100
}
