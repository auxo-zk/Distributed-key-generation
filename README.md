# DKG for Threshold Homomorphic Encryption

<p align="center">
    <a href="http://auxo.fund/" target="blank"><img src="https://lh3.googleusercontent.com/u/0/drive-viewer/AKGpihbOeavm7ejNaJLr70jxI0YLtj_KzKk7pzjyfbrBPxKRCmXIhEmhLftyPX_ZgOTdpE_B9uoPmiyP1NhBTIShqW8rtQhusA=w2388-h1376" alt="Auxo Logo" /></a>
</p>

<p align="center">
An On-chain Funding Platform with privacy-preserving features powered by ZKP.
</p>
<p align="center">
    <a href="https://www.npmjs.com/org/auxo-dev" target="_blank"><img src="https://img.shields.io/npm/v/@auxo-dev/dkg.svg" alt="NPM Version" /></a>
    <a href="https://www.npmjs.com/org/auxo-dev" target="_blank"><img src="https://img.shields.io/npm/l/@auxo-dev/dkg.svg" alt="Package License" /></a>
    <a href="https://www.npmjs.com/org/auxo-dev" target="_blank"><img src="https://img.shields.io/npm/dm/@auxo-dev/dkg.svg" alt="NPM Downloads" /></a>
    <a href="https://twitter.com/AuxoZk" target="_blank"><img src="https://img.shields.io/twitter/follow/AuxoZk.svg?style=social&label=Follow"></a>
</p>

## Demo:

<a target="_blank" href="https://drive.google.com/drive/folders/1Daka6yzBgyefyieIH_h9K5WmjpYX0gfo?usp=drive_link">Videos</a> - <a target="_blank" href="https://committee.auxo.fund">Public Testnet (In-progress)</a>

## Description

The **Distributed Key Generation** (DKG) protocol is a fundamental cryptographic module in our platform. This protocol ensures the secure generation of asymmetric cryptographic keys in a distributed manner, preventing any single entity from having complete access to sensitive key information. The generated keys can be used by the **Threshold Homomorphic Encryption** service, which enable privacy-preserving features such as Private Funding or Private Voting on our platform.

## Features

1. **Committee Management**: Creation and configuration of a key generation committee with a security threshold of T / N members.

2. **Key Generation**: Committee members contribute their random inputs and computation result to generate encryption public keys.

3. **Key Usage**: Services can request to use generated keys for their use cases.

4. **Threshold (Additive) Homomorphic Encryption**: This service allows an arbitrary number of users to encrypt their secret vectors and the sum vector can be computed without decrypting the encryption submissions. And the final results can only be computed after T / N members submitted their response contribution.

## Applications

This protocol can support various applications that prioritize data privacy and security. Some of the applications that can benefit from DKG include:

1. **Private Funding**: Applications dealing with financial transactions and investments can use DKG to secure sensitive financial data.

2. **Private Voting**: DKG can be employed to create secure voting systems where individual votes remain confidential, preventing unauthorized access or manipulation.

3. **Social Recovery**: DKG can aid in securely recovering lost or forgotten passwords or keys without compromising user data privacy.

## Future Work

1. **Fee Configuration**: Committees will soon be able to configure custom fee paid by other services for key usages.

2. **Supports for other use cases**: Currently, our DKG protocol supports generation of public keys compatible to Pasta Curves and ElGamal encryption scheme based on those curves. We are open for partnership and collaboration to work on supporting other schemes and use cases.

3. **Public Docker Image**: This protocol and its application for user interaction requires the availability of some services: Reducer Service, REST Service, and Storage Service. These services are open-sourced and will be published as public docker images to allow anyone with interests to run and maintain by themselves.

## How to build

```sh
npm run build
```

## How to run tests

```sh
npm run test
npm run testw # watch mode
```

## How to run coverage

```sh
npm run coverage
```

## License

[Apache-2.0](LICENSE)
