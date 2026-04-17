const { EventEmitter } = require('events')
const { PipelineExecutor } = require('./executor')

const REQUIRED = [
  'DEEPGRAM_API_KEY',
  'LLM_PROVIDER', 'LLM_API_KEY', 'LLM_MODEL',
  'TTS_PROVIDER', 'TTS_API_KEY', 'TTS_VOICE_ID',
  'VIRTUAL_CABLE_NAME'
]

class VoiceOrchestrator extends EventEmitter {
  constructor() {
    super()
    this.running = false
    this.executor = null
  }

  start() {
    const missing = REQUIRED.filter((key) => !process.env[key])
    if (missing.length) {
      throw new Error(`[voice-pipeline] Missing required env vars: ${missing.join(', ')}\nAdd them to your .env and restart.`)
    }

    if (this.running) {
      console.warn('[voice-pipeline] Already running. Call stop() first.')
      return
    }

    this.executor = new PipelineExecutor()
    this.executor.initStages()

    this.executor.on('transcript', (text) => this.emit('transcript', text))
    this.executor.on('speaking', (text) => this.emit('speaking', text))
    this.executor.on('error', (err) => {
      console.error('[voice-pipeline] Stage error:', err.message)
      this.emit('error', err)
    })

    this.executor.start()
    this.running = true

    console.log('[voice-pipeline] Started. Listening...')
    this.emit('started')
  }

  stop() {
    if (!this.running) return

    console.log('[voice-pipeline] Stopping...')
    if (this.executor) {
      this.executor.stop()
      this.executor.removeAllListeners()
      this.executor = null
    }

    this.running = false
    this.emit('stopped')
    console.log('[voice-pipeline] Stopped.')
  }

  interrupt() {
    if (!this.running || !this.executor) return

    this.executor.interrupt()
    this.emit('interrupted')
  }
}

module.exports = { VoiceOrchestrator }
