import { faker } from '@faker-js/faker'
import { MemoryParser } from './memory-parser'
import { AllowedWhitespaceToken, Token } from './charset'
import { ParserError } from './parser-error'

it('should stop processing when passed true in subsequent call to next', () => {
  const parser = new MemoryParser('"foobar"')
  const iterator = parser.read()

  expect(iterator.next()).toEqual(
    expect.objectContaining({
      done: false,
    }),
  )
  expect(iterator.next(true)).toEqual({
    done: true,
  })
})

it('should stop processing when the end of the input is reached', () => {
  const parser = new MemoryParser('""')
  const iterator = parser.read()

  expect(iterator.next()).toEqual(
    expect.objectContaining({
      done: false,
    }),
  )
  expect(iterator.next()).toEqual(
    expect.objectContaining({
      done: false,
    }),
  )
  expect(iterator.next()).toEqual({
    done: true,
  })
})

describe('JSON opening', () => {
  it('should throw an error if the JSON is empty', () => {
    const parser = new MemoryParser('')
    const iterator = parser.read()

    try {
      expect(iterator.next()).toThrow()
    } catch (err) {
      expect(err).toBeInstanceOf(ParserError)
      expect((err as ParserError).message).toEqual('Unexpected end of JSON input')
    }
  })

  it.each([
    AllowedWhitespaceToken.SPACE,
    AllowedWhitespaceToken.HORIZONTAL_TAB,
    AllowedWhitespaceToken.LINE_FEED,
    AllowedWhitespaceToken.CARRIAGE_RETURN,
  ])('should throw error if input is just whitespace character %s', (input) => {
    const parser = new MemoryParser(String.fromCharCode(input))
    const iterator = parser.read()

    try {
      expect(iterator.next()).toThrow()
    } catch (err) {
      expect(err).toBeInstanceOf(ParserError)
      expect((err as ParserError).message).toEqual('Unexpected end of JSON input')
    }
  })

  it('should produce opening object event', () => {
    const parser = new MemoryParser(
      String.fromCharCode(AllowedWhitespaceToken.SPACE) +
        String.fromCharCode(AllowedWhitespaceToken.HORIZONTAL_TAB) +
        String.fromCharCode(AllowedWhitespaceToken.LINE_FEED) +
        String.fromCharCode(AllowedWhitespaceToken.CARRIAGE_RETURN) +
        '{',
    )
    const iterator = parser.read()

    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'OBJECT_START' },
    })
  })

  it('should produce opening array event', () => {
    const parser = new MemoryParser(
      String.fromCharCode(AllowedWhitespaceToken.SPACE) +
        String.fromCharCode(AllowedWhitespaceToken.HORIZONTAL_TAB) +
        String.fromCharCode(AllowedWhitespaceToken.LINE_FEED) +
        String.fromCharCode(AllowedWhitespaceToken.CARRIAGE_RETURN) +
        '[',
    )
    const iterator = parser.read()

    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'ARRAY_START' },
    })
  })

  it('should produce opening string literal event', () => {
    const parser = new MemoryParser(
      String.fromCharCode(AllowedWhitespaceToken.SPACE) +
        String.fromCharCode(AllowedWhitespaceToken.HORIZONTAL_TAB) +
        String.fromCharCode(AllowedWhitespaceToken.LINE_FEED) +
        String.fromCharCode(AllowedWhitespaceToken.CARRIAGE_RETURN) +
        '"',
    )
    const iterator = parser.read()

    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'STRING_START' },
    })
  })

  it.each(['.', 'a', '$'])('should throw an error when opening character is invalid %s', (input) => {
    const parser = new MemoryParser(
      String.fromCharCode(AllowedWhitespaceToken.SPACE) +
        String.fromCharCode(AllowedWhitespaceToken.HORIZONTAL_TAB) +
        String.fromCharCode(AllowedWhitespaceToken.LINE_FEED) +
        String.fromCharCode(AllowedWhitespaceToken.CARRIAGE_RETURN) +
        input,
    )
    const iterator = parser.read()

    try {
      expect(iterator.next()).toThrow()
    } catch (err) {
      expect(err).toBeInstanceOf(ParserError)
      expect((err as ParserError).message).toEqual(`Unexpected token '${input}' at position 4`)
    }
  })
})

