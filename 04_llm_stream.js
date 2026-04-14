// scripts/04_llm_stream.js
// Sends text to an LLM and streams tokens back.
// Supports: groq, openai, ollama
//
// Stress test: node scripts/04_llm_stream.js
// Should stream tokens to console in real time.

require('dotenv').config()
const { EventEmitter } = require('events')
const { SelfTeacher } = require('./self_teacher')

const REQUIRED = ['LLM_PROVIDER', 'LLM_API_KEY', 'LLM_MODEL']
const missing = REQUIRED.filter(k => !process.env[k] && k !== 'LLM_API_KEY')
if (missing.length) {
  console.error(`[voice-pipeline] Missing required env vars: ${missing.join(', ')}`)
  process.exit(1)
}

const PROVIDER_URLS = {
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
  ollama: 'http://localhost:11434/api/chat'
}

class LLMStream extends EventEmitter {
  constructor() {
    super()
    this.controller = null
    this.systemPrompt = 'You are a helpful assistant. Respond concisely in 1-3 sentences.'
    this.selfTeachingEnabled = process.env.SELF_TEACHING_ENABLED !== 'false'
    this.selfTeacher = this.selfTeachingEnabled ? new SelfTeacher() : null
    this.activeResponse = null
  }

  async send(userText) {
    const provider = process.env.LLM_PROVIDER.toLowerCase()
    const url = PROVIDER_URLS[provider]

    if (!url) {
      this.emit('error', new Error(`[llm] Unknown provider: ${provider}`))
      return
    }

    // Allow cancellation
    this.controller = new AbortController()

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.LLM_API_KEY}`
    }

    if (provider === 'anthropic') {
      headers['x-api-key'] = process.env.LLM_API_KEY
      headers['anthropic-version'] = '2023-06-01'
      delete headers['Authorization']
    }

    const effectiveSystemPrompt = this.selfTeacher
      ? this.selfTeacher.buildSystemPrompt(this.systemPrompt, userText)
      : this.systemPrompt

    this.activeResponse = { userText, assistantText: '' }

    const body = provider === 'anthropic'
      ? JSON.stringify({
          model: process.env.LLM_MODEL,
          max_tokens: 300,
          stream: true,
          system: effectiveSystemPrompt,
          messages: [{ role: 'user', content: userText }]
        })
      : JSON.stringify({
          model: process.env.LLM_MODEL,
          max_tokens: 300,
          stream: true,
          messages: [
            { role: 'system', content: effectiveSystemPrompt },
            { role: 'user', content: userText }
          ]
        })

    let res
    try {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: this.controller.signal
      })
    } catch (e) {
      if (e.name !== 'AbortError') this.emit('error', new Error(`[llm] fetch failed: ${e.message}`))
      return
    }

    if (!res.ok) {
      const text = await res.text()
      this.emit('error', new Error(`[llm] HTTP ${res.status}: ${text}`))
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const lines = decoder.decode(value).split('\n')
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') { this._finalizeTeaching('stream_done'); this.emit('done'); return }

        try {
          const json = JSON.parse(data)
          let token

          if (provider === 'anthropic') {
            token = json?.delta?.text
          } else {
            token = json?.choices?.[0]?.delta?.content
          }

          if (token) {
            if (process.env.PIPELINE_DEBUG === 'true') process.stderr.write(token)
            if (this.activeResponse) this.activeResponse.assistantText += token
            this.emit('token', token)
          }
        } catch (_) { /* partial JSON line, ignore */ }
      }
    }

    this._finalizeTeaching('stream_ended')
    this.emit('done')
  }


  _finalizeTeaching(source = 'conversation') {
    if (!this.selfTeacher || !this.activeResponse) return

    const { userText, assistantText } = this.activeResponse
    this.activeResponse = null

    if (assistantText && assistantText.trim()) {
      this.selfTeacher.recordInteraction({ userText, assistantText, source })
    }
  }

  teach(lessonText) {
    if (!this.selfTeacher || !lessonText || !lessonText.trim()) return
    this.selfTeacher.addLesson({
      title: 'Manual lesson',
      lesson: lessonText.trim(),
      keywords: lessonText.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) || [],
      source: 'manual'
    })
  }

  abort() {
    if (this.controller) {
      this.controller.abort()
      this.controller = null
      this._finalizeTeaching('aborted')
    }
  }
}

// When run directly (stress test)
if (require.main === module) {
  const llm = new LLMStream()
  llm.on('token', (t) => process.stdout.write(t))
  llm.on('done', () => console.log('\n[llm] stream complete'))
  llm.on('error', (e) => console.error(e.message))
  llm.send('Say hello and tell me one interesting fact about audio engineering.')
}

module.exports = { LLMStream }