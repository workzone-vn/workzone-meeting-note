import { describe, it, expect } from 'vitest'
import * as git from 'isomorphic-git'
import http from 'isomorphic-git/http/node'

describe('môi trường test', () => {
  it('import được isomorphic-git + http/node', () => {
    expect(typeof git.init).toBe('function')
    expect(typeof git.merge).toBe('function')
    expect(http).toBeTruthy()
  })
})
