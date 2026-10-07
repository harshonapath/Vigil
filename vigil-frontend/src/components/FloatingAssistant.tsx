import { useEffect, useState } from "react"
import { useLocation } from "react-router-dom"
import { ArrowRight, ArrowUp, ShieldCheck, Sparkles, X } from "lucide-react"
import { useApp, type Lang } from "../contexts/AppContext"
import vigilBotImage from "../imports/vigil-ai-bot.png"

interface AssistantContext {
  hint: Record<Lang, string>
  body: Record<Lang, string>
  suggestions: Record<Lang, string[]>
}

const CONTEXT: Record<string, AssistantContext> = {
  "/dashboard": {
    hint: {
      en: "Security workspace overview",
      hi: "सुरक्षा वर्कस्पेस का सारांश",
      hinglish: "Security workspace ka overview",
    },
    body: {
      en: "3 pull requests need a human decision. PR #47 has 2 critical findings, with JWT secret exposure as the highest priority.",
      hi: "3 पुल रिक्वेस्ट पर मानवीय निर्णय आवश्यक है। PR #47 में 2 गंभीर समस्याएँ हैं, जिनमें JWT सीक्रेट सबसे महत्वपूर्ण है।",
      hinglish:
        "3 Pull Requests ko human decision chahiye. PR #47 mein 2 critical findings hain; JWT secret exposure sabse high priority hai.",
    },
    suggestions: {
      en: [
        "What needs my attention?",
        "Summarize the security findings",
        "Show the highest-risk issue",
        "Explain the current review status",
      ],
      hi: [
        "मुझे किस पर ध्यान देना चाहिए?",
        "सुरक्षा समस्याओं का सारांश दें",
        "सबसे गंभीर समस्या दिखाएँ",
        "वर्तमान समीक्षा स्थिति समझाएँ",
      ],
      hinglish: [
        "Mujhe kis par attention dena chahiye?",
        "Security findings summarize karo",
        "Highest-risk issue dikhao",
        "Current review status explain karo",
      ],
    },
  },
  "/pull-requests": {
    hint: {
      en: "Pull Request review context",
      hi: "पुल रिक्वेस्ट समीक्षा संदर्भ",
      hinglish: "Pull Request review context",
    },
    body: {
      en: "PR #47 introduces a hardcoded JWT secret that could allow token forgery. AI review is complete, but the human decision is still pending.",
      hi: "PR #47 में हार्डकोडेड JWT सीक्रेट है जिससे टोकन जालसाजी हो सकती है। AI समीक्षा पूरी है, लेकिन मानवीय निर्णय लंबित है।",
      hinglish:
        "PR #47 mein hardcoded JWT secret hai jo token forgery allow kar sakta hai. AI review complete hai, lekin human decision pending hai.",
    },
    suggestions: {
      en: [
        "Which PR needs my attention?",
        "Summarize the highest-risk PR",
        "Show PRs awaiting human review",
        "Explain the current review status",
      ],
      hi: [
        "किस PR पर ध्यान देना चाहिए?",
        "सबसे जोखिम वाले PR का सारांश दें",
        "मानवीय समीक्षा की प्रतीक्षा वाले PR दिखाएँ",
        "वर्तमान समीक्षा स्थिति समझाएँ",
      ],
      hinglish: [
        "Kaunsa PR attention chahta hai?",
        "Highest-risk PR summarize karo",
        "Human review ka wait kar rahe PRs dikhao",
        "Current review status explain karo",
      ],
    },
  },
  "/findings": {
    hint: {
      en: "Security finding context",
      hi: "सुरक्षा समस्या का संदर्भ",
      hinglish: "Security Finding context",
    },
    body: {
      en: "2 critical findings are open. Hardcoded secrets are the most common pattern and should be remediated before merge.",
      hi: "2 गंभीर समस्याएँ खुली हैं। हार्डकोडेड सीक्रेट सबसे सामान्य पैटर्न है और मर्ज से पहले इसे ठीक करना चाहिए।",
      hinglish:
        "2 critical findings open hain. Hardcoded secrets sabse common pattern hai; merge se pehle fix karna chahiye.",
    },
    suggestions: {
      en: [
        "Show the highest-risk finding",
        "Explain this security finding",
        "Which findings need action?",
        "Summarize the security findings",
      ],
      hi: [
        "सबसे जोखिम वाली समस्या दिखाएँ",
        "यह सुरक्षा समस्या समझाएँ",
        "किन समस्याओं पर कार्रवाई चाहिए?",
        "सुरक्षा समस्याओं का सारांश दें",
      ],
      hinglish: [
        "Highest-risk finding dikhao",
        "Yeh security finding explain karo",
        "Kaunsi findings ko action chahiye?",
        "Security findings summarize karo",
      ],
    },
  },
  "/review-history": {
    hint: {
      en: "Security review history",
      hi: "सुरक्षा समीक्षा इतिहास",
      hinglish: "Security review history",
    },
    body: {
      en: "I can summarize recent security reviews, explain their findings, and help you understand the recorded human decisions.",
      hi: "मैं हाल की सुरक्षा समीक्षाओं और उनकी समस्याओं का सारांश देकर दर्ज मानवीय निर्णय समझने में मदद कर सकता हूँ।",
      hinglish:
        "Main recent security reviews aur findings summarize karke recorded human decisions samajhne mein help kar sakta hoon.",
    },
    suggestions: {
      en: [
        "Show recent changes requested",
        "Summarize recent security reviews",
        "Which reviews had findings?",
        "Explain the latest human decision",
      ],
      hi: [
        "हाल में माँगे गए बदलाव दिखाएँ",
        "हाल की सुरक्षा समीक्षाओं का सारांश दें",
        "किन समीक्षाओं में समस्याएँ थीं?",
        "नवीनतम मानवीय निर्णय समझाएँ",
      ],
      hinglish: [
        "Recent changes requested dikhao",
        "Recent security reviews summarize karo",
        "Kaunsi reviews mein findings thi?",
        "Latest human decision explain karo",
      ],
    },
  },
  "/repositories": {
    hint: {
      en: "Repository security context",
      hi: "रिपॉजिटरी सुरक्षा संदर्भ",
      hinglish: "Repository security context",
    },
    body: {
      en: "I can summarize repository security signals and help you understand which connected repository may need review.",
      hi: "मैं रिपॉजिटरी सुरक्षा संकेतों का सारांश देकर यह समझने में मदद कर सकता हूँ कि किस रिपॉजिटरी की समीक्षा आवश्यक है।",
      hinglish:
        "Main repository security signals summarize karke samajhne mein help kar sakta hoon ki kis repository ko review chahiye.",
    },
    suggestions: {
      en: [
        "Which repository needs attention?",
        "Show repositories with security findings",
        "Summarize repository security status",
        "Explain recent repository activity",
      ],
      hi: [
        "किस रिपॉजिटरी पर ध्यान देना चाहिए?",
        "सुरक्षा समस्याओं वाली रिपॉजिटरी दिखाएँ",
        "रिपॉजिटरी सुरक्षा स्थिति का सारांश दें",
        "हाल की रिपॉजिटरी गतिविधि समझाएँ",
      ],
      hinglish: [
        "Kaunsi repository ko attention chahiye?",
        "Security findings wali repositories dikhao",
        "Repository security status summarize karo",
        "Recent repository activity explain karo",
      ],
    },
  },
  "/commits": {
    hint: {
      en: "Commit analysis context",
      hi: "कमिट विश्लेषण संदर्भ",
      hinglish: "Commit analysis context",
    },
    body: {
      en: "I can explain security-sensitive commit signals and help you understand which changes may require closer review.",
      hi: "मैं सुरक्षा-संवेदनशील कमिट संकेत समझाकर यह जानने में मदद कर सकता हूँ कि किन बदलावों की अधिक समीक्षा आवश्यक है।",
      hinglish:
        "Main security-sensitive commit signals explain karke batane mein help kar sakta hoon ki kaunse changes ko closer review chahiye.",
    },
    suggestions: {
      en: [
        "Which commit needs attention?",
        "Summarize flagged commit changes",
        "Show the highest-risk change",
        "Explain the commit analysis",
      ],
      hi: [
        "किस कमिट पर ध्यान देना चाहिए?",
        "चिह्नित कमिट बदलावों का सारांश दें",
        "सबसे जोखिम वाला बदलाव दिखाएँ",
        "कमिट विश्लेषण समझाएँ",
      ],
      hinglish: [
        "Kaunsa commit attention chahta hai?",
        "Flagged commit changes summarize karo",
        "Highest-risk change dikhao",
        "Commit analysis explain karo",
      ],
    },
  },
  "/analytics": {
    hint: {
      en: "Security analytics context",
      hi: "सुरक्षा विश्लेषिकी संदर्भ",
      hinglish: "Security analytics context",
    },
    body: {
      en: "I can summarize the security trends on this page and help you understand changes in findings and human review activity.",
      hi: "मैं इस पेज के सुरक्षा रुझानों का सारांश देकर समस्याओं और मानवीय समीक्षा गतिविधि में बदलाव समझने में मदद कर सकता हूँ।",
      hinglish:
        "Main is page ke security trends summarize karke findings aur human review activity ke changes samajhne mein help kar sakta hoon.",
    },
    suggestions: {
      en: [
        "Summarize the security trends",
        "What changed this period?",
        "Show the highest-risk pattern",
        "Explain review activity",
      ],
      hi: [
        "सुरक्षा रुझानों का सारांश दें",
        "इस अवधि में क्या बदला?",
        "सबसे जोखिम वाला पैटर्न दिखाएँ",
        "समीक्षा गतिविधि समझाएँ",
      ],
      hinglish: [
        "Security trends summarize karo",
        "Is period mein kya change hua?",
        "Highest-risk pattern dikhao",
        "Review activity explain karo",
      ],
    },
  },
  "/settings": {
    hint: {
      en: "Vigil workspace context",
      hi: "Vigil वर्कस्पेस संदर्भ",
      hinglish: "Vigil workspace context",
    },
    body: {
      en: "I can explain the Vigil workspace options shown on this page without changing your security-review decisions.",
      hi: "मैं आपके सुरक्षा-समीक्षा निर्णय बदले बिना इस पेज पर दिखाए गए Vigil वर्कस्पेस विकल्प समझा सकता हूँ।",
      hinglish:
        "Main aapke security-review decisions change kiye bina is page ke Vigil workspace options explain kar sakta hoon.",
    },
    suggestions: {
      en: [
        "Explain these workspace settings",
        "How does language selection work?",
        "Summarize the account options",
        "What can I configure here?",
      ],
      hi: [
        "इन वर्कस्पेस सेटिंग्स को समझाएँ",
        "भाषा चयन कैसे काम करता है?",
        "खाता विकल्पों का सारांश दें",
        "मैं यहाँ क्या कॉन्फ़िगर कर सकता हूँ?",
      ],
      hinglish: [
        "Yeh workspace settings explain karo",
        "Language selection kaise kaam karta hai?",
        "Account options summarize karo",
        "Main yahan kya configure kar sakta hoon?",
      ],
    },
  },
}