describe('strings', () => {
  it('should properly close a string literal', () => {
    const parser = new MemoryParser('""')
    const iterator = parser.read()

    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'STRING_START' },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'STRING_END' },
    })
    expect(iterator.next()).toEqual({
      done: true,
    })
  })

  it('should parse the string literal', () => {
    const input = faker.lorem.word()
    const parser = new MemoryParser(`"${input}"`)
    const iterator = parser.read()

    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'STRING_START' },
    })
    for (let index = 0; index < input.length; index++) {
      expect(iterator.next()).toEqual({
        done: false,
        value: {
          event: 'CHARACTER',
          charCode: input.charCodeAt(index),
        },
      })
    }
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'STRING_END' },
    })
    expect(iterator.next()).toEqual({
      done: true,
    })
  })

  it.each(['[', '{', '"', 'a', 1, '.', '$'])('should throw an error if string literal already closed %s', (input) => {
    const parser = new MemoryParser(`""${input}`)
    const iterator = parser.read()

    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'STRING_START' },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'STRING_END' },
    })

    try {
      expect(iterator.next()).toThrow()
    } catch (err) {
      expect(err).toBeInstanceOf(ParserError)
      expect((err as ParserError).message).toEqual(`Unexpected token '${input}' at position 2`)
    }
  })

  it('should throw an error when string literal is not closed', () => {
    const parser = new MemoryParser(`"foo`)
    const iterator = parser.read()

    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'STRING_START' },
    })
    expect(iterator.next()).toEqual(
      expect.objectContaining({
        done: false,
      }),
    )
    expect(iterator.next()).toEqual(
      expect.objectContaining({
        done: false,
      }),
    )
    expect(iterator.next()).toEqual(
      expect.objectContaining({
        done: false,
      }),
    )

    try {
      expect(iterator.next()).toThrow()
    } catch (err) {
      expect(err).toBeInstanceOf(ParserError)
      expect((err as ParserError).message).toEqual(`Unterminated string in JSON at position 4`)
    }
  })

  it('should support control characters in strings %s', () => {
    const input = '[]{}:,"\\'
    const expected = [91, 93, 123, 125, 58, 44, 92, 34, 92, 92]
    const parser = new MemoryParser(JSON.stringify(input))
    const iterator = parser.read()

    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'STRING_START' },
    })
    for (let index = 0; index < expected.length; index++) {
      expect(iterator.next()).toEqual({
        done: false,
        value: {
          event: 'CHARACTER',
          charCode: expected[index],
        },
      })
    }
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'STRING_END' },
    })
    expect(iterator.next()).toEqual({
      done: true,
    })
  })
})

describe('value literals', () => {
  it('should parse the false literal', () => {
    const parser = new MemoryParser('false')
    const iterator = parser.read()

    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'VALUE_LITERAL_START',
        charCode: 'f'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'a'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'l'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 's'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'e'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'VALUE_LITERAL_END' },
    })
    expect(iterator.next()).toEqual({
      done: true,
    })
  })

  it('should parse the true literal', () => {
    const parser = new MemoryParser('true')
    const iterator = parser.read()

    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'VALUE_LITERAL_START',
        charCode: 't'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'r'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'u'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'e'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'VALUE_LITERAL_END' },
    })
    expect(iterator.next()).toEqual({
      done: true,
    })
  })

  it('should parse the null literal', () => {
    const parser = new MemoryParser('null')
    const iterator = parser.read()

    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'VALUE_LITERAL_START',
        charCode: 'n'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'u'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'l'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'l'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'VALUE_LITERAL_END' },
    })
    expect(iterator.next()).toEqual({
      done: true,
    })
  })

  it('should parse number value literal', () => {
    const parser = new MemoryParser('12.34')
    const iterator = parser.read()

    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'VALUE_LITERAL_START',
        charCode: '1'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: '2'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: '.'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: '3'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: '4'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'VALUE_LITERAL_END' },
    })
    expect(iterator.next()).toEqual({
      done: true,
    })
  })
})

