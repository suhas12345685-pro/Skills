const { EventEmitter } = require('events')
const { DeepgramSTT } = require('./03_deepgram_ws')
const { LLMStream } = require('./04_llm_stream')
const { SentenceChunker } = require('./05_sentence_chunker')
const { TTSStream } = require('./06_tts_ws')
const { PCMWriter } = require('./07_pcm_write')

class PipelineExecutor extends EventEmitter {
  constructor() {
    super()
    this.stt = null
    this.llm = null
    this.chunker = null
    this.tts = null
    this.pcm = null
  }

  initStages() {
    this.stt = new DeepgramSTT()
    this.llm = new LLMStream()
    this.chunker = new SentenceChunker()
    this.tts = new TTSStream()
    this.pcm = new PCMWriter()
    this._wireStages()
  }

  _wireStages() {
    // STT -> LLM
    this.stt.on('transcript', (text) => {
      this.emit('transcript', text)
      this.llm.send(text)
    })

    // LLM -> sentence chunker
    this.llm.on('token', (token) => {
      this.chunker.push(token)
    })
    this.llm.on('done', () => {
      this.chunker.flush()
    })

    // Chunker -> TTS
    this.chunker.on('chunk', (sentence) => {
      this.emit('speaking', sentence)
      this.tts.send(sentence)
    })

    // TTS -> PCM writer
    this.tts.on('audio', (mp3Chunk) => {
      this.pcm.write(mp3Chunk)
    })

    // Surface errors from core I/O stages
    ;[this.stt, this.llm, this.tts].forEach((stage) => {
      stage.on('error', (err) => {
        this.emit('error', err)
      })
    })
  }

  start() {
    this.tts.start()
    this.stt.start()
  }

  stop() {
    if (this.pcm) { this.pcm.stop(); this.pcm = null }
    if (this.tts) { this.tts.stop(); this.tts = null }
    if (this.llm) { this.llm.abort(); this.llm = null }
    if (this.chunker) { this.chunker.reset(); this.chunker = null }
    if (this.stt) { this.stt.stop(); this.stt = null }
  }

  interrupt() {
    if (this.pcm) this.pcm.flush()
    if (this.tts) {
      this.tts.stop()
      this.tts = new TTSStream()
      this.tts.start()
    }
    if (this.llm) this.llm.abort()
    if (this.chunker) this.chunker.reset()
  }
}

module.exports = { PipelineExecutor }
