import * as fs from 'node:fs'
import { faker } from '@faker-js/faker'
import { FileParser } from './file-parser'
import { AllowedWhitespaceToken, Token } from './charset'
import { ParserError } from './parser-error'
import { rejects } from 'node:assert'

afterEach(() => {
  jest.clearAllMocks()
  jest.resetAllMocks()
})

it('should stop processing when passed true in subsequent call to next', async () => {
  const fileContents = `"${faker.lorem.paragraph()}"`
  const filePath = '/foo.json'
  const buffer = new TextEncoder().encode(fileContents)
  mockFile(filePath, buffer)
  const parser = new FileParser(filePath)
  const iterator = parser.parse()

  await expect(iterator.next()).resolves.toEqual(
    expect.objectContaining({
      done: false,
    }),
  )
  await expect(iterator.next(true)).resolves.toEqual({
    done: true,
  })
})

it('should stop processing when the end of the input is reached', async () => {
  const fileContents = '""'
  const filePath = '/foo.json'
  const buffer = new TextEncoder().encode(fileContents)
  mockFile(filePath, buffer)
  const parser = new FileParser(filePath)
  const iterator = parser.parse()

  await expect(iterator.next()).resolves.toEqual(
    expect.objectContaining({
      done: false,
    }),
  )
  await expect(iterator.next()).resolves.toEqual(
    expect.objectContaining({
      done: false,
    }),
  )
  await expect(iterator.next()).resolves.toEqual({
    done: true,
  })
})

it('should read the input in chunks per the buffer size', async () => {
  const fileContents = `"${faker.lorem.paragraph()}"`
  const filePath = '/foo.json'
  const buffer = new TextEncoder().encode(fileContents)
  mockFile(filePath, buffer)
  const parser = new FileParser(filePath, { bufferSize: 8 })

  jest.spyOn(buffer, 'slice')

  const iterator = parser.parse()
  let next = await iterator.next()
  while (!next.done) {
    next = await iterator.next()
  }

  let loopCount = (fileContents.length + 2) / 8
  if (loopCount % 1 !== 0) {
    loopCount = Math.floor(loopCount) + 1
  }

  for (let index = 0; index < Math.floor(fileContents.length / 8) + 1; index++) {
    expect(buffer.slice).toHaveBeenNthCalledWith(index + 1, index * 8, index * 8 + 8)
  }
})

it('should be able to restart parsing', async () => {
  const fileContents = `"${faker.lorem.paragraph()}"`
  const filePath = '/foo.json'
  const buffer = new TextEncoder().encode(fileContents)
  mockFile(filePath, buffer)
  const parser = new FileParser(filePath, { bufferSize: 8 })

  const firstIterator = parser.parse()
  const firstEvent = await firstIterator.next()
  await firstIterator.next(true)

  const secondIterator = parser.parse()
  const secondEvent = await secondIterator.next()
  await secondIterator.next(true)

  expect(firstEvent).toEqual(secondEvent)
})

it('should close the file when parsing forcefully stopped', async () => {
  const fileContents = `"${faker.lorem.paragraph()}"`
  const filePath = '/foo.json'
  const buffer = new TextEncoder().encode(fileContents)
  const fileDescriptor = mockFile(filePath, buffer)
  const parser = new FileParser(filePath)
  const iterator = parser.parse()

  await iterator.next()
  await iterator.next(true)

  expect(fs.close).toHaveBeenCalledWith(fileDescriptor, expect.any(Function))
})

it('should close the file when parsing finished', async () => {
  const fileContents = `"${faker.lorem.paragraph()}"`
  const filePath = '/foo.json'
  const buffer = new TextEncoder().encode(fileContents)
  const fileDescriptor = mockFile(filePath, buffer)
  const parser = new FileParser(filePath)
  const iterator = parser.parse()

  let next = await iterator.next()
  while (!next.done) {
    next = await iterator.next(true)
  }

  expect(fs.close).toHaveBeenCalledWith(fileDescriptor, expect.any(Function))
})