describe('arrays', () => {
  it('should parse the opening and closing of arrays', () => {
    const parser = new MemoryParser('[[]]')
    const iterator = parser.read()

    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'ARRAY_START' },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'ARRAY_START' },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'ARRAY_END' },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'ARRAY_END' },
    })
    expect(iterator.next()).toEqual({
      done: true,
    })
  })

  it('should parse value literals inside array', () => {
    const parser = new MemoryParser('[true, false, null, 12.34]')
    const iterator = parser.read()

    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'ARRAY_START' },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'VALUE_LITERAL_START',
        charCode: 't'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'r'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'u'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'e'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'VALUE_LITERAL_END' },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'PROPERTY_SPLIT' },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'VALUE_LITERAL_START',
        charCode: 'f'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'a'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'l'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 's'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'e'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'VALUE_LITERAL_END' },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'PROPERTY_SPLIT' },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'VALUE_LITERAL_START',
        charCode: 'n'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'u'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'l'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'l'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'VALUE_LITERAL_END' },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'PROPERTY_SPLIT' },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'VALUE_LITERAL_START',
        charCode: '1'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: '2'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: '.'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: '3'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: '4'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'VALUE_LITERAL_END' },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'ARRAY_END' },
    })
    expect(iterator.next()).toEqual({
      done: true,
    })
  })

  it('should yield correct events for array of strings', () => {
    const input = new Array(faker.number.int({ min: 5, max: 10 })).fill(() => null).map(() => faker.lorem.word())
    const parser = new MemoryParser(JSON.stringify(input))
    const iterator = parser.read()

    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'ARRAY_START' },
    })
    for (let inputIndex = 0; inputIndex < input.length; inputIndex++) {
      expect(iterator.next()).toEqual({
        done: false,
        value: { event: 'STRING_START' },
      })

      const word = input[inputIndex]
      for (let wordIndex = 0; wordIndex < word.length; wordIndex++) {
        expect(iterator.next()).toEqual({
          done: false,
          value: {
            event: 'CHARACTER',
            charCode: word.charCodeAt(wordIndex),
          },
        })
      }

      expect(iterator.next()).toEqual({
        done: false,
        value: { event: 'STRING_END' },
      })

      if (inputIndex + 1 < input.length) {
        expect(iterator.next()).toEqual({
          done: false,
          value: { event: 'PROPERTY_SPLIT' },
        })
      }
    }
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'ARRAY_END' },
    })
    expect(iterator.next()).toEqual({
      done: true,
    })
  })

  it('should yield correct events for array of value literals as strings', () => {
    const input = ['true', 'false', 'null', '12.34']
    const parser = new MemoryParser(JSON.stringify(input))
    const iterator = parser.read()

    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'ARRAY_START' },
    })
    for (let inputIndex = 0; inputIndex < input.length; inputIndex++) {
      expect(iterator.next()).toEqual({
        done: false,
        value: { event: 'STRING_START' },
      })

      const word = input[inputIndex]
      for (let wordIndex = 0; wordIndex < word.length; wordIndex++) {
        expect(iterator.next()).toEqual({
          done: false,
          value: {
            event: 'CHARACTER',
            charCode: word.charCodeAt(wordIndex),
          },
        })
      }

      expect(iterator.next()).toEqual({
        done: false,
        value: { event: 'STRING_END' },
      })

      if (inputIndex + 1 < input.length) {
        expect(iterator.next()).toEqual({
          done: false,
          value: { event: 'PROPERTY_SPLIT' },
        })
      }
    }
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'ARRAY_END' },
    })
    expect(iterator.next()).toEqual({
      done: true,
    })
  })

  it('should throw an error when an incomplete array is not closed by end of input', () => {
    const parser = new MemoryParser('[')
    const iterator = parser.read()

    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'ARRAY_START',
      },
    })

    try {
      expect(iterator.next()).toThrow()
    } catch (err) {
      expect(err).toBeInstanceOf(ParserError)
      expect((err as ParserError).message).toEqual('Unexpected end of JSON input')
    }
  })

  it('should throw an error when an string is not closed before end of array', () => {
    const parser = new MemoryParser('["foo]')
    const iterator = parser.read()

    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'ARRAY_START',
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'STRING_START',
      },
    })

    iterator.next()
    iterator.next()
    iterator.next()
    iterator.next()

    try {
      expect(iterator.next()).toThrow()
    } catch (err) {
      expect(err).toBeInstanceOf(ParserError)
      expect((err as ParserError).message).toEqual('Unterminated string in JSON at position 6')
    }
  })

  it.each(['.', 'a', '$'])('should throw an error when opening character is invalid %s', (input) => {
    const parser = new MemoryParser(`[${input}]`)
    const iterator = parser.read()

    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'ARRAY_START',
      },
    })

    try {
      expect(iterator.next()).toThrow()
    } catch (err) {
      expect(err).toBeInstanceOf(ParserError)
      expect((err as ParserError).message).toEqual(`Unexpected token '${input}' at position 1`)
    }
  })

  it('should support control characters in strings %s', () => {
    const input = '[]{}:,"\\'
    const expected = [91, 93, 123, 125, 58, 44, 92, 34, 92, 92]
    const parser = new MemoryParser(JSON.stringify([input]))
    const iterator = parser.read()

    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'ARRAY_START' },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'STRING_START' },
    })
    for (let index = 0; index < expected.length; index++) {
      expect(iterator.next()).toEqual({
        done: false,
        value: {
          event: 'CHARACTER',
          charCode: expected[index],
        },
      })
    }
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'STRING_END' },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'ARRAY_END' },
    })
    expect(iterator.next()).toEqual({
      done: true,
    })
  })
})

