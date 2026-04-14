// scripts/02_capture_resample.js
// Captures audio from the real microphone using ffmpeg and emits
// 16kHz mono 16-bit PCM chunks for STT.
//
// Stress test:
//   node scripts/02_capture_resample.js > test.pcm
//   ffplay -f s16le -ar 16000 -ac 1 test.pcm

require('dotenv').config()
const { spawn } = require('child_process')
const os = require('os')

const SAMPLE_RATE = 16000
const CHANNELS = 1

function buildInputArgs() {
  const platform = os.platform()
  const micName = process.env.MIC_DEVICE_NAME

  if (platform === 'win32') {
    return micName
      ? ['-f', 'dshow', '-i', `audio=${micName}`]
      : ['-f', 'dshow', '-i', 'audio=default']
  }

  if (platform === 'darwin') {
    // avfoundation uses "<video_index>:<audio_index|audio_name>"
    return micName
      ? ['-f', 'avfoundation', '-i', `:${micName}`]
      : ['-f', 'avfoundation', '-i', ':0']
  }

  // Linux: PulseAudio device name preferred, falls back to default.
  return micName
    ? ['-f', 'pulse', '-i', micName]
    : ['-f', 'pulse', '-i', 'default']
}

function startCapture(onChunk) {
  const args = [
    ...buildInputArgs(),
    '-ac', String(CHANNELS),
    '-ar', String(SAMPLE_RATE),
    '-f', 's16le',
    'pipe:1'
  ]

  const ffmpeg = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] })

  ffmpeg.stdout.on('data', (chunk) => {
    if (typeof onChunk === 'function') onChunk(chunk)
  })

  ffmpeg.stderr.on('data', (buf) => {
    if (process.env.PIPELINE_DEBUG === 'true') {
      process.stderr.write(`[capture] ${buf.toString()}`)
    }
  })

  ffmpeg.on('error', (err) => {
    console.error('[capture] ffmpeg failed:', err.message)
  })

  ffmpeg.on('close', (code) => {
    if (code !== 0 && process.env.PIPELINE_DEBUG === 'true') {
      console.error(`[capture] ffmpeg exited with code ${code}`)
    }
  })

  return ffmpeg
}

if (require.main === module) {
  const ffmpeg = startCapture((chunk) => process.stdout.write(chunk))

  if (process.env.PIPELINE_DEBUG === 'true') {
    console.error('[capture] Streaming 16k mono PCM to stdout... (Ctrl+C to stop)')
  }

  process.on('SIGINT', () => {
    ffmpeg.kill('SIGKILL')
    process.exit(0)
  })
}

module.exports = { startCapture, SAMPLE_RATE, CHANNELS }