describe('file system exception handling', () => {
  it('should raise exception when file opening fails', async () => {
    const filePath = '/foo.json'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jest.spyOn(fs, 'open').mockImplementation((...args: any[]) => {
      args[2](new Error(faker.lorem.paragraph()))
    })

    const parser = new FileParser(filePath)
    const iterator = parser.parse()

    await expect(iterator.next()).rejects.toThrow(ParserError)
  })

  it('should raise exception when file opening fails', async () => {
    const fileContents = `""`
    const filePath = '/foo.json'
    const buffer = new TextEncoder().encode(fileContents)
    const fileDescriptor = mockFile(filePath, buffer)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jest.spyOn(fs, 'read').mockImplementation((...args: any[]) => {
      args[2](new Error(faker.lorem.paragraph()))
    })

    const parser = new FileParser(filePath)
    const iterator = parser.parse()

    await expect(iterator.next()).rejects.toThrow(ParserError)
    expect(fs.close).toHaveBeenCalledWith(fileDescriptor, expect.any(Function))
  })

  it('should raise exception when file opening fails', async () => {
    const fileContents = `""`
    const filePath = '/foo.json'
    const buffer = new TextEncoder().encode(fileContents)
    const fileDescriptor = mockFile(filePath, buffer)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jest.spyOn(fs, 'close').mockImplementation((...args: any[]) => {
      args[1](new Error(faker.lorem.paragraph()))
    })

    const parser = new FileParser(filePath)
    const iterator = parser.parse()
    await iterator.next()
    await iterator.next()

    await expect(iterator.next()).rejects.toThrow(ParserError)
    expect(fs.close).toHaveBeenCalledWith(fileDescriptor, expect.any(Function))
  })
})

describe('JSON opening', () => {
  it('should throw an error if the JSON is empty', async () => {
    const fileContents = ''
    const filePath = '/foo.json'
    const buffer = new TextEncoder().encode(fileContents)
    mockFile(filePath, buffer)
    const parser = new FileParser(filePath)
    const iterator = parser.parse()

    await expect(iterator.next()).rejects.toThrow(new ParserError('Unexpected end of JSON input'))
  })

  it.each([
    AllowedWhitespaceToken.SPACE,
    AllowedWhitespaceToken.HORIZONTAL_TAB,
    AllowedWhitespaceToken.LINE_FEED,
    AllowedWhitespaceToken.CARRIAGE_RETURN,
  ])('should throw error if input is just whitespace character %s', async (input) => {
    const fileContents = String.fromCharCode(input)
    const filePath = '/foo.json'
    const buffer = new TextEncoder().encode(fileContents)
    mockFile(filePath, buffer)
    const parser = new FileParser(filePath)
    const iterator = parser.parse()

    await expect(iterator.next()).rejects.toThrow(new ParserError('Unexpected end of JSON input'))
  })

  it('should produce opening object event', async () => {
    const fileContents =
      String.fromCharCode(AllowedWhitespaceToken.SPACE) +
      String.fromCharCode(AllowedWhitespaceToken.HORIZONTAL_TAB) +
      String.fromCharCode(AllowedWhitespaceToken.LINE_FEED) +
      String.fromCharCode(AllowedWhitespaceToken.CARRIAGE_RETURN) +
      '{'
    const filePath = '/foo.json'
    const buffer = new TextEncoder().encode(fileContents)
    mockFile(filePath, buffer)
    const parser = new FileParser(filePath)
    const iterator = parser.parse()

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'OBJECT_START' },
    })
  })

  it('should produce opening array event', async () => {
    const fileContents =
      String.fromCharCode(AllowedWhitespaceToken.SPACE) +
      String.fromCharCode(AllowedWhitespaceToken.HORIZONTAL_TAB) +
      String.fromCharCode(AllowedWhitespaceToken.LINE_FEED) +
      String.fromCharCode(AllowedWhitespaceToken.CARRIAGE_RETURN) +
      '['
    const filePath = '/foo.json'
    const buffer = new TextEncoder().encode(fileContents)
    mockFile(filePath, buffer)
    const parser = new FileParser(filePath)
    const iterator = parser.parse()

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'ARRAY_START' },
    })
  })

  it('should produce opening string literal event', async () => {
    const fileContents =
      String.fromCharCode(AllowedWhitespaceToken.SPACE) +
      String.fromCharCode(AllowedWhitespaceToken.HORIZONTAL_TAB) +
      String.fromCharCode(AllowedWhitespaceToken.LINE_FEED) +
      String.fromCharCode(AllowedWhitespaceToken.CARRIAGE_RETURN) +
      '"'
    const filePath = '/foo.json'
    const buffer = new TextEncoder().encode(fileContents)
    mockFile(filePath, buffer)
    const parser = new FileParser(filePath)
    const iterator = parser.parse()

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'STRING_START' },
    })
  })

  it.each(['.', 'a', '$'])('should throw an error when opening character is invalid %s', async (input) => {
    const fileContents =
      String.fromCharCode(AllowedWhitespaceToken.SPACE) +
      String.fromCharCode(AllowedWhitespaceToken.HORIZONTAL_TAB) +
      String.fromCharCode(AllowedWhitespaceToken.LINE_FEED) +
      String.fromCharCode(AllowedWhitespaceToken.CARRIAGE_RETURN) +
      input
    const filePath = '/foo.json'
    const buffer = new TextEncoder().encode(fileContents)
    mockFile(filePath, buffer)
    const parser = new FileParser(filePath)
    const iterator = parser.parse()

    await expect(iterator.next()).rejects.toThrow(
      new ParserError(`Unexpected token '${input}' at position 4`, new Error(`Unexpected token '${input}'`)),
    )
  })
})

