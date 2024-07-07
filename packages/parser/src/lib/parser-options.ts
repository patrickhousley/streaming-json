export interface ParserOptions {
  /**
   * Number of bytes of data to read at a time. Should
   * be a multiple of 8 since the parser works on Uint8Array
   * buffer.
   */
  bufferSize: number
}
