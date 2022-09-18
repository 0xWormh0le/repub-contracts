//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./DestNFT.sol";
import "./Swapper.sol";


contract SwapperFactory is Ownable {

    address immutable public randomGenerator;

    bool public created;


    event NewSwapperCreated(address swapper, address destNft);


    constructor(address _randomGenerator) Ownable() {
        randomGenerator = _randomGenerator;
    }

    function create(
        string calldata name,
        string calldata symbol,
        string calldata baseUri,
        bytes32[] calldata metahashes,
        address accessToken
    ) external onlyOwner {
        require(!created, "Already created");

        created = true;

        DestNFT newDestNft = new DestNFT(
            name,
            symbol,
            baseUri,
            metahashes,
            randomGenerator,
            address(this) // owner
        );
        address newSwapper = address(new Swapper(accessToken, address(newDestNft)));

        newDestNft.transferOwnership(newSwapper);

        emit NewSwapperCreated(newSwapper, address(newDestNft));
    }
}
