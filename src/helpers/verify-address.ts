import { MidnightBech32m, UnshieldedAddress } from "@midnight-ntwrk/wallet-sdk-address-format";

export class InvalidAddressError extends Error {
  constructor(public readonly address: string) {
    super("Provided address is invalid");
    this.name = "InvalidAddressError";
  }
}

const isValidBech32mAddress = (value: string, networkId: string | undefined): boolean => {
  try {
    if (!networkId) {
      throw new Error("No network Id found.");
    }
    const parsed = MidnightBech32m.parse(value);

    UnshieldedAddress.codec.decode(networkId, parsed);

    return true;
  } catch {
    return false;
  }
};

export const verifyAddress = ({
  unshieldedAddress,
  networkId,
}: {
  unshieldedAddress: string;
  networkId: string | undefined;
}): void => {
  if (!networkId) {
    throw new Error("No network id found.");
  }
  const bechValid = isValidBech32mAddress(unshieldedAddress, networkId);

  if (!bechValid) {
    throw new InvalidAddressError(unshieldedAddress);
  }
};
