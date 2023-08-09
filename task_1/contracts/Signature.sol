// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

contract Signature {
    struct EIP712Domain {
        string name;
        string version;
        uint256 chainId;
        address verifyingContract;
    }

    struct SignData {
        uint8 amount;
        address buyer;
        string uri;
    }

    bytes32 private constant EIP712DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    bytes32 private constant SIGNDATA_TYPEHASH = keccak256("SignData(uint8 amount,address buyer,string uri)");
    bytes32 private eip712DomainSeparator;

    function __Signature_init(string memory _name, string memory _version) internal {
        eip712DomainSeparator = _hash(
            EIP712Domain({name: _name, version: _version, chainId: block.chainid, verifyingContract: address(this)})
        );
    }

    function _hash(EIP712Domain memory domain) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    EIP712DOMAIN_TYPEHASH,
                    keccak256(bytes(domain.name)),
                    keccak256(bytes(domain.version)),
                    domain.chainId,
                    domain.verifyingContract
                )
            );
    }

    function _hash(SignData memory signData) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    SIGNDATA_TYPEHASH,
                    signData.amount,
                    signData.buyer,
                    keccak256(abi.encodePacked(signData.uri))
                )
            );
    }

    function _getSigner(
        address buyer,
        string memory uri,
        uint8 amount,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal view returns (address) {
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                eip712DomainSeparator,
                _hash(SignData({buyer: buyer, amount: amount, uri: uri}))
            )
        );
        return ecrecover(digest, v, r, s);
    }
}