describe('strings', () => {
  it('should properly close a string literal', async () => {
    const fileContents = `""`
    const filePath = '/foo.json'
    const buffer = new TextEncoder().encode(fileContents)
    mockFile(filePath, buffer)
    const parser = new FileParser(filePath)
    const iterator = parser.parse()

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'STRING_START' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'STRING_END' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: true,
    })
  })

  it('should parse the string literal', async () => {
    const input = faker.lorem.word()
    const fileContents = `"${input}"`
    const filePath = '/foo.json'
    const buffer = new TextEncoder().encode(fileContents)
    mockFile(filePath, buffer)
    const parser = new FileParser(filePath)
    const iterator = parser.parse()

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'STRING_START' },
    })
    for (let index = 0; index < input.length; index++) {
      await expect(iterator.next()).resolves.toEqual({
        done: false,
        value: {
          event: 'CHARACTER',
          charCode: input.charCodeAt(index),
        },
      })
    }
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'STRING_END' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: true,
    })
  })

  it.each(['[', '{', '"', 'a', 1, '.', '$'])(
    'should throw an error if string literal already closed %s',
    async (input) => {
      const fileContents = `""${input}`
      const filePath = '/foo.json'
      const buffer = new TextEncoder().encode(fileContents)
      mockFile(filePath, buffer)
      const parser = new FileParser(filePath)
      const iterator = parser.parse()

      await expect(iterator.next()).resolves.toEqual({
        done: false,
        value: { event: 'STRING_START' },
      })
      await expect(iterator.next()).resolves.toEqual({
        done: false,
        value: { event: 'STRING_END' },
      })

      await expect(iterator.next()).rejects.toThrow(
        new ParserError(`Unexpected token '${input}' at position 2`, new Error(`Unexpected token '${input}'`)),
      )
    },
  )

  it('should throw an error when string literal is not closed', async () => {
    const fileContents = '"foo'
    const filePath = '/foo.json'
    const buffer = new TextEncoder().encode(fileContents)
    mockFile(filePath, buffer)
    const parser = new FileParser(filePath)
    const iterator = parser.parse()

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'STRING_START' },
    })
    await expect(iterator.next()).resolves.toEqual(
      expect.objectContaining({
        done: false,
      }),
    )
    await expect(iterator.next()).resolves.toEqual(
      expect.objectContaining({
        done: false,
      }),
    )
    await expect(iterator.next()).resolves.toEqual(
      expect.objectContaining({
        done: false,
      }),
    )

    await expect(iterator.next()).rejects.toThrow(
      new ParserError(`Unterminated string in JSON at position 4`, new Error(`Unterminated string in JSON`)),
    )
  })

  it('should support control characters in strings %s', async () => {
    const input = '[]{}:,"\\'
    const expected = [91, 93, 123, 125, 58, 44, 92, 34, 92, 92]
    const fileContents = JSON.stringify(input)
    const filePath = '/foo.json'
    const buffer = new TextEncoder().encode(fileContents)
    mockFile(filePath, buffer)
    const parser = new FileParser(filePath)
    const iterator = parser.parse()

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'STRING_START' },
    })
    for (let index = 0; index < expected.length; index++) {
      await expect(iterator.next()).resolves.toEqual({
        done: false,
        value: {
          event: 'CHARACTER',
          charCode: expected[index],
        },
      })
    }
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'STRING_END' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: true,
    })
  })
})

