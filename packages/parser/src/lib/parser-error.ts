export class ParserError extends Error {
  override readonly name = 'ParserError'
  public readonly cause?: Error

  constructor(message: string, cause?: Error) {
    super(message)
    this.cause = cause
  }
}
