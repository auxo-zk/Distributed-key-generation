# Distributed Key Generation (DKG)

<img src="https://i.ibb.co/rds9tdw/logo2.png" width="100" height="100">

The **Distributed Key Generation** (DKG) protocol is a fundamental component of various applications that prioritize data privacy and security. It ensures the secure generation of asymmetric cryptographic keys in a distributed manner, preventing any single entity from having complete access to sensitive key information. Some of the applications that can benefit from DKG include:

1. **Private Voting**: DKG can be employed to create secure voting systems where individual votes remain confidential, preventing unauthorized access or manipulation.

2. **Private Funding**: Applications dealing with financial transactions and investments can use DKG to secure sensitive financial data.

3. **Social Recovery**: DKG can aid in securely recovering lost or forgotten passwords or keys without compromising user data privacy.

## Demo (EVM):
<a target="_blank" href="https://drive.google.com/file/d/1BLMdaG_SfAEusQINV2mpU4v390Zj6Yhd/view">Public Folder</a>

## Architecture

### Desired Properties:
The DKG protocol implementation requires three critical properties:
- **Homomorphism**: The ability to perform operations over ciphertexts, allowing value commitments from multiple participants to be combined into batched values.
- **Verifiability**: Verification of the correctness of the encryption process, ensuring that a given value was encrypted accurately to a specific ciphertext.
- **Robustness**: The system should withstand the failure of up to `n−t` validators, who may either fail to provide a decryption share or provide an invalid decryption share.

### Workflow and Actors:

<img src="https://i.ibb.co/Q99wg06/usecase1.png">

1. **Chairperson**: The Chairperson initiates and manages the DKG council. This council comprises committee members responsible for the DKG protocol. The Chairperson defines parameters, including `t` (the number of committee members) and `n` (the minimum required active committee members to run the protocol).
2. **Committee Member**: Dedicated members who serve the community by participating in the DKG mechanism. They contribute random sources for key generation and are essential for decryption processes. In a Threshold DKG scheme, trust relies on `t` out of `n` committee members.
3. **Requester**: An individual or entity seeking to use the DKG protocol to secure their data. Requesters can request the public key generated by the council for data encryption.

<img src="https://i.ibb.co/hdVxqPB/workflow1.png">


### Contracts
![](https://i.ibb.co/XzNhhKP/contract1.png)
![](https://i.ibb.co/WBVCYHr/contract2.png)

- **Council Manager**: This smart contract manages all councils, storing data related to each council, including the Chairperson responsible for it and the committee members associated with it.

- **Council**: Requesters interact with this contract to request DKG services, while committee members use it to upload their contributions for the protocol. It serves as a hub for all DKG-related interactions.

## Future Work

1. **Business Model**: Implementing a payment system where requesters pay for the usage of keys generated through the DKG protocol. This can enable sustainability and incentivize participation.

2. **Automation**: Exploring automation possibilities, similar to Chainlink, to streamline and enhance the efficiency of the DKG protocol. This could include automating key generation processes and interactions with the smart contract.

In summary, Distributed Key Generation (DKG) serves as a critical component in enhancing privacy and security in various applications. Its core properties of homomorphism, verifiability, and robustness ensure the secure generation and use of cryptographic keys, enabling applications such as private voting, private funding, and social recovery to thrive while preserving user data and decision confidentiality. As DKG continues to evolve, future work can focus on establishing sustainable business models and further automating the protocol to improve its efficiency and usability.