describe('value literals', () => {
  it('should parse the false literal', async () => {
    const fileContents = 'false'
    const filePath = '/foo.json'
    const buffer = new TextEncoder().encode(fileContents)
    mockFile(filePath, buffer)
    const parser = new FileParser(filePath)
    const iterator = parser.parse()

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'VALUE_LITERAL_START',
        charCode: 'f'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'a'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'l'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 's'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'e'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'VALUE_LITERAL_END' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: true,
    })
  })

  it('should parse the true literal', async () => {
    const fileContents = 'true'
    const filePath = '/foo.json'
    const buffer = new TextEncoder().encode(fileContents)
    mockFile(filePath, buffer)
    const parser = new FileParser(filePath)
    const iterator = parser.parse()

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'VALUE_LITERAL_START',
        charCode: 't'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'r'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'u'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'e'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'VALUE_LITERAL_END' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: true,
    })
  })

  it('should parse the null literal', async () => {
    const fileContents = 'null'
    const filePath = '/foo.json'
    const buffer = new TextEncoder().encode(fileContents)
    mockFile(filePath, buffer)
    const parser = new FileParser(filePath)
    const iterator = parser.parse()

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'VALUE_LITERAL_START',
        charCode: 'n'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'u'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'l'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'l'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'VALUE_LITERAL_END' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: true,
    })
  })

  it('should parse number value literal', async () => {
    const fileContents = '12.34'
    const filePath = '/foo.json'
    const buffer = new TextEncoder().encode(fileContents)
    mockFile(filePath, buffer)
    const parser = new FileParser(filePath)
    const iterator = parser.parse()

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'VALUE_LITERAL_START',
        charCode: '1'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: '2'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: '.'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: '3'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: '4'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'VALUE_LITERAL_END' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: true,
    })
  })
})

