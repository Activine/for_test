// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {ERC721URIStorage, ERC721} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Counters} from "@openzeppelin/contracts/utils/Counters.sol";

contract LotteryTicket is ERC721, ERC721URIStorage, AccessControl {
    using Counters for Counters.Counter;

    string private baseURI;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    Counters.Counter private _tokenIdCounter;

    constructor() ERC721("Ticket", "TCK") {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(OPERATOR_ROLE, msg.sender);
        _setupRole(MINTER_ROLE, msg.sender);
        baseURI = "https://gateway.pinata.cloud/ipfs/";
    }

    function _baseURI() internal view override returns (string memory) {
        return baseURI;
    }

    function setBaseURI(string memory newBaseURI) external onlyRole(OPERATOR_ROLE) {
        baseURI = newBaseURI;
    }

    function batchMint(address to, uint256 amount, string calldata uri) public onlyRole(MINTER_ROLE) {
        uint256 tokenId;
        uint256[] memory idArr = new uint256[](amount);

        for (uint256 i; i < amount; ) {
            tokenId = _tokenIdCounter.current();
            idArr[i] = tokenId;
            _mint(to, tokenId);
            _setTokenURI(tokenId, uri);
            unchecked {
                ++i;
                _tokenIdCounter.increment();
            }
        }
    }

    function _burn(uint256 tokenId) internal override(ERC721, ERC721URIStorage) {
        super._burn(tokenId);
    }

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721, ERC721URIStorage, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
