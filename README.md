# Mina zkApp: Threshold DKG

This template uses TypeScript.

## Description

This smart contract system implements a Threshold DKG (Distributed Key Generation) service.

By utilizing DKG, we can securely generate asymmetric cryptographic keys in a distributed manner, ensuring that no single entity has access to the complete key information.

Main processes of a DKG service:

- Round 1 contributions: generate shared public key
- Round 2 contributions: distributed encrypted private shares => n equal private shares
- Key usage
- Decryption contributions: decrypt data encrypted with the generate public key

Our Threshold scheme relies on the trust assumption of t out of n committee members (t/n).

- All n committee members need to contribute random sources for key generation processes.
- Only t out of n committee members need to contribute for the decryption processes.

This Threshold DKG system forms a crucial foundation for establishing a privacy-enhanced system that safeguards user data and decision confidentiality, such as:

- Private Voting
- Private Funding
- Social Recovery

For this 1-week hackathon hosted by Developer_DAO & Mina, we managed to:

- Get familiar with developing zkapp.
  - On-chain & Off-chain storage
  - Cryptography Primitives: Working with Mina's pasta curves (Group, Scalar)
  - Actions: Dispatch-Reduce mechanism
  - Decomposition of circuits into (Provable) Structs
- Design smart contract system for a Threshold DKG protocol and a simple asymmetric encryption process.
- Implement 2 round of DKG contributions to generate public keys.

Testing & more features are on the way, it's been an exciting week!

## Smart Contracts Architecture

### Core Idea

![Core Idea](https://lh3.googleusercontent.com/fife/APg5EObCAo16BcKOxg8s6dzFsfSeapa7eF9KohfeSUeg4IedbMPTkptvqtLCu6uluRPjZZMBvFthCQDnvGSI-rWVZ26MxLVyVJAgYbhJ-QSMPZozSfb_da8hkdBr-J3aNWVvlCojwJrTVuhCzhLd432B2PIYGhaGYHzSBBhgplL7n8P6PkEnppqU4VRvaK77ErZc4Qv1KTgSYI8emBJ7frpcxty_YfKy3vAY7LP73XGeLYJY5zKVW-jiFba02KtsrUTkMLQEvHUuW_BNywdx4bh2LdPr59Tl3fF4WxrUD1IvW0NQQvOKyAK0o5AFdbFSXPIFsGeoHH-PrBwXIM9IeF-HJVfUrfKY9dI3a7NdlCA8Y-6JZbUzLK0LyBiENnyXuoEYqdfxCTwkK8zCT1v3zUS3dPMs0k4fMxdGnLHInb8eMjTJFEL875qOuSQm-qlCdh4WggRvhiZmZqpD2jRItQaM3LqH-U7xEJVkqW_ue0VfqfEirSavN7z_B0g8qj6LOsDlkJmMtqkXx5QDM4Sc4y8ifatZrwSzMZlfxwP79W6T2lgCqO8XZDmffSI6YgE-vIw0y4W5K08P3g6866wqkVQIifEyE5GQ4PmSIOOYKTd44JIhplQPU_tVWTRpVsnPtCdxICHQwf8kGcFHXVQKth2upYq0Dae0S1ihNctk5MmdrqOoqYstC0Bas3MlfrqbgsGBAvDAKDsO54i4w52Qi87jOz92vla4dnE5FOQ-YMLR9HJSaS0cLvE832kgdSPIRLtaEYiqfE0tFq-pHe91n_Etst-S7Tt1_wCouIetrKLrMOjTlg23Tka7a8tNJE5Il-kbkJKdbQPlURb7Y24NKoZGvLtpPbYopLgBP_biWIfLPc-5kIGFdb63WUaE8p07MvieJbXA1g7AYua7n4IfpT7MLrhczslhMRMl8NIXY4CPNivn2PFAhbJ1QHkAjthWIJha_bhOlCw8Uw=w1920-h1089)

### Storage

![Storage](https://lh3.googleusercontent.com/u/0/drive-viewer/AFGJ81pRnTMVRevfsKmmqYCAPcdzMmqERr8rCWhHm-P_UqSu7gu6hblJtiLvCaLMRuUrGJ_PXkn_dXOuLcrPbxKDTYfroDnA7w=w1920-h1089)

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
