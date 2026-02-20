'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { callAIAgent } from '@/lib/aiAgent'
import type { AIAgentResponse } from '@/lib/aiAgent'
import parseLLMJson from '@/lib/jsonParser'
import { FiSend, FiDownload, FiShare2, FiCopy, FiRefreshCw, FiCheck, FiX } from 'react-icons/fi'
import { RiGameLine, RiBrainLine } from 'react-icons/ri'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'

// --- Constants ---
const QUIZ_MASTER_AGENT_ID = '6998513b3c9685c27823bbde'
const SCORE_CARD_AGENT_ID = '6998513bdad6f4a9e9c2df13'

const EXAMPLE_TOPICS = [
  'Sourdough Starters',
  'Kubernetes',
  '90s Anime',
  'Mechanical Keyboards',
  'Byzantine History',
]

// --- Types ---
interface QuizResponse {
  message: string
  question_number: number
  is_complete: boolean
  score: number
  total: number
  level_name: string
  tagline: string
  topic: string
}

interface ChatMessage {
  id: string
  role: 'agent' | 'user'
  text: string
  questionNumber?: number
  isCorrect?: boolean | null
}

type AppScreen = 'home' | 'quiz' | 'scorecard'

// --- Sample Data ---
const SAMPLE_MESSAGES: ChatMessage[] = [
  {
    id: 's1',
    role: 'agent',
    text: "Welcome to NicheNerd! You've chosen Mechanical Keyboards - excellent taste! Let's see how deep your knowledge go. Here's question 1:\n\nWhat does the term \"hot-swappable\" refer to in mechanical keyboards?",
    questionNumber: 1,
    isCorrect: null,
  },
  {
    id: 's2',
    role: 'user',
    text: 'It means you can change the switches without soldering.',
  },
  {
    id: 's3',
    role: 'agent',
    text: "Correct! Hot-swappable means you can replace switches without desoldering. Nice one! Here's question 2:\n\nWhat is the difference between Cherry MX Red and Cherry MX Brown switches?",
    questionNumber: 2,
    isCorrect: true,
  },
  {
    id: 's4',
    role: 'user',
    text: 'Reds are linear and Browns are tactile with a small bump.',
  },
  {
    id: 's5',
    role: 'agent',
    text: "Spot on! MX Reds are linear (smooth) while MX Browns have a tactile bump at actuation. You really know your switches! Question 3:\n\nWhat material is \"PBT\" in the context of keycaps?",
    questionNumber: 3,
    isCorrect: true,
  },
]

const SAMPLE_FINAL: QuizResponse = {
  message: "Incredible run! You scored 8/10 on Mechanical Keyboards. You clearly spend as much time researching as you do typing.",
  question_number: 10,
  is_complete: true,
  score: 8,
  total: 10,
  level_name: 'Keeb Sensei',
  tagline: 'Types at 150 WPM and judges your membrane keyboard silently.',
  topic: 'Mechanical Keyboards',
}

// --- ErrorBoundary ---
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: '' }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
          <div className="text-center p-8 max-w-md">
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground mb-4 text-sm">{this.state.error}</p>
            <button
              onClick={() => this.setState({ hasError: false, error: '' })}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// --- Markdown Renderer ---
function formatInline(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold text-foreground">
        {part}
      </strong>
    ) : (
      part
    )
  )
}