const DEFAULT_CONTEXT: AssistantContext = {
  hint: {
    en: "Context-aware security assistant",
    hi: "संदर्भ-आधारित सुरक्षा सहायक",
    hinglish: "Context-aware security assistant",
  },
  body: {
    en: "I can summarize the security signals on this page and help you understand what needs review.",
    hi: "मैं इस पेज के सुरक्षा संकेतों का सारांश देकर यह समझने में मदद कर सकता हूँ कि किसकी समीक्षा आवश्यक है।",
    hinglish:
      "Main is page ke security signals summarize karke samajhne mein help kar sakta hoon ki kya review chahiye.",
  },
  suggestions: {
    en: [
      "What needs my attention?",
      "Summarize the security findings",
      "Show the highest-risk issue",
      "Explain the current review status",
    ],
    hi: [
      "मुझे किस पर ध्यान देना चाहिए?",
      "सुरक्षा समस्याओं का सारांश दें",
      "सबसे गंभीर समस्या दिखाएँ",
      "वर्तमान समीक्षा स्थिति समझाएँ",
    ],
    hinglish: [
      "Mujhe kis par attention dena chahiye?",
      "Security findings summarize karo",
      "Highest-risk issue dikhao",
      "Current review status explain karo",
    ],
  },
}

function getAssistantContext(pathname: string) {
  if (pathname.startsWith("/repositories")) return CONTEXT["/repositories"]
  return CONTEXT[pathname] ?? DEFAULT_CONTEXT
}

