// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract LotteryTicket is ERC721, ERC721URIStorage, AccessControl {
    using Counters for Counters.Counter;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    Counters.Counter private _tokenIdCounter;
    string private baseURI;

    modifier onlyMinter {
		require(hasRole(MINTER_ROLE, msg.sender), "Caller is not a minter");
		_;
	}

    constructor() ERC721("Ticket", "TCK") {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(MINTER_ROLE, msg.sender);
        baseURI = "https://gateway.pinata.cloud/ipfs/";
    }

    function _baseURI() internal view override returns (string memory) {
        return baseURI;
    }

    function setBaseURI(string memory newBaseURI) external onlyRole(DEFAULT_ADMIN_ROLE){
        baseURI = newBaseURI;
    }

    function batchMint(address to, uint256 amount, string calldata uri) public onlyMinter {
        uint256 i;
        uint256 tokenId;
        uint256[] memory idArr = new uint256[](amount);

        for (; i < amount;) {
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

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
