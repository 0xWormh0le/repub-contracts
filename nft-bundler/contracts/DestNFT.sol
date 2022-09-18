//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";
import "./interfaces/IDestNFT.sol";
import "./interfaces/IRandomGenerator.sol";
import "./libraries/String.sol";


contract DestNFT is IDestNFT, ERC721URIStorage, Ownable, ReentrancyGuard {
    using String for bytes32;
    using ERC165Checker for address;

    /// @dev baseURI
    string internal baseURI;

    /// @dev token id tracker
    uint256 public tokenIdTracker;

    IRandomGenerator public immutable randomGenerator;
    
    bytes32[] public metadataHashList;


    event MetaHashListInitialized(bytes32[] values);

    event MetadataHashClaimed(address indexed _claimer, bytes32 metadataHash);


    constructor(
        string memory name_,
        string memory symbol_,
        string memory baseURI_,
        bytes32[] memory metahashes,
        address randomGenerator_,
        address owner
    ) ERC721(name_, symbol_) Ownable() ReentrancyGuard() {
        require(randomGenerator_.supportsInterface(type(IRandomGenerator).interfaceId), "Random generator is invalid");
        baseURI = baseURI_;
        metadataHashList = metahashes;
        randomGenerator = IRandomGenerator(randomGenerator_);
        transferOwnership(owner);
    }

    function _baseURI() internal view override returns (string memory) {
        return baseURI;
    }

    function randomMint(address to) external override onlyOwner nonReentrant {
        require(metadataHashList.length > 0, "All tokens have been claimed");

        randomGenerator.askRandomness(to);
    }

    /**
     * @notice Callback called from RandomGenerator upon random number generation
     * @param randomness random number generated
     * @param recipient token recipient
     */
    function randomMintCallback(
        uint256 randomness,
        address recipient
    ) external override {
        require(msg.sender == address(randomGenerator), "Only random generator");
        
        uint256 len = metadataHashList.length;
        uint256 rand = randomness % len;
        bytes32 metadataSelected = metadataHashList[rand];
        bytes32 last = metadataHashList[len - 1];

        metadataHashList.pop();

        if (rand < metadataHashList.length) {
            metadataHashList[rand] = last;
        }

        _safeMint(recipient, tokenIdTracker);
        _setTokenURI(tokenIdTracker, metadataSelected.toString());
        tokenIdTracker += 1;

        emit MetadataHashClaimed(recipient, metadataSelected);
    }
}