describe('objects', () => {
  it('should parse the opening and closing of object', () => {
    const parser = new MemoryParser('{}')
    const iterator = parser.read()

    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'OBJECT_START' },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'OBJECT_END' },
    })
    expect(iterator.next()).toEqual({
      done: true,
    })
  })

  it('should parse the opening and closing of arrays of objects', () => {
    const parser = new MemoryParser('[{}, {}]')
    const iterator = parser.read()

    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'ARRAY_START' },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'OBJECT_START' },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'OBJECT_END' },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'PROPERTY_SPLIT' },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'OBJECT_START' },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'OBJECT_END' },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'ARRAY_END' },
    })
    expect(iterator.next()).toEqual({
      done: true,
    })
  })

  it('should parse the properties of objects', () => {
    const parser = new MemoryParser('{"foo": "bar", "biz": [], "baz": false}')
    const iterator = parser.read()

    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'OBJECT_START' },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'STRING_START' },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'f'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'o'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'o'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'STRING_END' },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'KEY_VALUE_SPLIT' },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'STRING_START' },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'b'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'a'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'r'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'STRING_END' },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'PROPERTY_SPLIT' },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'STRING_START' },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'b'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'i'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'z'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'STRING_END' },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'KEY_VALUE_SPLIT' },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'ARRAY_START' },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'ARRAY_END' },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'PROPERTY_SPLIT' },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'STRING_START' },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'b'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'a'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'z'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'STRING_END' },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'KEY_VALUE_SPLIT' },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'VALUE_LITERAL_START',
        charCode: 'f'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'a'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'l'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 's'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: {
        event: 'CHARACTER',
        charCode: 'e'.charCodeAt(0),
      },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'VALUE_LITERAL_END' },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'OBJECT_END' },
    })
    expect(iterator.next()).toEqual({
      done: true,
    })
  })

  it('should throw an error when object is not closed by end of input', () => {
    const parser = new MemoryParser('{')
    const iterator = parser.read()

    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'OBJECT_START' },
    })

    try {
      expect(iterator.next()).toThrow()
    } catch (err) {
      expect(err).toBeInstanceOf(ParserError)
      expect((err as ParserError).message).toEqual('Unexpected end of JSON input')
    }
  })

  it('should throw an error when object is not closed by end of array', () => {
    const parser = new MemoryParser('[{]')
    const iterator = parser.read()

    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'ARRAY_START' },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'OBJECT_START' },
    })

    try {
      expect(iterator.next()).toThrow()
    } catch (err) {
      expect(err).toBeInstanceOf(ParserError)
      expect((err as ParserError).message).toEqual("Expected property name or '}' in JSON at position 2")
    }
  })

  it.each(['1', '.', 'a', '$'])(
    'should throw an error when object property does not start with a double quote %s',
    (input) => {
      const parser = new MemoryParser(`{${input}: ${input}}`)
      const iterator = parser.read()

      expect(iterator.next()).toEqual({
        done: false,
        value: { event: 'OBJECT_START' },
      })

      try {
        expect(iterator.next()).toThrow()
      } catch (err) {
        expect(err).toBeInstanceOf(ParserError)
        expect((err as ParserError).message).toEqual("Expected property name or '}' in JSON at position 1")
      }
    },
  )

  it('should support control characters in strings %s', () => {
    const input = '[]{}:,"\\'
    const expected = [91, 93, 123, 125, 58, 44, 92, 34, 92, 92]
    const parser = new MemoryParser(JSON.stringify({ foo: input }))
    const iterator = parser.read()

    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'OBJECT_START' },
    })

    iterator.next()
    iterator.next()
    iterator.next()
    iterator.next()
    iterator.next()
    iterator.next()

    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'STRING_START' },
    })
    for (let index = 0; index < expected.length; index++) {
      expect(iterator.next()).toEqual({
        done: false,
        value: {
          event: 'CHARACTER',
          charCode: expected[index],
        },
      })
    }
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'STRING_END' },
    })
    expect(iterator.next()).toEqual({
      done: false,
      value: { event: 'OBJECT_END' },
    })
    expect(iterator.next()).toEqual({
      done: true,
    })
  })
})