function renderMarkdown(text: string) {
  if (!text) return null
  return (
    <div className="space-y-1.5">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### '))
          return (
            <h4 key={i} className="font-semibold text-sm mt-3 mb-1">
              {line.slice(4)}
            </h4>
          )
        if (line.startsWith('## '))
          return (
            <h3 key={i} className="font-semibold text-base mt-3 mb-1">
              {line.slice(3)}
            </h3>
          )
        if (line.startsWith('# '))
          return (
            <h2 key={i} className="font-bold text-lg mt-4 mb-2">
              {line.slice(2)}
            </h2>
          )
        if (line.startsWith('- ') || line.startsWith('* '))
          return (
            <li key={i} className="ml-4 list-disc text-sm">
              {formatInline(line.slice(2))}
            </li>
          )
        if (/^\d+\.\s/.test(line))
          return (
            <li key={i} className="ml-4 list-decimal text-sm">
              {formatInline(line.replace(/^\d+\.\s/, ''))}
            </li>
          )
        if (!line.trim()) return <div key={i} className="h-1" />
        return (
          <p key={i} className="text-sm leading-relaxed">
            {formatInline(line)}
          </p>
        )
      })}
    </div>
  )
}

// --- Typing Indicator ---
function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-4 py-3">
      <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
      <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
      <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
    </div>
  )
}

// --- Glowing Neon Text ---
function NeonTitle({ text, sub }: { text: string; sub: string }) {
  return (
    <div className="text-center mb-8">
      <div className="flex items-center justify-center gap-3 mb-3">
        <RiBrainLine className="w-10 h-10 text-primary" />
        <h1 className="text-5xl md:text-6xl font-bold tracking-wider font-mono text-primary" style={{ textShadow: '0 0 20px hsl(180 100% 50% / 0.5), 0 0 40px hsl(180 100% 50% / 0.3)' }}>
          {text}
        </h1>
      </div>
      <p className="text-muted-foreground text-lg tracking-wide font-sans">{sub}</p>
    </div>
  )
}

// --- Topic Pill ---
function TopicPill({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-1.5 rounded-sm text-sm font-mono border border-border bg-muted/50 text-muted-foreground hover:border-primary hover:text-primary hover:shadow-lg hover:shadow-primary/20 transition-all duration-300 backdrop-blur-sm"
    >
      {label}
    </button>
  )
}

