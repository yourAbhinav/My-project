const { useEffect, useRef, useState } = React;

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

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  const createHeart = () => {
    if (!layerEl || !layerEl.isConnected) return;
    if (layerEl.childElementCount > maxCount) {
      layerEl.firstElementChild?.remove();
    }

    const h = document.createElement("span");
    h.className = "heart";
    h.textContent = icons[Math.floor(Math.random() * icons.length)];
    h.style.left = randomBetween(0, 100) + "%";
    h.style.setProperty("--drift-x", randomBetween(-46, 46) + "px");
    h.style.animationDuration = randomBetween(7.2, 13.5) + "s";
    h.style.opacity = String(randomBetween(0.45, 0.9));
    h.style.fontSize = randomBetween(13, 28) + "px";
    layerEl.appendChild(h);
    setTimeout(() => h.remove(), 14000);
  };

  const timer = setInterval(createHeart, intervalMs);
  for (let i = 0; i < Math.min(9, maxCount); i++) {
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

  const pieces = Array.from({ length: 140 }, () => ({
    x: randomBetween(0, canvas.width),
    y: randomBetween(-canvas.height * 0.3, 0),
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

    if (frames < 220) {
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

  const drops = Array.from({ length: 90 }, () => ({
    x: randomBetween(0, canvas.width),
    y: randomBetween(-canvas.height, -20),
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

      if (d.y > canvas.height + 10) {
        d.y = randomBetween(-100, -10);
        d.x = randomBetween(0, canvas.width);
      }
    });

    ctx.globalAlpha = 1;
    if (frame < 430) {
      requestAnimationFrame(draw);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  draw();
}

function App() {
  const [screen, setScreen] = useState("intro");
  const [yesClicked, setYesClicked] = useState(false);
  const [noPos, setNoPos] = useState({ x: 0, y: 0 });
  const [noMoving, setNoMoving] = useState(false);
  const [songPlaying, setSongPlaying] = useState(false);

  const finalSongRef = useRef(null);
  const introHeartsRef = useRef(null);
  const messageHeartsRef = useRef(null);
  const loveHeartsRef = useRef(null);
  const questionHeartsRef = useRef(null);
  const finalHeartsRef = useRef(null);
  const buttonRowRef = useRef(null);

  const introText = CONFIG.INTRO_TEXT.replace("Bhanu", CONFIG.HER_NAME);

  useEffect(() => {
    document.title = "For " + CONFIG.HER_NAME;
  }, []);

  useEffect(() => {
    const cleanups = [
      spawnAmbientHearts(introHeartsRef.current, 520, 28),
      spawnAmbientHearts(messageHeartsRef.current, 530, 30),
      spawnAmbientHearts(loveHeartsRef.current, 500, 30),
      spawnAmbientHearts(questionHeartsRef.current, 470, 32),
      spawnAmbientHearts(finalHeartsRef.current, 360, 44),
    ];

    return () => {
      cleanups.forEach((stop) => stop());
    };
  }, []);

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
    const audio = finalSongRef.current;
    if (!audio) return;

    const onPlay = () => setSongPlaying(true);
    const onPause = () => setSongPlaying(false);

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);

    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, []);

  useEffect(() => {
    const handlePointerMove = (pointer) => {
      if (screen !== "question" || yesClicked || !buttonRowRef.current) return;

      const noBtn = document.getElementById("noBtn");
      if (!noBtn) return;

      const noRect = noBtn.getBoundingClientRect();
      const centerX = noRect.left + noRect.width / 2;
      const centerY = noRect.top + noRect.height / 2;
      const dist = Math.hypot(pointer.clientX - centerX, pointer.clientY - centerY);

      if (dist > 170) return;

      const rowRect = buttonRowRef.current.getBoundingClientRect();
      const maxShiftX = Math.max(120, rowRect.width * 0.42);
      const maxShiftY = Math.max(68, rowRect.height * 0.75);
      const dirX = pointer.clientX > centerX ? -1 : 1;
      const shiftX = dirX * randomBetween(86, maxShiftX);
      const shiftY = randomBetween(-maxShiftY, maxShiftY);

      setNoPos((prev) => ({
        x: clamp(prev.x + shiftX, -maxShiftX, maxShiftX),
        y: clamp(prev.y + shiftY, -maxShiftY, maxShiftY),
      }));
      setNoMoving(true);
      window.setTimeout(() => setNoMoving(false), 320);
    };

    const onMouseMove = (e) => handlePointerMove(e);
    const onTouchStart = (e) => {
      if (e.touches && e.touches[0]) {
        handlePointerMove(e.touches[0]);
      }
    };

    document.body.addEventListener("mousemove", onMouseMove, { passive: true });
    document.body.addEventListener("touchstart", onTouchStart, { passive: true });

    return () => {
      document.body.removeEventListener("mousemove", onMouseMove);
      document.body.removeEventListener("touchstart", onTouchStart);
    };
  }, [screen, yesClicked]);

  function goToLovePage() {
    if (screen === "message") setScreen("love");
  }

  function goToQuestionPage() {
    if (screen === "love") setScreen("question");
  }

  async function handleYesClick() {
    if (yesClicked) return;
    setYesClicked(true);
    launchConfetti();
    launchHeartRain();
    await wait(450);
    setScreen("final");
  }

  function handleNoClick(e) {
    e.preventDefault();
    if (!buttonRowRef.current) return;

    const rowRect = buttonRowRef.current.getBoundingClientRect();
    const maxShiftX = Math.max(120, rowRect.width * 0.42);
    const maxShiftY = Math.max(68, rowRect.height * 0.75);

    setNoPos((prev) => ({
      x: clamp(prev.x + randomBetween(-maxShiftX, maxShiftX), -maxShiftX, maxShiftX),
      y: clamp(prev.y + randomBetween(-maxShiftY, maxShiftY), -maxShiftY, maxShiftY),
    }));
    setNoMoving(true);
    window.setTimeout(() => setNoMoving(false), 320);
  }

  async function handleSongToggle(e) {
    e.stopPropagation();
    if (finalSongRef.current) {
      finalSongRef.current.pause();
      finalSongRef.current.currentTime = 0;
    }
    window.location.href = "lyrics.html";
  }

  return (
    <>
      <audio ref={finalSongRef} src={CONFIG.FINAL_SONG_FILE} loop preload="auto"></audio>

      <section className={"screen" + (screen === "intro" ? " active" : "") }>
        <div className="hearts-layer" ref={introHeartsRef}></div>
        <div className="romantic-glass">
          <h1 className="script-title">{introText}</h1>
        </div>
      </section>

      <section className={"screen" + (screen === "message" ? " active" : "") } onClick={goToLovePage}>
        <div className="hearts-layer" ref={messageHeartsRef}></div>
        <div className="romantic-glass">
          <p className="main-text" style={{ maxWidth: "42ch", margin: "0 auto" }}>{CONFIG.ROMANTIC_MESSAGE}</p>
          <p className="tiny-note">Tap anywhere to continue 💗</p>
        </div>
      </section>

      <section className={"screen" + (screen === "love" ? " active" : "") } onClick={goToQuestionPage}>
        <div className="hearts-layer" ref={loveHeartsRef}></div>
        <div className="romantic-glass">
          <p className="script-title" style={{ fontSize: "clamp(2.2rem, 7.8vw, 4.4rem)", marginBottom: "8px" }}>
            {CONFIG.LOVE_PAGE_TITLE}
          </p>
          <p className="main-text" style={{ maxWidth: "36ch", margin: "0 auto" }}>{CONFIG.LOVE_PAGE_SUBTITLE}</p>
          <p className="tiny-note">Tap anywhere to continue 💌</p>
        </div>
      </section>

      <section className={"screen question-screen" + (screen === "question" ? " active" : "") }>
        <div className="hearts-layer" ref={questionHeartsRef}></div>
        <div className="romantic-glass">
          <p className="script-title" style={{ fontSize: "clamp(2.1rem, 7vw, 4rem)", marginBottom: "12px" }}>
            {CONFIG.QUESTION_TEXT}
          </p>
          <div className="button-row" ref={buttonRowRef}>
            <button className="btn btn-yes" onClick={handleYesClick} disabled={yesClicked}>
              YES 💖
            </button>
            <button
              id="noBtn"
              className={"btn btn-no" + (noMoving ? " moving" : "")}
              onClick={handleNoClick}
              disabled={yesClicked}
              style={{ transform: `translate(${noPos.x}px, ${noPos.y}px)`, opacity: yesClicked ? 0.45 : 1 }}
            >
              NO 😢
            </button>
          </div>
        </div>
      </section>

      <section className={"screen final-screen" + (screen === "final" ? " active" : "") }>
        <div className="hearts-layer" ref={finalHeartsRef}></div>
        <div className="romantic-glass">
          <div className="final-heart">💖</div>
          <p className="main-text" style={{ maxWidth: "40ch", margin: "0 auto" }}>{CONFIG.FINAL_QUOTE}</p>
          <div className="button-row" style={{ marginTop: "18px" }}>
            <button className="btn btn-yes" onClick={handleSongToggle}>
              Play Song 🎵
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
