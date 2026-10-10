import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { HERO, HEAD } from '../wash/strokes'
import { Wash } from '../wash/Wash'

const STUDIES = [
  {
    figure: '55.8% to 88%',
    line: 'of family caregivers carry a moderate to severe burden.',
    credit: 'Wang, Duan, Geng, Li, Yue, and Liu. Patient Preference and Adherence, 2024.',
    href: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11033041/',
  },
  {
    figure: 'Up to 50%',
    line: 'of informal cancer caregivers report extreme emotional stress.',
    credit: 'National Cancer Institute. Informal Caregivers in Cancer: Roles, Burden, and Support.',
    href: 'https://www.ncbi.nlm.nih.gov/books/NBK65845/',
  },
  {
    figure: '26.2% to 28.4%',
    line: 'of family members live with clinical depression or anxiety. Being the primary caregiver raises the chance of short-term depression by 17 points.',
    credit: 'Journal of Economic Behavior & Organization, 2023.',
    href: 'https://www.sciencedirect.com/science/article/pii/S016726812300207X',
  },
]

const HOW = [
  ['See who is connected.', 'Talk in a group.', 'Reach a licensed professional.'],
  ['Make an anonymous account.', 'Open your constellation.', 'Post or message.'],
  ['A checked space.', 'Support for families.', 'A badge for licensed professionals.'],
]

const FIELD_COLS = 9
const FIELD_ROWS = 7
const FIELD = Array.from({ length: FIELD_ROWS * FIELD_COLS }, (_, i) => {
  const c = i % FIELD_COLS
  const r = Math.floor(i / FIELD_COLS)
  const jx = ((r * 13 + c * 7) % 11) - 5
  const jy = ((r * 5 + c * 17) % 9) - 4
  return { x: 28 + c * 70 + jx, y: 24 + r * 68 + jy }
})
const FIELD_TIES: [number, number][] = []
FIELD.forEach((_, i) => {
  const c = i % FIELD_COLS
  const r = Math.floor(i / FIELD_COLS)
  if (c < FIELD_COLS - 1 && (r + c) % 2 === 0) FIELD_TIES.push([i, i + 1])
  if (r < FIELD_ROWS - 1 && (r + c) % 3 !== 1) FIELD_TIES.push([i, i + FIELD_COLS])
  if (c < FIELD_COLS - 1 && r < FIELD_ROWS - 1 && (r + c) % 5 === 0) FIELD_TIES.push([i, i + FIELD_COLS + 1])
})

const DOTS: [number, number][] = [
  [40, 250],
  [130, 70],
  [150, 280],
  [260, 140],
  [280, 340],
  [400, 60],
  [430, 200],
  [520, 120],
  [540, 300],
]

const TIES: [number, number][] = [
  [0, 2],
  [2, 3],
  [1, 3],
  [3, 4],
  [1, 5],
  [3, 6],
  [5, 7],
  [6, 8],
  [4, 8],
]

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

const throughView = (el: HTMLElement) => {
  const rect = el.getBoundingClientRect()
  const span = rect.height + window.innerHeight
  return Math.min(1, Math.max(0, (window.innerHeight - rect.top) / span))
}

const travel = (progress: number, stagger: number) => {
  const start = 0.02 + stagger
  const end = 0.18 + stagger
  return Math.min(1, Math.max(0, (progress - start) / (end - start)))
}

const Brush = ({ src, wide = false }: { src: string; wide?: boolean }) => (
  <img className={wide ? 'brush brush--wide' : 'brush'} src={src} alt="" />
)

const StarField = () => (
  <svg className="story__field" viewBox="0 0 640 500" role="img" aria-label="A field of stars joined by lines">
    {FIELD_TIES.map(([a, b]) => (
      <line key={`${a}-${b}`} x1={FIELD[a].x} y1={FIELD[a].y} x2={FIELD[b].x} y2={FIELD[b].y} />
    ))}
    {FIELD.map((star, i) => (
      <circle key={i} cx={star.x} cy={star.y} r={(i * 3) % 5 === 0 ? 4.5 : 2.6} />
    ))}
  </svg>
)

