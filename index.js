// index.js
// Main pipeline entrypoint for host app integrations.

require('dotenv').config()
const { VoiceOrchestrator } = require('./orchestrator')

const pipeline = new VoiceOrchestrator()

// Graceful shutdown
process.on('SIGINT', () => { pipeline.stop(); process.exit(0) })
process.on('SIGTERM', () => { pipeline.stop(); process.exit(0) })

module.exports = pipeline

if (require.main === module) {
  pipeline.on('transcript', (t) => console.log(`[you] ${t}`))
  pipeline.on('speaking', (s) => console.log(`[jarvis] ${s}`))
  pipeline.on('error', (e) => console.error('[error]', e.message))
  pipeline.start()
}