export default function FloatingAssistant() {
  const { lang, t } = useApp()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState("")
  const [answer, setAnswer] = useState("")
  const context = getAssistantContext(location.pathname)

  useEffect(() => {
    setOpen(false)
    setAnswer("")
    setInput("")
  }, [location.pathname])

  useEffect(() => {
    const closeForTour = () => setOpen(false)
    window.addEventListener("vigil-tour-start", closeForTour)
    return () => window.removeEventListener("vigil-tour-start", closeForTour)
  }, [])

  const submitQuestion = (question = input) => {
    if (!question.trim()) return
    setInput("")
    window.setTimeout(() => setAnswer(context.body[lang]), 180)
  }

  return (
    <>
      <aside
        id="vigil-assistant-panel"
        className={`assistant-panel${open ? " is-open" : ""}`}
        aria-label={t("askVigilAI")}
        aria-hidden={!open}
        inert={!open}
      >
        <header className="assistant-header">
          <div className="assistant-identity">
            <img
              className="assistant-bot-image assistant-bot-image-header"
              src={vigilBotImage}
              alt=""
              aria-hidden="true"
            />
            <div>
              <strong>{t("askVigilAI")}</strong>
              <span>
                <i /> {t("securityAssistantSubtitle")}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="assistant-icon-button"
            onClick={() => setOpen(false)}
            aria-label={t("close")}
          >
            <X size={16} />
          </button>
        </header>

        <div className="assistant-content">
          <div className="assistant-context-label">
            <span>
              <Sparkles size={12} /> {t("contextualInsight")}
            </span>
            <small>{context.hint[lang]}</small>
          </div>
          <div className="assistant-insight">{context.body[lang]}</div>

          <div className="assistant-guidance">
            <ShieldCheck size={14} />
            <div>
              <strong>{t("remediationGuidance")}</strong>
              <span>{t("remediationBody")}</span>
            </div>
          </div>

          <div className="assistant-section-label">
            {t("suggestedQuestions")}
          </div>
          <div className="assistant-suggestions">
            {context.suggestions[lang].map((suggestion) => (
              <button
                type="button"
                key={suggestion}
                onClick={() => {
                  setInput(suggestion)
                  submitQuestion(suggestion)
                }}
              >
                {suggestion}
                <ArrowRight size={12} />
              </button>
            ))}
          </div>

          {answer && (
            <div className="assistant-answer">
              <span>
                <img
                  className="assistant-bot-image assistant-bot-image-answer"
                  src={vigilBotImage}
                  alt=""
                  aria-hidden="true"
                />
              </span>
              <p>{answer}</p>
            </div>
          )}
        </div>

        <div className="assistant-composer">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submitQuestion()
            }}
            placeholder={t("askPlaceholder")}
          />
          <button
            type="button"
            onClick={() => submitQuestion()}
            disabled={!input.trim()}
            aria-label={t("send")}
          >
            <ArrowUp size={14} />
          </button>
        </div>
      </aside>

      <button
        type="button"
        data-tour-target="ask-vigil-ai"
        className={`assistant-trigger${open ? " active" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="vigil-assistant-panel"
        aria-label={t("askVigilAI")}
      >
        <img
          className="assistant-bot-image assistant-bot-image-trigger"
          src={vigilBotImage}
          alt=""
          aria-hidden="true"
        />
        <span className="assistant-trigger-tooltip" role="tooltip">
          {t("askVigilAI")}
        </span>
      </button>
    </>
  )
}
