// self_teacher.js
// Lightweight, local "self-teaching" memory for the voice pipeline.
// Stores short lessons from past interactions and injects them into future prompts.

const fs = require('fs')
const path = require('path')

const DEFAULT_FILE = path.join(process.cwd(), '.self-teaching-lessons.json')
const MAX_LESSONS = parseInt(process.env.SELF_TEACHING_MAX_LESSONS || '200', 10)
const MAX_CONTEXT_LESSONS = parseInt(process.env.SELF_TEACHING_CONTEXT_LIMIT || '5', 10)

class SelfTeacher {
  constructor(options = {}) {
    this.filePath = options.filePath || process.env.SELF_TEACHING_FILE || DEFAULT_FILE
    this.lessons = []
    this._load()
  }

  _load() {
    try {
      if (!fs.existsSync(this.filePath)) return
      const raw = fs.readFileSync(this.filePath, 'utf8')
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        this.lessons = parsed.filter(Boolean).slice(-MAX_LESSONS)
      }
    } catch (err) {
      console.error(`[self-teacher] Failed to load lessons: ${err.message}`)
      this.lessons = []
    }
  }

  _save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.lessons.slice(-MAX_LESSONS), null, 2))
    } catch (err) {
      console.error(`[self-teacher] Failed to save lessons: ${err.message}`)
    }
  }

  _keywords(text = '') {
    return (text.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) || [])
      .filter(w => !['the', 'and', 'that', 'with', 'this', 'for', 'you', 'your', 'are', 'was', 'have', 'from'].includes(w))
      .slice(0, 8)
  }

  addLesson({ title, lesson, keywords = [], source = 'auto' }) {
    if (!lesson || !lesson.trim()) return
    const entry = {
      ts: new Date().toISOString(),
      title: (title || 'New lesson').slice(0, 120),
      lesson: lesson.trim().slice(0, 450),
      keywords: Array.from(new Set(keywords)).slice(0, 12),
      source
    }

    this.lessons.push(entry)
    if (this.lessons.length > MAX_LESSONS) this.lessons = this.lessons.slice(-MAX_LESSONS)
    this._save()
  }

  recordInteraction({ userText, assistantText, source = 'conversation' }) {
    if (!userText || !assistantText) return

    const conciseAnswer = assistantText.replace(/\s+/g, ' ').trim()
    const lesson = `When asked about "${userText.slice(0, 80)}", answer style that worked: ${conciseAnswer.slice(0, 220)}`

    this.addLesson({
      title: 'Conversation pattern',
      lesson,
      keywords: this._keywords(`${userText} ${assistantText}`),
      source
    })
  }

  _rankFor(text) {
    const q = new Set(this._keywords(text))

    return this.lessons
      .map(item => {
        const overlap = item.keywords.reduce((n, k) => n + (q.has(k) ? 1 : 0), 0)
        return { item, overlap }
      })
      .sort((a, b) => b.overlap - a.overlap || (a.item.ts < b.item.ts ? 1 : -1))
      .slice(0, MAX_CONTEXT_LESSONS)
      .map(x => x.item)
  }

  buildSystemPrompt(basePrompt, userText = '') {
    const selected = this._rankFor(userText)
    if (!selected.length) return basePrompt

    const memoryBlock = selected
      .map((l, i) => `${i + 1}. ${l.lesson}`)
      .join('\n')

    return [
      basePrompt,
      '',
      'Apply these learned lessons when relevant:',
      memoryBlock
    ].join('\n')
  }
}

module.exports = { SelfTeacher }