// --- Chat Bubble ---
function ChatBubble({ msg }: { msg: ChatMessage }) {
  const isAgent = msg.role === 'agent'
  return (
    <div className={`flex ${isAgent ? 'justify-start' : 'justify-end'} mb-4`}>
      <div
        className={`max-w-[85%] md:max-w-[75%] rounded-sm px-4 py-3 ${isAgent ? 'bg-white/10 backdrop-blur-xl border border-white/10 shadow-lg' : 'bg-secondary/80 text-secondary-foreground border border-secondary/40'}`}
      >
        {isAgent && msg.isCorrect === true && (
          <div className="flex items-center gap-1.5 mb-2">
            <FiCheck className="w-4 h-4 text-green-400" />
            <span className="text-xs font-mono text-green-400 uppercase tracking-wider">Correct</span>
          </div>
        )}
        {isAgent && msg.isCorrect === false && (
          <div className="flex items-center gap-1.5 mb-2">
            <FiX className="w-4 h-4 text-destructive" />
            <span className="text-xs font-mono text-destructive uppercase tracking-wider">Incorrect</span>
          </div>
        )}
        <div className={isAgent ? 'text-foreground' : 'text-white'}>
          {renderMarkdown(msg.text)}
        </div>
        {isAgent && typeof msg.questionNumber === 'number' && msg.questionNumber > 0 && (
          <div className="mt-2 pt-2 border-t border-white/10">
            <span className="text-xs font-mono text-muted-foreground">
              Q{msg.questionNumber}/10
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// --- Agent Status Card ---
function AgentStatusCard({ activeAgentId }: { activeAgentId: string | null }) {
  const agents = [
    { id: QUIZ_MASTER_AGENT_ID, name: 'Quiz Master Agent', purpose: 'Asks questions, evaluates answers, tracks score' },
    { id: SCORE_CARD_AGENT_ID, name: 'Score Card Generator', purpose: 'Generates shareable score card image' },
  ]
  return (
    <div className="mt-8 w-full max-w-md mx-auto">
      <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-sm p-4">
        <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-3">Powered by AI Agents</p>
        <div className="space-y-2">
          {agents.map((a) => (
            <div key={a.id} className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${activeAgentId === a.id ? 'bg-primary animate-pulse' : 'bg-muted-foreground/40'}`} />
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-mono truncate ${activeAgentId === a.id ? 'text-primary' : 'text-muted-foreground'}`}>
                  {a.name}
                </p>
                <p className="text-xs text-muted-foreground/60 truncate">{a.purpose}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// --- Parse quiz response safely ---
function parseQuizData(result: AIAgentResponse): QuizResponse | null {
  let data = result?.response?.result as Partial<QuizResponse> | undefined
  if (data && typeof data.message === 'string' && data.message.length > 0) {
    return {
      message: data.message ?? '',
      question_number: typeof data.question_number === 'number' ? data.question_number : 0,
      is_complete: data.is_complete === true,
      score: typeof data.score === 'number' ? data.score : 0,
      total: typeof data.total === 'number' ? data.total : 10,
      level_name: typeof data.level_name === 'string' ? data.level_name : '',
      tagline: typeof data.tagline === 'string' ? data.tagline : '',
      topic: typeof data.topic === 'string' ? data.topic : '',
    }
  }
  // Fallback: try raw_response
  if (result?.raw_response) {
    const parsed = parseLLMJson(result.raw_response)
    if (parsed && typeof parsed.message === 'string') {
      return {
        message: parsed.message ?? '',
        question_number: typeof parsed.question_number === 'number' ? parsed.question_number : 0,
        is_complete: parsed.is_complete === true,
        score: typeof parsed.score === 'number' ? parsed.score : 0,
        total: typeof parsed.total === 'number' ? parsed.total : 10,
        level_name: typeof parsed.level_name === 'string' ? parsed.level_name : '',
        tagline: typeof parsed.tagline === 'string' ? parsed.tagline : '',
        topic: typeof parsed.topic === 'string' ? parsed.topic : '',
      }
    }
  }
  // Last resort: try to extract text
  const text = result?.response?.result?.text ?? result?.response?.message ?? ''
  if (typeof text === 'string' && text.length > 0) {
    const jsonParsed = parseLLMJson(text)
    if (jsonParsed && typeof jsonParsed.message === 'string') {
      return {
        message: jsonParsed.message ?? '',
        question_number: typeof jsonParsed.question_number === 'number' ? jsonParsed.question_number : 0,
        is_complete: jsonParsed.is_complete === true,
        score: typeof jsonParsed.score === 'number' ? jsonParsed.score : 0,
        total: typeof jsonParsed.total === 'number' ? jsonParsed.total : 10,
        level_name: typeof jsonParsed.level_name === 'string' ? jsonParsed.level_name : '',
        tagline: typeof jsonParsed.tagline === 'string' ? jsonParsed.tagline : '',
        topic: typeof jsonParsed.topic === 'string' ? jsonParsed.topic : '',
      }
    }
    // If it's just plain text, wrap it
    return {
      message: text,
      question_number: 0,
      is_complete: false,
      score: 0,
      total: 10,
      level_name: '',
      tagline: '',
      topic: '',
    }
  }
  return null
}

// =============================================
// MAIN PAGE
// =============================================
export default function Page() {
  // --- State ---
  const [screen, setScreen] = useState<AppScreen>('home')
  const [topic, setTopic] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [answerInput, setAnswerInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [quizComplete, setQuizComplete] = useState(false)
  const [finalData, setFinalData] = useState<QuizResponse | null>(null)
  const [scoreCardUrl, setScoreCardUrl] = useState<string | null>(null)
  const [scoreCardLoading, setScoreCardLoading] = useState(false)
  const [showSample, setShowSample] = useState(false)
  const [copied, setCopied] = useState(false)

  const sessionId = useRef<string>('')
  const userId = useRef<string>('')
  const chatEndRef = useRef<HTMLDivElement>(null)
  const msgIdCounter = useRef(0)

  // Initialize a persistent user_id once (survives re-renders, consistent across quiz session)
  useEffect(() => {
    const stored = typeof window !== 'undefined' ? sessionStorage.getItem('nichenerd_user_id') : null
    if (stored) {
      userId.current = stored
    } else {
      const newId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? `user-${crypto.randomUUID()}`
        : `user-${Date.now()}`
      userId.current = newId
      if (typeof window !== 'undefined') sessionStorage.setItem('nichenerd_user_id', newId)
    }
  }, [])

  // --- Helpers ---
  const genId = () => {
    msgIdCounter.current += 1
    return `msg-${msgIdCounter.current}`
  }

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, loading])

  // --- Start Quiz ---
  const startQuiz = useCallback(async (chosenTopic: string) => {
    if (!chosenTopic.trim()) return
    setScreen('quiz')
    setMessages([])
    setCurrentQuestion(0)
    setQuizComplete(false)
    setFinalData(null)
    setScoreCardUrl(null)
    setError(null)
    setLoading(true)
    setActiveAgentId(QUIZ_MASTER_AGENT_ID)

    sessionId.current = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Date.now().toString()

    try {
      const result = await callAIAgent(
        `Start a quiz on the topic: ${chosenTopic.trim()}. ALL 10 questions MUST be about "${chosenTopic.trim()}" only. Do NOT change the topic.`,
        QUIZ_MASTER_AGENT_ID,
        { session_id: sessionId.current, user_id: userId.current }
      )

      if (result.success) {
        const data = parseQuizData(result)
        if (data) {
          const agentMsg: ChatMessage = {
            id: genId(),
            role: 'agent',
            text: data.message,
            questionNumber: data.question_number,
            isCorrect: null,
          }
          setMessages([agentMsg])
          setCurrentQuestion(data.question_number)
        } else {
          setError('Could not parse agent response. Please try again.')
        }
      } else {
        setError(result.error ?? 'Failed to start quiz. Please try again.')
      }
    } catch (e) {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
      setActiveAgentId(null)
    }
  }, [])

  // --- Submit Answer ---
  const submitAnswer = useCallback(async () => {
    const ans = answerInput.trim()
    if (!ans || loading || quizComplete) return

    const userMsg: ChatMessage = {
      id: genId(),
      role: 'user',
      text: ans,
    }
    setMessages((prev) => [...prev, userMsg])
    setAnswerInput('')
    setLoading(true)
    setActiveAgentId(QUIZ_MASTER_AGENT_ID)
    setError(null)

    try {
      const result = await callAIAgent(
        ans,
        QUIZ_MASTER_AGENT_ID,
        { session_id: sessionId.current, user_id: userId.current }
      )

      if (result.success) {
        const data = parseQuizData(result)
        if (data) {
          // Determine if the previous answer was correct by checking score change
          const prevScore = finalData?.score ?? (currentQuestion > 1 ? undefined : 0)
          let isCorrect: boolean | null = null
          // We detect correctness by checking if the message contains common patterns
          const msgLower = data.message.toLowerCase()
          if (msgLower.includes('correct') && !msgLower.includes('incorrect') && !msgLower.includes('not correct')) {
            isCorrect = true
          } else if (msgLower.includes('incorrect') || msgLower.includes('wrong') || msgLower.includes('not correct') || msgLower.includes('not quite')) {
            isCorrect = false
          }

          const agentMsg: ChatMessage = {
            id: genId(),
            role: 'agent',
            text: data.message,
            questionNumber: data.question_number,
            isCorrect,
          }
          setMessages((prev) => [...prev, agentMsg])
          setCurrentQuestion(data.question_number)

          if (data.is_complete) {
            setQuizComplete(true)
            setFinalData(data)
          }
        } else {
          setError('Could not parse agent response.')
        }
      } else {
        setError(result.error ?? 'Failed to submit answer.')
      }
    } catch (e) {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
      setActiveAgentId(null)
    }
  }, [answerInput, loading, quizComplete, currentQuestion, finalData])

  // --- Generate Score Card ---
  const generateScoreCard = useCallback(async () => {
    if (!finalData) return
    setScoreCardLoading(true)
    setActiveAgentId(SCORE_CARD_AGENT_ID)
    setError(null)

    const prompt = `Generate a NicheNerd score card image with: Topic: ${finalData.topic || topic}, Score: ${finalData.score}/${finalData.total}, Level Name: ${finalData.level_name}, Tagline: ${finalData.tagline}`

    try {
      const result = await callAIAgent(prompt, SCORE_CARD_AGENT_ID)

      if (result.success) {
        const files = Array.isArray(result?.module_outputs?.artifact_files)
          ? result.module_outputs.artifact_files
          : []
        const imageUrl = files.length > 0 ? files[0]?.file_url : null
        if (imageUrl) {
          setScoreCardUrl(imageUrl)
          setScreen('scorecard')
        } else {
          // Still show scorecard screen even without image
          setScreen('scorecard')
        }
      } else {
        setError(result.error ?? 'Failed to generate score card.')
        setScreen('scorecard')
      }
    } catch (e) {
      setError('Network error generating score card.')
      setScreen('scorecard')
    } finally {
      setScoreCardLoading(false)
      setActiveAgentId(null)
    }
  }, [finalData, topic])

  // --- Download Image ---
  const downloadImage = useCallback(async () => {
    if (!scoreCardUrl) return
    try {
      const response = await fetch(scoreCardUrl)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `nichenerd-${(finalData?.topic ?? topic ?? 'score').replace(/\s+/g, '-').toLowerCase()}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      // Fallback: open in new tab
      window.open(scoreCardUrl, '_blank')
    }
  }, [scoreCardUrl, finalData, topic])

  // --- Share to Twitter ---
  const shareToTwitter = useCallback(() => {
    const scoreText = finalData
      ? `I scored ${finalData.score}/${finalData.total} on ${finalData.topic || topic} and earned the title "${finalData.level_name}"!`
      : 'Check out my NicheNerd score!'
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(scoreText + '\n\nHow deep does YOUR knowledge go? #NicheNerd')}`
    window.open(twitterUrl, '_blank')
  }, [finalData, topic])

  // --- Copy Link ---
  const copyLink = useCallback(() => {
    const text = finalData
      ? `NicheNerd: I scored ${finalData.score}/${finalData.total} on ${finalData.topic || topic}! Level: ${finalData.level_name} - "${finalData.tagline}"`
      : 'Check out NicheNerd!'
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {
      // Fallback
      setCopied(false)
    })
  }, [finalData, topic])

  // --- Play Again ---
  const playAgain = useCallback(() => {
    setScreen('home')
    setTopic('')
    setMessages([])
    setAnswerInput('')
    setCurrentQuestion(0)
    setQuizComplete(false)
    setFinalData(null)
    setScoreCardUrl(null)
    setError(null)
    setShowSample(false)
  }, [])

  // --- Sample Data ---
  const sampleMessages = showSample ? SAMPLE_MESSAGES : messages
  const sampleFinal = showSample ? SAMPLE_FINAL : finalData
  const sampleQuestion = showSample ? 3 : currentQuestion
  const sampleTopic = showSample ? 'Mechanical Keyboards' : topic

  // --- Render ---
  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background text-foreground font-sans" style={{ background: 'linear-gradient(135deg, hsl(260 35% 8%) 0%, hsl(280 30% 10%) 50%, hsl(240 25% 8%) 100%)' }}>
        {/* Sample Data Toggle */}
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground">Sample Data</span>
          <Switch
            checked={showSample}
            onCheckedChange={(val) => setShowSample(val)}
          />
        </div>

        {/* ========= HOME SCREEN ========= */}
        {screen === 'home' && (
          <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8">
            <NeonTitle text="NicheNerd" sub="How deep does your knowledge go?" />

            {/* Topic Input */}
            <div className="w-full max-w-lg mb-6">
              <div className="relative">
                <Input
                  type="text"
                  placeholder="Type any topic... Go as niche as you dare"
                  value={showSample ? sampleTopic : topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="w-full h-14 px-5 text-base font-mono bg-white/10 backdrop-blur-xl border border-white/10 rounded-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:shadow-lg focus:shadow-primary/20 transition-all duration-300"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !showSample) {
                      startQuiz(topic)
                    }
                  }}
                />
              </div>
            </div>

            {/* Start Quiz Button */}
            <Button
              onClick={() => {
                if (showSample) {
                  setScreen('quiz')
                } else {
                  startQuiz(topic)
                }
              }}
              disabled={!showSample && !topic.trim()}
              className="h-12 px-8 mb-8 text-base font-mono font-bold tracking-wider bg-primary text-primary-foreground rounded-sm hover:shadow-lg hover:shadow-primary/40 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RiGameLine className="w-5 h-5 mr-2" />
              START QUIZ
            </Button>

            {/* Example Topic Pills */}
            <div className="flex flex-wrap gap-2 justify-center max-w-lg mb-10">
              {EXAMPLE_TOPICS.map((t) => (
                <TopicPill
                  key={t}
                  label={t}
                  onClick={() => {
                    setTopic(t)
                  }}
                />
              ))}
            </div>

            {/* Agent Status */}
            <AgentStatusCard activeAgentId={activeAgentId} />
          </div>
        )}

        {/* ========= QUIZ SCREEN ========= */}
        {screen === 'quiz' && (
          <div className="min-h-screen flex flex-col">
            {/* Header with Progress */}
            <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-white/10 px-4 py-3">
              <div className="max-w-2xl mx-auto">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <RiBrainLine className="w-5 h-5 text-primary" />
                    <span className="text-sm font-mono text-primary tracking-wider">NicheNerd</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="font-mono text-xs border-primary/40 text-primary">
                      {sampleTopic || 'Quiz'}
                    </Badge>
                    <span className="text-sm font-mono font-bold text-foreground">
                      {sampleQuestion}/10
                    </span>
                  </div>
                </div>
                <Progress value={sampleQuestion * 10} className="h-1.5 bg-muted" />
              </div>
            </div>

            {/* Chat Messages Area */}
            <div className="flex-1 overflow-hidden">
              <ScrollArea className="h-[calc(100vh-160px)]">
                <div className="max-w-2xl mx-auto px-4 py-6">
                  {(showSample ? sampleMessages : messages).map((msg) => (
                    <ChatBubble key={msg.id} msg={msg} />
                  ))}

                  {loading && (
                    <div className="flex justify-start mb-4">
                      <div className="bg-white/10 backdrop-blur-xl border border-white/10 rounded-sm shadow-lg">
                        <TypingIndicator />
                      </div>
                    </div>
                  )}

                  {error && (
                    <div className="flex justify-center mb-4">
                      <div className="bg-destructive/20 border border-destructive/40 rounded-sm px-4 py-2">
                        <p className="text-sm text-destructive font-mono">{error}</p>
                      </div>
                    </div>
                  )}

                  {/* Quiz Complete CTA */}
                  {(quizComplete || (showSample && screen === 'quiz')) && (
                    <div className="flex justify-center mt-6">
                      <Card className="bg-white/10 backdrop-blur-xl border border-primary/30 shadow-lg shadow-primary/10 max-w-sm w-full">
                        <CardContent className="p-6 text-center">
                          <h3 className="text-xl font-mono font-bold text-primary mb-2">Quiz Complete!</h3>
                          <p className="text-2xl font-bold font-mono text-foreground mb-1">
                            {(showSample ? sampleFinal?.score : finalData?.score) ?? 0}/{(showSample ? sampleFinal?.total : finalData?.total) ?? 10}
                          </p>
                          {(showSample ? sampleFinal?.level_name : finalData?.level_name) && (
                            <Badge className="mb-2 bg-secondary text-secondary-foreground font-mono">
                              {(showSample ? sampleFinal?.level_name : finalData?.level_name) ?? ''}
                            </Badge>
                          )}
                          {(showSample ? sampleFinal?.tagline : finalData?.tagline) && (
                            <p className="text-sm text-muted-foreground mb-4 italic">
                              &quot;{(showSample ? sampleFinal?.tagline : finalData?.tagline) ?? ''}&quot;
                            </p>
                          )}
                          <Button
                            onClick={() => {
                              if (showSample) {
                                setScreen('scorecard')
                              } else {
                                generateScoreCard()
                              }
                            }}
                            disabled={scoreCardLoading}
                            className="w-full h-10 font-mono font-bold tracking-wider bg-primary text-primary-foreground rounded-sm hover:shadow-lg hover:shadow-primary/40 transition-all duration-300"
                          >
                            {scoreCardLoading ? (
                              <span className="flex items-center gap-2">
                                <FiRefreshCw className="w-4 h-4 animate-spin" />
                                Generating...
                              </span>
                            ) : (
                              'Generate Score Card'
                            )}
                          </Button>
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  <div ref={chatEndRef} />
                </div>
              </ScrollArea>
            </div>

            {/* Input Fixed at Bottom */}
            {!quizComplete && !showSample && (
              <div className="sticky bottom-0 z-40 bg-background/80 backdrop-blur-xl border-t border-white/10 px-4 py-3">
                <div className="max-w-2xl mx-auto flex gap-2">
                  <Input
                    type="text"
                    placeholder="Type your answer..."
                    value={answerInput}
                    onChange={(e) => setAnswerInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !loading) {
                        submitAnswer()
                      }
                    }}
                    disabled={loading}
                    className="flex-1 h-12 px-4 text-sm font-mono bg-white/10 backdrop-blur-xl border border-white/10 rounded-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:shadow-lg focus:shadow-primary/20 transition-all duration-300"
                  />
                  <Button
                    onClick={submitAnswer}
                    disabled={loading || !answerInput.trim()}
                    className="h-12 w-12 bg-primary text-primary-foreground rounded-sm hover:shadow-lg hover:shadow-primary/40 transition-all duration-300 disabled:opacity-40 p-0"
                  >
                    <FiSend className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========= SCORE CARD SCREEN ========= */}
        {screen === 'scorecard' && (
          <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="flex items-center justify-center gap-2 mb-2">
                <RiBrainLine className="w-6 h-6 text-primary" />
                <span className="text-lg font-mono text-primary tracking-wider">NicheNerd</span>
              </div>
              <h2 className="text-3xl font-mono font-bold text-foreground" style={{ textShadow: '0 0 15px hsl(180 100% 50% / 0.3)' }}>
                Your Score Card
              </h2>
            </div>

            {/* Score Card Image */}
            <div className="w-full max-w-md mb-8">
              {scoreCardLoading ? (
                <div className="bg-white/10 backdrop-blur-xl border border-white/10 rounded-sm p-8">
                  <Skeleton className="w-full aspect-square rounded-sm mb-4" />
                  <Skeleton className="w-3/4 h-4 mx-auto mb-2" />
                  <Skeleton className="w-1/2 h-4 mx-auto" />
                  <p className="text-center text-sm font-mono text-muted-foreground mt-4">
                    <FiRefreshCw className="w-4 h-4 inline animate-spin mr-2" />
                    Generating your score card...
                  </p>
                </div>
              ) : scoreCardUrl || showSample ? (
                <div className="bg-white/10 backdrop-blur-xl border border-white/10 rounded-sm overflow-hidden shadow-2xl shadow-primary/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={showSample ? 'https://placehold.co/600x600/1a1040/00ffff?text=NicheNerd%0AKeeb+Sensei%0A8%2F10&font=source-sans-pro' : (scoreCardUrl ?? '')}
                    alt="NicheNerd Score Card"
                    className="w-full h-auto"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement
                      target.style.display = 'none'
                    }}
                  />
                </div>
              ) : (
                // No image but show textual score card
                <Card className="bg-white/10 backdrop-blur-xl border border-primary/30 shadow-lg shadow-primary/10">
                  <CardContent className="p-8 text-center">
                    <h3 className="text-lg font-mono text-muted-foreground mb-4">Score Card</h3>
                    <p className="text-4xl font-bold font-mono text-primary mb-2">
                      {(showSample ? sampleFinal?.score : finalData?.score) ?? 0}/{(showSample ? sampleFinal?.total : finalData?.total) ?? 10}
                    </p>
                    <p className="text-lg font-mono text-foreground mb-1">
                      {(showSample ? sampleFinal?.topic : finalData?.topic) ?? topic}
                    </p>
                    {(showSample ? sampleFinal?.level_name : finalData?.level_name) && (
                      <Badge className="mb-2 bg-secondary text-secondary-foreground font-mono text-base px-4 py-1">
                        {(showSample ? sampleFinal?.level_name : finalData?.level_name) ?? ''}
                      </Badge>
                    )}
                    {(showSample ? sampleFinal?.tagline : finalData?.tagline) && (
                      <p className="text-sm text-muted-foreground italic mt-2">
                        &quot;{(showSample ? sampleFinal?.tagline : finalData?.tagline) ?? ''}&quot;
                      </p>
                    )}
                    {error && (
                      <p className="text-sm text-destructive font-mono mt-3">{error}</p>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3 justify-center max-w-md w-full mb-8">
              {(scoreCardUrl || showSample) && (
                <Button
                  onClick={downloadImage}
                  variant="outline"
                  className="flex-1 min-w-[140px] h-11 font-mono text-sm border-primary/40 text-primary hover:bg-primary/10 hover:shadow-lg hover:shadow-primary/20 transition-all duration-300"
                >
                  <FiDownload className="w-4 h-4 mr-2" />
                  Download
                </Button>
              )}
              <Button
                onClick={shareToTwitter}
                variant="outline"
                className="flex-1 min-w-[140px] h-11 font-mono text-sm border-primary/40 text-primary hover:bg-primary/10 hover:shadow-lg hover:shadow-primary/20 transition-all duration-300"
              >
                <FiShare2 className="w-4 h-4 mr-2" />
                Share
              </Button>
              <Button
                onClick={copyLink}
                variant="outline"
                className="flex-1 min-w-[140px] h-11 font-mono text-sm border-primary/40 text-primary hover:bg-primary/10 hover:shadow-lg hover:shadow-primary/20 transition-all duration-300"
              >
                {copied ? (
                  <>
                    <FiCheck className="w-4 h-4 mr-2" />
                    Copied!
                  </>
                ) : (
                  <>
                    <FiCopy className="w-4 h-4 mr-2" />
                    Copy
                  </>
                )}
              </Button>
            </div>

            {/* Play Again */}
            <Button
              onClick={playAgain}
              className="h-12 px-8 font-mono font-bold tracking-wider bg-primary text-primary-foreground rounded-sm hover:shadow-lg hover:shadow-primary/40 transition-all duration-300"
            >
              <FiRefreshCw className="w-5 h-5 mr-2" />
              PLAY AGAIN
            </Button>

            {/* Agent Status */}
            <AgentStatusCard activeAgentId={activeAgentId} />
          </div>
        )}
      </div>
    </ErrorBoundary>
  )
}
