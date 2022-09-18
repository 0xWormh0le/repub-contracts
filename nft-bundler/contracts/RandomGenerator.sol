//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBase.sol";
import "@chainlink/contracts/src/v0.8/interfaces/LinkTokenInterface.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "./interfaces/IDestNFT.sol";
import "./interfaces/IRandomGenerator.sol";


contract RandomGenerator is IRandomGenerator, ERC165, Ownable, VRFConsumerBase {

    struct Session {
        address recipient;
        address token;
    }

    /// @notice request id => token recipient
    mapping(bytes32 => Session) internal sessions;

    bytes32 internal keyHash;

    uint256 internal fee;

    event ChainlinkConfigured(bytes32 keyHash, uint256 fee);


    modifier sufficientFee() {
        require(LINK.balanceOf(address(this)) >= fee, "Not enough LINK balance");
        _;
    }

    /**
     * @notice Constructor inherits VRFConsumerBase
     * 
     * Network: Kovan
     * Chainlink VRF Coordinator address: 0xdD3782915140c8f3b190B5D67eAc6dc5760C46E9
     * LINK token address:                0xa36085F69e2889c224210F603D836748e7dC0088
     * Key Hash: 0x6c3699283bda56ad74f6b855546325b68d482e983852a7a82979cc4807b641f4
     * Fee: 0.1 * 10 ** 18 = 0.1 LINK (varies by network)
     */
    constructor(
        address _vrfCoordinator,
        address _link,
        bytes32 _keyHash,
        uint256 _fee
    )
        Ownable()
        VRFConsumerBase(_vrfCoordinator, _link)
    {
        keyHash = _keyHash;
        fee = _fee;
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return
            interfaceId == type(IRandomGenerator).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    /**
     * @notice adjust chainlink parameters
     * @param _keyHash chainlink key hash
     * @param _fee chainlink fee
     */
    function updateChainlink(bytes32 _keyHash, uint256 _fee) external onlyOwner {
        if (_keyHash != 0) {
            keyHash = _keyHash;
        }
        if(_fee != 0) {
            fee = _fee;
        }
        emit ChainlinkConfigured(keyHash, fee);
    }

    function _saveSession(bytes32 requestId, address recipient) internal {
        Session storage session = sessions[requestId];
        session.recipient = recipient;
        session.token = msg.sender;
    }

    function askRandomness(address recipient) virtual override external sufficientFee {
        _saveSession(requestRandomness(keyHash, fee), recipient);
    }

    /**
     * @notice Callback function used by VRF Coordinator
     * @param requestId bytes32
     * @param randomness uint256
     */
    function fulfillRandomness(bytes32 requestId, uint256 randomness) internal virtual override {
        Session storage session = sessions[requestId];
        IDestNFT(session.token).randomMintCallback(randomness, session.recipient);
    }
}
