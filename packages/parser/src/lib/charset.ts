export enum AllowedWhitespaceToken {
  SPACE = 0x20,
  HORIZONTAL_TAB = 0x9, // "\t"
  LINE_FEED = 0xa, // "\n"
  CARRIAGE_RETURN = 0xd, // "\r"
}

export enum Token {
  // Array tokens
  LEFT_SQUARE_BRACKET = 0x5b, // [
  RIGHT_SQUARE_BRACKET = 0x5d, // ]

  // Object tokens
  LEFT_CURLY_BRACKET = 0x7b, // {
  RIGHT_CURLY_BRACKET = 0x7d, // }

  // Value separation tokens
  COLON = 0x3a, // :
  COMMA = 0x2c, // ,

  // String tokens
  DOUBLE_QUOTE = 0x22, // "
  BACKWARD_SLASH = 0x5c, // \
}

export enum NumberValueLiteralToken {
  ZERO = 0x30, // 0
  ONE = 0x31, // 1
  TWO = 0x32, // 2
  THREE = 0x33, // 3
  FOUR = 0x34, // 4
  FIVE = 0x35, // 5
  SIX = 0x36, // 6
  SEVEN = 0x37, // 7
  EIGHT = 0x38, // 8
  NINE = 0x39, // 9
  PERIOD = 0x2e, // 0
}

export enum NullValueLiteralToken {
  N = 0x6e,
  U = 0x75,
  L = 0x6c,
}

export enum TrueValueLiteralToken {
  T = 0x74,
  R = 0x72,
  U = 0x75,
  E = 0x65,
}

export enum FalseValueLiteralToken {
  F = 0x66,
  A = 0x61,
  L = 0x6c,
  S = 0x73,
  E = 0x65,
}
