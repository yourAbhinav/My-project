const { useEffect, useRef, useState, useMemo, useCallback } = React;

const CONFIG = {
  HER_NAME: "Bhanu",
  INTRO_TEXT: "This is for you Bhanu 💖",
 ROMANTIC_MESSAGE: `Some feelings are hard to explain
but I feel them every time I think of you.
My heart feels calm when you are near,
because it knows you are special to me.`,

  LOVE_PAGE_TITLE: "I love you ❤️",
 LOVE_PAGE_SUBTITLE: `You are the peace I never knew I needed,
the smile I don’t want to lose,
and the reason my ordinary days feel special.
My heart feels complete when you are near.`,
  QUESTION_TEXT: "Do you love me?",
  FINAL_QUOTE: `From the moment you came into my life,
everything started feeling more beautiful.
My heart feels happy when I am with you.
I just want to stay with you forever.`,
  FINAL_SONG_FILE: "Mere Nishan✨.mp3",
  TIMINGS: {
    introMs: 3800,
  },
};

const LOW_END_PROFILE = (() => {
  try {
    const prefersReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cores = navigator.hardwareConcurrency || 4;
    const memory = navigator.deviceMemory || 4;
    return prefersReduced || cores <= 4 || memory <= 4;
  } catch {
    return false;
  }
})();

