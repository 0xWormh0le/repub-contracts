//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "./interfaces/IDestNFT.sol";


contract Swapper {

    address public immutable accessToken;

    address public immutable destNft;

    address private constant LOCK_ADDRESS = address(1);

    constructor(address _accessToken, address _destNft) {
        accessToken = _accessToken;
        destNft = _destNft;
    }

    /**
     * @notice Claim
     * @param _accessTokenId uint256
     */
    function claim(uint256 _accessTokenId) public {
        uint256 balance = IERC1155(accessToken).balanceOf(msg.sender, _accessTokenId);

        // revert if user is not owner of access token id
        require(balance > 0, "Incorrect access token id owner");

        // lock access token
        IERC1155(accessToken).safeTransferFrom(msg.sender, LOCK_ADDRESS, _accessTokenId, 1, "");

        IDestNFT(destNft).randomMint(msg.sender);
    }

    /**
     * @notice Bulk claim
     * @param _accessTokenIds array of access token ids
     */
    function batchClaim(uint256[] calldata _accessTokenIds) external {
        uint256 len = _accessTokenIds.length;

        for (uint256 i = 0; i < len; i++) {
            claim(_accessTokenIds[i]);
        }
    }
}
