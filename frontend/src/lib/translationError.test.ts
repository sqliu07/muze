import assert from 'node:assert/strict'
import test from 'node:test'
import { translationFailureMessage } from './translationError.ts'

test('translation failure surfaces a safe provider detail', () => {
  assert.equal(translationFailureMessage({ response: { data: { detail: 'DeepSeek 返回的翻译不完整，请重试。' } } }), 'DeepSeek 返回的翻译不完整，请重试。')
})

test('translation failure masks keys and URLs and bounds arbitrary error text', () => {
  const message = translationFailureMessage(new Error('request failed sk-abcdefghijklmnop https://api.example.test/private'))
  assert.equal(message, 'request failed [密钥已隐藏] [地址已隐藏]')
  assert.equal(translationFailureMessage(new Error('x'.repeat(300))).length, 160)
})

test('translation failure falls back when no useful error is available', () => {
  assert.equal(translationFailureMessage({}), '翻译失败，请稍后重试')
})