if (LOW_END_PROFILE) {
  document.documentElement.classList.add("low-end-device");
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function spawnAmbientHearts(layerEl, intervalMs, maxCount) {
  if (!layerEl) return () => {};
  const icons = ["💖", "💗", "💕", "💘", "💓"];
  const tunedInterval = LOW_END_PROFILE ? Math.floor(intervalMs * 1.7) : intervalMs;
  const tunedMaxCount = LOW_END_PROFILE ? Math.max(10, Math.floor(maxCount * 0.55)) : maxCount;
  const warmupCount = LOW_END_PROFILE ? Math.min(4, tunedMaxCount) : Math.min(9, tunedMaxCount);

  const createHeart = () => {
    if (!layerEl || !layerEl.isConnected) return;
    if (layerEl.childElementCount > tunedMaxCount) {
      layerEl.firstElementChild?.remove();
    }

    const h = document.createElement("span");
    h.className = "heart";
    h.textContent = icons[Math.floor(Math.random() * icons.length)];
    h.style.left = randomBetween(0, 100) + "%";
    h.style.setProperty("--drift-x", randomBetween(-46, 46) + "px");
    h.style.animationDuration = randomBetween(LOW_END_PROFILE ? 9.5 : 7.2, LOW_END_PROFILE ? 16.5 : 13.5) + "s";
    h.style.opacity = String(randomBetween(0.45, 0.9));
    h.style.fontSize = randomBetween(13, 28) + "px";
    layerEl.appendChild(h);
    setTimeout(() => h.remove(), 14000);
  };

  const timer = setInterval(createHeart, tunedInterval);
  for (let i = 0; i < warmupCount; i++) {
    setTimeout(createHeart, i * 220);
  }

  return () => clearInterval(timer);
}

function resizeCanvas(canvas) {
  if (!canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function launchConfetti() {
  const canvas = document.getElementById("confettiCanvas");
  const ctx = canvas?.getContext("2d");
  if (!ctx || !canvas) return;

  resizeCanvas(canvas);

  const width = window.innerWidth;
  const height = window.innerHeight;

  const pieces = Array.from({ length: LOW_END_PROFILE ? 46 : 84 }, () => ({
    x: randomBetween(0, width),
    y: randomBetween(-height * 0.3, 0),
    w: randomBetween(5, 11),
    h: randomBetween(8, 16),
    vx: randomBetween(-1.4, 1.4),
    vy: randomBetween(1.9, 4.2),
    rot: randomBetween(0, Math.PI * 2),
    vr: randomBetween(-0.11, 0.11),
    c: ["#ffd166", "#ff6fa8", "#ffffff", "#ff8ec4", "#f4437e"][Math.floor(randomBetween(0, 5))],
  }));

  let frames = 0;
  function animate() {
    frames++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    pieces.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });

    if (frames < (LOW_END_PROFILE ? 90 : 150)) {
      requestAnimationFrame(animate);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  animate();
}

function launchHeartRain() {
  const canvas = document.getElementById("heartCanvas");
  const ctx = canvas?.getContext("2d");
  if (!ctx || !canvas) return;

  resizeCanvas(canvas);

  const width = window.innerWidth;
  const height = window.innerHeight;

  const drops = Array.from({ length: LOW_END_PROFILE ? 28 : 52 }, () => ({
    x: randomBetween(0, width),
    y: randomBetween(-height, -20),
    size: randomBetween(10, 24),
    speed: randomBetween(1.3, 3.8),
    sway: randomBetween(-1.2, 1.2),
    a: randomBetween(0.55, 0.97),
    emoji: ["💖", "💕", "💘", "💗"][Math.floor(randomBetween(0, 4))],
  }));

  let frame = 0;
  function draw() {
    frame++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drops.forEach((d) => {
      d.y += d.speed;
      d.x += Math.sin((frame + d.y) * 0.02) * d.sway;

      ctx.globalAlpha = d.a;
      ctx.font = d.size + "px serif";
      ctx.fillText(d.emoji, d.x, d.y);

      if (d.y > height + 10) {
        d.y = randomBetween(-100, -10);
        d.x = randomBetween(0, width);
      }
    });

    ctx.globalAlpha = 1;
    if (frame < (LOW_END_PROFILE ? 150 : 260)) {
      requestAnimationFrame(draw);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  draw();
}

const IntroScreen = React.memo(function IntroScreen({ active, heartsRef, introText }) {
  return (
    <section className={"screen" + (active ? " active" : "") }>
      <div className="hearts-layer" ref={heartsRef}></div>
      <div className="romantic-glass">
        <h1 className="script-title">{introText}</h1>
      </div>
    </section>
  );
});

const MessageScreen = React.memo(function MessageScreen({ active, heartsRef, onContinue, message }) {
  return (
    <section className={"screen" + (active ? " active" : "") } onClick={onContinue}>
      <div className="hearts-layer" ref={heartsRef}></div>
      <div className="romantic-glass">
        <p className="main-text" style={{ maxWidth: "42ch", margin: "0 auto" }}>{message}</p>
        <p className="tiny-note">Tap anywhere to continue 💗</p>
      </div>
    </section>
  );
});

const LoveScreen = React.memo(function LoveScreen({ active, heartsRef, onContinue, title, subtitle }) {
  return (
    <section className={"screen" + (active ? " active" : "") } onClick={onContinue}>
      <div className="hearts-layer" ref={heartsRef}></div>
      <div className="romantic-glass">
        <p className="script-title" style={{ fontSize: "clamp(2.2rem, 7.8vw, 4.4rem)", marginBottom: "8px" }}>
          {title}
        </p>
        <p className="main-text" style={{ maxWidth: "36ch", margin: "0 auto" }}>{subtitle}</p>
        <p className="tiny-note">Tap anywhere to continue 💌</p>
      </div>
    </section>
  );
});

const QuestionScreen = React.memo(function QuestionScreen({
  active,
  heartsRef,
  questionText,
  onYes,
  onNo,
  onNoTransitionEnd,
  noBursting,
  noVanishing,
  noGone,
  yesClicked,
}) {
  return (
    <section className={"screen question-screen" + (active ? " active" : "") }>
      <div className="hearts-layer" ref={heartsRef}></div>
      <div className="romantic-glass">
        <p className="script-title" style={{ fontSize: "clamp(2.1rem, 7vw, 4rem)", marginBottom: "12px" }}>
          {questionText}
        </p>
        <div className="button-row">
          <button className="btn btn-yes" onClick={onYes} disabled={yesClicked}>
            YES 💖
          </button>
          {!noGone && (
            <button
              id="noBtn"
              className={"btn btn-no" + (noBursting ? " burst" : "") + (noVanishing ? " vanish" : "")}
              onClick={onNo}
              onTransitionEnd={onNoTransitionEnd}
              disabled={yesClicked || noBursting || noVanishing}
            >
              <span className="burst-spread" aria-hidden="true"></span>
              NO 😢
            </button>
          )}
        </div>
      </div>
    </section>
  );
});

const FinalScreen = React.memo(function FinalScreen({ active, heartsRef, quote, onPlaySong, isNavigating }) {
  return (
    <section className={"screen final-screen" + (active ? " active" : "") }>
      <div className="hearts-layer" ref={heartsRef}></div>
      <div className="romantic-glass">
        <div className="final-heart">💖</div>
        <p className="main-text" style={{ maxWidth: "40ch", margin: "0 auto" }}>{quote}</p>
        <div className="button-row" style={{ marginTop: "18px" }}>
          <button className="btn btn-yes" onClick={onPlaySong} disabled={isNavigating}>
            {isNavigating ? "Opening Lyrics..." : "Play Song 🎵"}
          </button>
        </div>
      </div>
    </section>
  );
});

function App() {
  const [screen, setScreen] = useState("intro");
  const [yesClicked, setYesClicked] = useState(false);
  const [noBursting, setNoBursting] = useState(false);
  const [noVanishing, setNoVanishing] = useState(false);
  const [noGone, setNoGone] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);

  const finalSongRef = useRef(null);
  const introHeartsRef = useRef(null);
  const messageHeartsRef = useRef(null);
  const loveHeartsRef = useRef(null);
  const questionHeartsRef = useRef(null);
  const finalHeartsRef = useRef(null);
  const noBurstTimerRef = useRef(0);
  const noVanishTimerRef = useRef(0);
  const stopActiveHeartsRef = useRef(() => {});

  const introText = useMemo(() => CONFIG.INTRO_TEXT.replace("Bhanu", CONFIG.HER_NAME), []);

  useEffect(() => {
    document.title = "For " + CONFIG.HER_NAME;
  }, []);

  useEffect(() => {
    stopActiveHeartsRef.current();

    const stopByScreen = {
      intro: () => spawnAmbientHearts(introHeartsRef.current, 520, 24),
      message: () => spawnAmbientHearts(messageHeartsRef.current, 540, 26),
      love: () => spawnAmbientHearts(loveHeartsRef.current, 530, 26),
      question: () => spawnAmbientHearts(questionHeartsRef.current, 490, 28),
      final: () => spawnAmbientHearts(finalHeartsRef.current, 420, 36),
    };

    const start = stopByScreen[screen];
    stopActiveHeartsRef.current = start ? start() : () => {};

    return () => {
      stopActiveHeartsRef.current();
      stopActiveHeartsRef.current = () => {};
    };
  }, [screen]);

  useEffect(() => {
    const introTimer = setTimeout(() => {
      setScreen("message");
    }, CONFIG.TIMINGS.introMs);

    return () => clearTimeout(introTimer);
  }, []);

  useEffect(() => {
    const onResize = () => {
      resizeCanvas(document.getElementById("confettiCanvas"));
      resizeCanvas(document.getElementById("heartCanvas"));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (screen === "question") {
      if (noBurstTimerRef.current) {
        clearTimeout(noBurstTimerRef.current);
        noBurstTimerRef.current = 0;
      }
      if (noVanishTimerRef.current) {
        clearTimeout(noVanishTimerRef.current);
        noVanishTimerRef.current = 0;
      }
      setNoBursting(false);
      setNoVanishing(false);
      setNoGone(false);
    }
  }, [screen]);

  useEffect(() => {
    return () => {
      if (noBurstTimerRef.current) clearTimeout(noBurstTimerRef.current);
      if (noVanishTimerRef.current) clearTimeout(noVanishTimerRef.current);
    };
  }, []);

  const goToLovePage = useCallback(() => {
    if (screen === "message") setScreen("love");
  }, [screen]);

  const goToQuestionPage = useCallback(() => {
    if (screen === "love") setScreen("question");
  }, [screen]);

  const handleYesClick = useCallback(() => {
    if (yesClicked) return;
    setYesClicked(true);
    setScreen("final");
    requestAnimationFrame(() => {
      launchConfetti();
      launchHeartRain();
    });
  }, [yesClicked]);

  const handleNoClick = useCallback(() => {
    if (yesClicked || noBursting || noVanishing || noGone) return;

    setNoBursting(true);

    noBurstTimerRef.current = window.setTimeout(() => {
      setNoBursting(false);
      setNoVanishing(true);
      noBurstTimerRef.current = 0;

      // Fallback if transitionend misses on some browsers.
      noVanishTimerRef.current = window.setTimeout(() => {
        setNoGone(true);
        noVanishTimerRef.current = 0;
      }, 760);
    }, 430);
  }, [yesClicked, noBursting, noVanishing, noGone]);

  const handleNoTransitionEnd = useCallback((e) => {
    if (!noVanishing || e.propertyName !== "opacity") return;
    if (noVanishTimerRef.current) {
      clearTimeout(noVanishTimerRef.current);
      noVanishTimerRef.current = 0;
    }
    setNoGone(true);
  }, [noVanishing]);

  const handleSongToggle = useCallback((e) => {
    e.stopPropagation();
    if (isNavigating) return;
    setIsNavigating(true);

    if (finalSongRef.current) {
      finalSongRef.current.pause();
      finalSongRef.current.currentTime = 0;
    }

    window.location.href = "lyrics.html";
  }, [isNavigating]);

  return (
    <>
      <audio ref={finalSongRef} src={CONFIG.FINAL_SONG_FILE} loop preload="auto"></audio>

      <IntroScreen active={screen === "intro"} heartsRef={introHeartsRef} introText={introText} />

      <MessageScreen
        active={screen === "message"}
        heartsRef={messageHeartsRef}
        onContinue={goToLovePage}
        message={CONFIG.ROMANTIC_MESSAGE}
      />

      <LoveScreen
        active={screen === "love"}
        heartsRef={loveHeartsRef}
        onContinue={goToQuestionPage}
        title={CONFIG.LOVE_PAGE_TITLE}
        subtitle={CONFIG.LOVE_PAGE_SUBTITLE}
      />

      <QuestionScreen
        active={screen === "question"}
        heartsRef={questionHeartsRef}
        questionText={CONFIG.QUESTION_TEXT}
        onYes={handleYesClick}
        onNo={handleNoClick}
        onNoTransitionEnd={handleNoTransitionEnd}
        noBursting={noBursting}
        noVanishing={noVanishing}
        noGone={noGone}
        yesClicked={yesClicked}
      />

      <FinalScreen
        active={screen === "final"}
        heartsRef={finalHeartsRef}
        quote={CONFIG.FINAL_QUOTE}
        onPlaySong={handleSongToggle}
        isNavigating={isNavigating}
      />
    </>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
