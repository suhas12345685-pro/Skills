# voice-pipeline

A Node.js app that captures your real microphone, runs it through an AI chain (STT → LLM → TTS), then writes the generated voice to a virtual audio cable so meeting apps can use it as the mic input.

## Pipeline

```txt
Real Mic → ffmpeg (16k mono PCM) → Deepgram STT → LLM stream → sentence chunker → TTS stream → PCM writer → Virtual Cable
```

## Prerequisites

- Node.js 18+
- ffmpeg in PATH
- `pactl` in PATH (Linux device listing fallback)
- Virtual audio driver:
  - Windows: VB-Cable
  - macOS: BlackHole 2ch

## Install

```bash
npm install
cp .env.example .env
# fill .env values
```

## Run by phases

```bash
npm run list-devices
npm run test-capture
npm run test-stt
npm run test-llm
npm run test-chunker
npm run test-tts
npm run test-pcm
npm start
```

## Environment

Required values are documented in `.env.example`.

## Notes

- Meeting app microphone should be the virtual cable output endpoint.
- `VIRTUAL_CABLE_NAME` should be the exact virtual cable input device name found by `npm run list-devices`.