describe('arrays', () => {
  it('should parse the opening and closing of arrays', async () => {
    const fileContents = '[[]]'
    const filePath = '/foo.json'
    const buffer = new TextEncoder().encode(fileContents)
    mockFile(filePath, buffer)
    const parser = new FileParser(filePath)
    const iterator = parser.parse()

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'ARRAY_START' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'ARRAY_START' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'ARRAY_END' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'ARRAY_END' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: true,
    })
  })

  it('should parse value literals inside array', async () => {
    const fileContents = '[true, false, null, 12.34]'
    const filePath = '/foo.json'
    const buffer = new TextEncoder().encode(fileContents)
    mockFile(filePath, buffer)
    const parser = new FileParser(filePath)
    const iterator = parser.parse()

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'ARRAY_START' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'VALUE_LITERAL_START',
        charCode: 't'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'r'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'u'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'e'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'VALUE_LITERAL_END' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'PROPERTY_SPLIT' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'VALUE_LITERAL_START',
        charCode: 'f'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'a'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'l'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 's'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'e'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'VALUE_LITERAL_END' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'PROPERTY_SPLIT' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'VALUE_LITERAL_START',
        charCode: 'n'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'u'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'l'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'l'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'VALUE_LITERAL_END' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'PROPERTY_SPLIT' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'VALUE_LITERAL_START',
        charCode: '1'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: '2'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: '.'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: '3'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: '4'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'VALUE_LITERAL_END' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'ARRAY_END' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: true,
    })
  })

  it('should yield correct events for array of strings', async () => {
    const input = new Array(faker.number.int({ min: 5, max: 10 })).fill(() => null).map(() => faker.lorem.word())
    const fileContents = JSON.stringify(input)
    const filePath = '/foo.json'
    const buffer = new TextEncoder().encode(fileContents)
    mockFile(filePath, buffer)
    const parser = new FileParser(filePath)
    const iterator = parser.parse()

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'ARRAY_START' },
    })
    for (let inputIndex = 0; inputIndex < input.length; inputIndex++) {
      await expect(iterator.next()).resolves.toEqual({
        done: false,
        value: { event: 'STRING_START' },
      })

      const word = input[inputIndex]
      for (let wordIndex = 0; wordIndex < word.length; wordIndex++) {
        await expect(iterator.next()).resolves.toEqual({
          done: false,
          value: {
            event: 'CHARACTER',
            charCode: word.charCodeAt(wordIndex),
          },
        })
      }

      await expect(iterator.next()).resolves.toEqual({
        done: false,
        value: { event: 'STRING_END' },
      })

      if (inputIndex + 1 < input.length) {
        await expect(iterator.next()).resolves.toEqual({
          done: false,
          value: { event: 'PROPERTY_SPLIT' },
        })
      }
    }
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'ARRAY_END' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: true,
    })
  })

  it('should yield correct events for array of value literals as strings', async () => {
    const input = ['true', 'false', 'null', '12.34']
    const fileContents = JSON.stringify(input)
    const filePath = '/foo.json'
    const buffer = new TextEncoder().encode(fileContents)
    mockFile(filePath, buffer)
    const parser = new FileParser(filePath)
    const iterator = parser.parse()

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'ARRAY_START' },
    })
    for (let inputIndex = 0; inputIndex < input.length; inputIndex++) {
      await expect(iterator.next()).resolves.toEqual({
        done: false,
        value: { event: 'STRING_START' },
      })

      const word = input[inputIndex]
      for (let wordIndex = 0; wordIndex < word.length; wordIndex++) {
        await expect(iterator.next()).resolves.toEqual({
          done: false,
          value: {
            event: 'CHARACTER',
            charCode: word.charCodeAt(wordIndex),
          },
        })
      }

      await expect(iterator.next()).resolves.toEqual({
        done: false,
        value: { event: 'STRING_END' },
      })

      if (inputIndex + 1 < input.length) {
        await expect(iterator.next()).resolves.toEqual({
          done: false,
          value: { event: 'PROPERTY_SPLIT' },
        })
      }
    }
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'ARRAY_END' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: true,
    })
  })

  it('should throw an error when an incomplete array is not closed by end of input', async () => {
    const fileContents = '['
    const filePath = '/foo.json'
    const buffer = new TextEncoder().encode(fileContents)
    mockFile(filePath, buffer)
    const parser = new FileParser(filePath)
    const iterator = parser.parse()

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'ARRAY_START',
      },
    })

    await expect(iterator.next()).rejects.toThrow(new ParserError('Unexpected end of JSON input'))
  })

  it('should throw an error when an string is not closed before end of array', async () => {
    const fileContents = '["foo]'
    const filePath = '/foo.json'
    const buffer = new TextEncoder().encode(fileContents)
    mockFile(filePath, buffer)
    const parser = new FileParser(filePath)
    const iterator = parser.parse()

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'ARRAY_START',
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'STRING_START',
      },
    })

    await iterator.next()
    await iterator.next()
    await iterator.next()
    await iterator.next()

    await expect(iterator.next()).rejects.toThrow(
      new ParserError('Unterminated string in JSON at position 6', new Error('Unterminated string in JSON')),
    )
  })

  it.each(['.', 'a', '$'])('should throw an error when opening character is invalid %s', async (input) => {
    const fileContents = `[${input}]`
    const filePath = '/foo.json'
    const buffer = new TextEncoder().encode(fileContents)
    mockFile(filePath, buffer)
    const parser = new FileParser(filePath)
    const iterator = parser.parse()

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'ARRAY_START',
      },
    })

    await expect(iterator.next()).rejects.toThrow(
      new ParserError(`Unexpected token '${input}' at position 1`, new Error(`Unexpected token '${input}'`)),
    )
  })

  it('should support control characters in strings %s', async () => {
    const input = '[]{}:,"\\'
    const expected = [91, 93, 123, 125, 58, 44, 92, 34, 92, 92]
    const fileContents = JSON.stringify([input])
    const filePath = '/foo.json'
    const buffer = new TextEncoder().encode(fileContents)
    mockFile(filePath, buffer)
    const parser = new FileParser(filePath)
    const iterator = parser.parse()

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'ARRAY_START' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'STRING_START' },
    })
    for (let index = 0; index < expected.length; index++) {
      await expect(iterator.next()).resolves.toEqual({
        done: false,
        value: {
          event: 'CHARACTER',
          charCode: expected[index],
        },
      })
    }
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'STRING_END' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'ARRAY_END' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: true,
    })
  })
})