const ConnectingDots = ({ progress }: { progress: number }) => {
  const draw = Math.min(1, Math.max(0, (progress - 0.12) / 0.42))
  return (
    <svg className="story__dots" viewBox="0 0 580 400" role="img" aria-label="Dots drawing lines between people">
      {TIES.map(([a, b], i) => {
        const local = Math.min(1, Math.max(0, draw * TIES.length - i))
        return (
          <line
            key={`${a}-${b}`}
            x1={DOTS[a][0]}
            y1={DOTS[a][1]}
            x2={DOTS[b][0]}
            y2={DOTS[b][1]}
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={1 - local}
          />
        )
      })}
      {DOTS.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === 3 ? 8 : 5.5} opacity={draw > i / DOTS.length ? 1 : 0.25} />
      ))}
    </svg>
  )
}

const PhotoFrame = () => {
  const [missing, setMissing] = useState(false)

  return (
    <figure className="story__photo">
      {missing ? (
        <>
          <Wash strokes={HEAD} seed={11} className="story__photo-wash" />
          <figcaption className="code">public/mom.jpg</figcaption>
        </>
      ) : (
        <img src="/mom.jpg" alt="My mom and me" onError={() => setMissing(true)} />
      )}
    </figure>
  )
}

export const Landing = () => {
  const { user, profile } = useAuth()
  // Just deleted their account (see DeleteAccount)
  const left = (useLocation().state as { left?: boolean } | null)?.left === true
  const studiesRef = useRef<HTMLElement>(null)
  const dotsRef = useRef<HTMLElement>(null)
  const reduce = reducedMotion()
  const [studies, setStudies] = useState(reduce ? 1 : 0)
  const [dots, setDots] = useState(reduce ? 1 : 0)

  useEffect(() => {
    if (reduce) return
    let frame = 0
    const read = () => {
      frame = 0
      if (studiesRef.current) setStudies(throughView(studiesRef.current))
      if (dotsRef.current) setDots(throughView(dotsRef.current))
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read)
    }
    read()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [reduce])

  return (
    <div className="landing">
      <div className="landing__auth">
        {user && profile ? (
          <Link to="/constellation" className="act act--wash">
            Open
          </Link>
        ) : (
          <>
            <Link to="/signup" className="act">
              Sign up
            </Link>
            <Link to="/signin" className="act">
              Log in
            </Link>
          </>
        )}
      </div>

      {left && (
        <p className="landing__left pencil note" role="status">
          Your account and your writing have been removed.
        </p>
      )}

      <section className="story story--open" aria-label="Crafting Constellations">
        <div className="story__intro">
          <Wash strokes={HERO} className="story__wash" />
          <h1 className="story__title pencil">
            Crafting
            <br />
            Constellations
          </h1>
        </div>
        <StarField />
      </section>

      <section className="story story--why" aria-labelledby="why-title">
        <h2 className="visually-hidden" id="why-title">
          Why
        </h2>
        <PhotoFrame />
        <p className="story__quote pencil">
          When my <span className="stroke">mom<Brush src="/strokes/short.png" /></span> got cancer, all I could think about was her. I never paid
          attention to my own mental wellbeing because <span className="stroke stroke--long">how could I?<Brush src="/strokes/long.png" wide /></span>
        </p>
      </section>

      <section className="story story--studies" aria-labelledby="studies-title" ref={studiesRef}>
        <h2 className="code" id="studies-title">
          What the studies found
        </h2>
        <ol className="story__stats">
          {STUDIES.map((study, i) => {
            const t = travel(studies, i * 0.04)
            return (
              <li key={study.href} style={{ transform: `translateX(${(1 - t) * -110}%)` }}>
                <p className="story__figure pencil">
                  <span className="stroke stroke--figure">
                    {study.figure}
                    <Brush src="/strokes/figure.png" wide />
                  </span>
                </p>
                <p className="story__line">{study.line}</p>
                <a className="code" href={study.href}>
                  {study.credit}
                </a>
              </li>
            )
          })}
        </ol>
      </section>

      <section className="story story--what" aria-labelledby="what-title" ref={dotsRef}>
        <div className="story__copy">
          <h2 className="visually-hidden" id="what-title">
            What this is
          </h2>
          <p className="story__offer pencil">
            Crafting Constellations allows people to seek <span className="stroke">support<Brush src="/strokes/short.png" /></span> in a{' '}
            <span className="stroke">community.<Brush src="/strokes/figure.png" /></span>
          </p>
          <div className="story__how">
            {HOW.map((group) => (
              <ul key={group[0]}>
                {group.map((line) => (
                  <li key={line} className="pencil">
                    {line}
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
        <ConnectingDots progress={dots} />
      </section>
    </div>
  )
}