describe('objects', () => {
  it('should parse the opening and closing of object', async () => {
    const fileContents = '{}'
    const filePath = '/foo.json'
    const buffer = new TextEncoder().encode(fileContents)
    mockFile(filePath, buffer)
    const parser = new FileParser(filePath)
    const iterator = parser.parse()

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'OBJECT_START' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'OBJECT_END' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: true,
    })
  })

  it('should parse the opening and closing of arrays of objects', async () => {
    const fileContents = '[{}, {}]'
    const filePath = '/foo.json'
    const buffer = new TextEncoder().encode(fileContents)
    mockFile(filePath, buffer)
    const parser = new FileParser(filePath)
    const iterator = parser.parse()

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'ARRAY_START' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'OBJECT_START' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'OBJECT_END' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'PROPERTY_SPLIT' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'OBJECT_START' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'OBJECT_END' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'ARRAY_END' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: true,
    })
  })

  it('should parse the properties of objects', async () => {
    const fileContents = '{"foo": "bar", "biz": [], "baz": false}'
    const filePath = '/foo.json'
    const buffer = new TextEncoder().encode(fileContents)
    mockFile(filePath, buffer)
    const parser = new FileParser(filePath)
    const iterator = parser.parse()

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'OBJECT_START' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'STRING_START' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'f'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'o'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'o'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'STRING_END' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'KEY_VALUE_SPLIT' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'STRING_START' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'b'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'a'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'r'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'STRING_END' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'PROPERTY_SPLIT' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'STRING_START' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'b'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'i'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'z'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'STRING_END' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'KEY_VALUE_SPLIT' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'ARRAY_START' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'ARRAY_END' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'PROPERTY_SPLIT' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'STRING_START' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'b'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'a'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'z'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'STRING_END' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'KEY_VALUE_SPLIT' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'VALUE_LITERAL_START',
        charCode: 'f'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'a'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'l'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 's'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'e'.charCodeAt(0),
      },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'VALUE_LITERAL_END' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'OBJECT_END' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: true,
    })
  })

  it('should throw an error when object is not closed by end of input', async () => {
    const fileContents = '{'
    const filePath = '/foo.json'
    const buffer = new TextEncoder().encode(fileContents)
    mockFile(filePath, buffer)
    const parser = new FileParser(filePath)
    const iterator = parser.parse()

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'OBJECT_START' },
    })

    await expect(iterator.next()).rejects.toThrow(new ParserError('Unexpected end of JSON input'))
  })

  it('should throw an error when object is not closed by end of array', async () => {
    const fileContents = '[{]'
    const filePath = '/foo.json'
    const buffer = new TextEncoder().encode(fileContents)
    mockFile(filePath, buffer)
    const parser = new FileParser(filePath)
    const iterator = parser.parse()

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'ARRAY_START' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'OBJECT_START' },
    })

    await expect(iterator.next()).rejects.toThrow(
      new ParserError(
        "Expected property name or '}' in JSON at position 2",
        new Error("Expected property name or '}' in JSON"),
      ),
    )
  })

  it.each(['1', '.', 'a', '$'])(
    'should throw an error when object property does not start with a double quote %s',
    async (input) => {
      const fileContents = `{${input}: ${input}}`
      const filePath = '/foo.json'
      const buffer = new TextEncoder().encode(fileContents)
      mockFile(filePath, buffer)
      const parser = new FileParser(filePath)
      const iterator = parser.parse()

      await expect(iterator.next()).resolves.toEqual({
        done: false,
        value: { event: 'OBJECT_START' },
      })

      await expect(iterator.next()).rejects.toThrow(
        new ParserError(
          "Expected property name or '}' in JSON at position 1",
          new Error("Expected property name or '}' in JSON"),
        ),
      )
    },
  )

  it('should support control characters in strings %s', async () => {
    const input = '[]{}:,"\\'
    const expected = [91, 93, 123, 125, 58, 44, 92, 34, 92, 92]
    const fileContents = JSON.stringify({ foo: input })
    const filePath = '/foo.json'
    const buffer = new TextEncoder().encode(fileContents)
    mockFile(filePath, buffer)
    const parser = new FileParser(filePath)
    const iterator = parser.parse()

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'OBJECT_START' },
    })

    await iterator.next()
    await iterator.next()
    await iterator.next()
    await iterator.next()
    await iterator.next()
    await iterator.next()

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'STRING_START' },
    })
    for (let index = 0; index < expected.length; index++) {
      await expect(iterator.next()).resolves.toEqual({
        done: false,
        value: {
          event: 'CHARACTER',
          charCode: expected[index],
        },
      })
    }
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'STRING_END' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { event: 'OBJECT_END' },
    })
    await expect(iterator.next()).resolves.toEqual({
      done: true,
    })
  })
})

function mockFile(filePath: fs.PathLike, contents: Uint8Array): number {
  const fileDescriptor = faker.number.int()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jest.spyOn(fs, 'open').mockImplementation((...args: any[]) => {
    expect(filePath).toEqual(args[0])
    args[2](null, fileDescriptor)
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jest.spyOn(fs, 'read').mockImplementation((...args: any[]) => {
    expect(args[0]).toEqual(fileDescriptor)
    const buffer = contents.slice(args[1].offset, args[1].offset + args[1].length)
    args[2](null, buffer.length, buffer)
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jest.spyOn(fs, 'close').mockImplementation((...args: any[]) => {
    expect(args[0]).toEqual(fileDescriptor)
    args[1]()
  })

  return fileDescriptor
}
