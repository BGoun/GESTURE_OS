(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const video = $("webcam");
  const overlay = $("overlay");
  const ctx = overlay.getContext("2d");
  const startButton = $("startButton");
  const stopButton = $("stopButton");
  const statusDot = $("statusDot");
  const cameraDot = $("cameraDot");
  const systemStatus = $("systemStatus");
  const gestureName = $("gestureName");
  const gestureHint = $("gestureHint");
  const gestureIcon = $("gestureIcon");
  const confidenceValue = $("confidenceValue");
  const trackingStatus = $("trackingStatus");
  const trackingBar = $("trackingBar");
  const placeholder = $("cameraPlaceholder");
  const webcamCard = $("webcamCard");
  const activityLog = $("activityLog");
  const appDialog = $("appDialog");
  const settingsDialog = $("settingsDialog");

  let stream = null;
  let landmarker = null;
  let tmModel = null;
  let tmModelLoading = false;
  let rafId = null;
  let running = false;
  let starting = false;
  let lastPredictionAt = 0;
  let predictionInFlight = false;
  let lastGesture = "NONE";
  let candidateGesture = "NONE";
  let candidateSince = 0;
  let lastActionAt = 0;
  let menuOpen = false;
  let selectedIndex = 0;
  let mirror = true;
  let sensitivity = 0.65;
  let cameraVisible = true;
  let toastTimer = null;
  let lastLogGesture = "";

  const apps = {
    media: { title: "미디어 센터", description: "브라우저에서 재생 가능한 미디어를 연결할 수 있는 제어 패널입니다. 현재는 인터페이스 데모입니다.", icon: "♫" },
    games: { title: "미니게임", description: "손동작을 활용한 미니게임 허브입니다. 게임 모듈을 이 화면에 추가할 수 있습니다.", icon: "◈" },
    effects: { title: "화면 효과", description: "손의 움직임을 따라오는 파티클과 시각 효과를 추가할 수 있습니다.", icon: "✧" },
    settings: { title: "환경 설정", description: "카메라와 입력 감도, 미리보기 옵션을 조정합니다.", icon: "⌘" }
  };
  const gestureMeta = {
    OPEN_PALM: ["손바닥 펼치기", "메인 메뉴 토글", "✋"],
    FIST: ["주먹 쥐기", "선택 항목 실행", "✊"],
    POINT: ["검지 들기", "포인터 모드", "☝"],
    THUMBS_UP: ["엄지 올리기", "뒤로 가기", "👍"],
    PEACE: ["브이 표시", "빠른 설정", "✌"],
    OK_SIGN: ["OK 사인", "확인 및 선택", "👌"],
    ROCK: ["록 사인", "미니게임 열기", "🤘"],
    LEFT: ["왼쪽 가리키기", "이전 항목", "←"],
    RIGHT: ["오른쪽 가리키기", "다음 항목", "→"],
    THREE: ["손가락 세 개", "미디어 센터", "☷"],
    NONE: ["동작 감지 중", "손을 카메라에 보여주세요.", "⌁"]
  };

  function setStatus(text, active = false) {
    systemStatus.textContent = text;
    statusDot.classList.toggle("active", active);
    cameraDot.classList.toggle("active", active);
  }

  function showToast(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
  }

  function addLog(message, tag = "GESTURE") {
    const empty = activityLog.querySelector(".empty-log");
    if (empty) empty.remove();
    const item = document.createElement("div");
    item.className = "log-item";
    const time = new Date().toLocaleTimeString("ko-KR", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const timeEl = document.createElement("span");
    timeEl.className = "log-time";
    timeEl.textContent = time;
    const label = document.createElement("span");
    label.className = "log-label";
    label.textContent = message;
    const tagEl = document.createElement("span");
    tagEl.className = "log-tag";
    tagEl.textContent = tag;
    item.append(timeEl, label, tagEl);
    activityLog.prepend(item);
    while (activityLog.children.length > 30) activityLog.lastElementChild.remove();
  }

  function updateGestureUI(name, score = 0) {
    const meta = gestureMeta[name] || gestureMeta.NONE;
    gestureIcon.textContent = meta[2];
    gestureName.textContent = meta[0];
    gestureHint.textContent = meta[1];
    confidenceValue.textContent = score ? `${Math.round(score * 100)}%` : "--";
    trackingStatus.textContent = name === "NONE" ? "손 감지 대기" : "손 인식 중";
    trackingBar.style.width = `${Math.round(score * 100)}%`;
  }

  async function initLandmarker() {
    if (landmarker) return landmarker;
    if (!window.vision || !window.vision.FilesetResolver || !window.vision.HandLandmarker) {
      throw new Error("MediaPipe 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.");
    }
    const vision = await window.vision.FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );
    landmarker = await window.vision.HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.55,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5
    });
    return landmarker;
  }

  async function loadTeachableMachineModel() {
    if (tmModel || tmModelLoading) {
      showToast(tmModel ? "Teachable Machine 모델이 이미 연결되어 있습니다." : "모델을 불러오는 중입니다.");
      return;
    }
    tmModelLoading = true;
    const button = $("loadModelButton");
    button.disabled = true;
    button.textContent = "모델 불러오는 중...";
    try {
      if (!window.tmImage) throw new Error("Teachable Machine 라이브러리를 불러오지 못했습니다.");
      // Place model.json, metadata.json, and weights.bin in ./models/
      tmModel = await window.tmImage.load("models/model.json", "models/metadata.json");
      button.textContent = "✓ AI 모델 연결됨";
      showToast("Teachable Machine 모델 연결 완료");
      addLog("Teachable Machine 모델 연결 완료.", "AI MODEL");
    } catch (error) {
      console.error(error);
      button.disabled = false;
      button.textContent = "AI 모델 불러오기";
      showToast("models/model.json 및 metadata.json 파일을 확인해 주세요.");
      addLog("AI 모델을 불러오지 못했습니다. 모델 파일 위치를 확인하세요.", "MODEL ERROR");
    } finally {
      tmModelLoading = false;
    }
  }

  async function getGesturePrediction(lm) {
    // When a Teachable Machine model is present, use its class predictions.
    // Otherwise fall back to the built-in MediaPipe landmark rules.
    if (!tmModel) return { name: classifyHand(lm), score: 0.86 };
    try {
      const predictions = await tmModel.predict(video, false);
      predictions.sort((a, b) => b.probability - a.probability);
      const best = predictions[0];
      const normalized = String(best.className).trim().toUpperCase().replace(/[ -]+/g, "_");
      const supported = ["OPEN_PALM", "FIST", "POINT", "THUMBS_UP", "PEACE", "OK_SIGN", "ROCK", "LEFT", "RIGHT", "THREE", "NONE", "NO_HAND"];
      if (best.probability < sensitivity || !supported.includes(normalized)) {
        return { name: "NONE", score: best.probability };
      }
      return { name: (normalized === "NO_HAND" ? "NONE" : normalized), score: best.probability };
    } catch (error) {
      console.warn("Teachable Machine prediction failed:", error);
      return { name: classifyHand(lm), score: 0.5 };
    }
  }

  async function startCamera() {
    if (running || starting) return;
    starting = true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showToast("카메라는 HTTPS 또는 localhost 환경에서 사용할 수 있습니다.");
      addLog("보안 연결(HTTPS/localhost)이 필요합니다.", "ERROR");
      return;
    }
    startButton.disabled = true;
    startButton.textContent = "연결 중...";
    setStatus("카메라 연결 중");
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      video.srcObject = stream;
      await video.play();
      await initLandmarker();
      running = true;
      placeholder.hidden = true;
      stopButton.disabled = false;
      startButton.textContent = "✓ 카메라 실행 중";
      $("cameraResolution").textContent = `${video.videoWidth} × ${video.videoHeight}`;
      setStatus("AI 손 추적 활성", true);
      trackingStatus.textContent = "손 감지 대기";
      addLog("카메라 및 손 추적이 시작되었습니다.", "SYSTEM");
      showToast("카메라 연결 완료");
      loop();
    } catch (error) {
      console.error(error);
      if (stream) stream.getTracks().forEach((track) => track.stop());
      stream = null;
      video.srcObject = null;
      startButton.disabled = false;
      startButton.textContent = "◉ 카메라 시작";
      setStatus("연결 실패");
      let message = error.name === "NotAllowedError"
        ? "카메라 권한을 허용한 뒤 다시 시도해 주세요."
        : error.message || "카메라를 시작하지 못했습니다.";
      showToast(message);
      addLog(message, "ERROR");
    } finally {
      starting = false;
    }
  }

  function stopCamera() {
    running = false;
    starting = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    if (stream) stream.getTracks().forEach((track) => track.stop());
    stream = null;
    video.srcObject = null;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    placeholder.hidden = false;
    startButton.disabled = false;
    startButton.textContent = "◉ 카메라 시작";
    stopButton.disabled = true;
    setStatus("카메라 연결 전");
    trackingStatus.textContent = "비활성";
    trackingBar.style.width = "0%";
    updateGestureUI("NONE", 0);
    $("cameraResolution").textContent = "해상도 --";
    addLog("카메라 연결이 종료되었습니다.", "SYSTEM");
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
  }

  function classifyHand(lm) {
    // MediaPipe landmark IDs: wrist 0; thumb 4; index 8; middle 12; ring 16; pinky 20.
    // Extended-finger test uses tip-to-wrist distance relative to its PIP joint.
    const tips = [4, 8, 12, 16, 20];
    const pips = [3, 6, 10, 14, 18];
    const extended = tips.map((tip, i) => {
      if (i === 0) {
        // Thumb is mostly lateral; compare distance from index MCP and thumb tip.
        return distance(lm[4], lm[5]) > distance(lm[3], lm[5]) * 1.08;
      }
      return distance(lm[tip], lm[0]) > distance(lm[pips[i]], lm[0]) * 1.12;
    });
    const [thumb, index, middle, ring, pinky] = extended;
    const count = extended.filter(Boolean).length;

    if (count === 0) return "FIST";
    if (count === 5) return "OPEN_PALM";
    if (thumb && index && distance(lm[4], lm[8]) < 0.07) return "OK_SIGN";
    if (index && middle && !ring && !pinky) return "PEACE";
    if (index && !middle && !ring && pinky) return "ROCK";
    if (!index && !middle && !ring && !pinky && thumb) return "THUMBS_UP";
    if (index && !middle && !ring && !pinky) {
      const dx = lm[8].x - lm[5].x;
      if (Math.abs(dx) > Math.abs(lm[8].y - lm[5].y) * 1.2) return dx < 0 ? "LEFT" : "RIGHT";
      return "POINT";
    }
    if (count === 3) return "THREE";
    return "NONE";
  }

  function drawHand(lm) {
    const w = overlay.width, h = overlay.height;
    ctx.clearRect(0, 0, w, h);
    const connections = window.vision.HandLandmarker.HAND_CONNECTIONS;
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(167,139,250,.85)";
    ctx.fillStyle = "#e9ddff";
    for (const connection of connections) {
      const a = lm[connection.start], b = lm[connection.end];
      ctx.beginPath();
      ctx.moveTo(a.x * w, a.y * h);
      ctx.lineTo(b.x * w, b.y * h);
      ctx.stroke();
    }
    for (const point of lm) {
      ctx.beginPath();
      ctx.arc(point.x * w, point.y * h, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function loop() {
    if (!running) return;
    if (video.readyState >= 2) {
      if (overlay.width !== video.videoWidth || overlay.height !== video.videoHeight) {
        overlay.width = video.videoWidth;
        overlay.height = video.videoHeight;
      }
      try {
        const result = landmarker.detectForVideo(video, performance.now());
        if (result.landmarks && result.landmarks.length) {
          const lm = result.landmarks[0];
          drawHand(lm);
          const now = performance.now();
          // Limit custom-model inference to about 8 predictions/second to avoid overlapping calls.
          if (!predictionInFlight && now - lastPredictionAt >= 120) {
            predictionInFlight = true;
            lastPredictionAt = now;
            getGesturePrediction(lm).then(({ name, score }) => {
              if (!running) return;
              updateGestureUI(name, score);
              processGesture(name, score, lm[8]);
            }).catch((error) => console.warn("Gesture prediction failed:", error))
              .finally(() => { predictionInFlight = false; });
          }
        } else {
          ctx.clearRect(0, 0, overlay.width, overlay.height);
          updateGestureUI("NONE", 0);
          processGesture("NONE", 0, null);
        }
      } catch (error) {
        console.warn("Hand tracking frame failed:", error);
      }
    }
    rafId = requestAnimationFrame(loop);
  }

  function processGesture(raw, score, indexTip) {
    const now = performance.now();
    if (raw !== candidateGesture) {
      candidateGesture = raw;
      candidateSince = now;
      return;
    }
    const holdMs = raw === "FIST" ? 650 : 350;
    if (now - candidateSince < holdMs || score < sensitivity) return;
    if (raw !== lastGesture) {
      lastGesture = raw;
      if (raw !== "NONE") {
        if (raw !== lastLogGesture || now - lastActionAt > 1400) {
          addLog(`${gestureMeta[raw]?.[0] || raw} 감지`, "DETECTED");
          lastLogGesture = raw;
        }
        // Execute edge-triggered commands once per gesture transition.
        if (now - lastActionAt > 800) {
          handleGesture(raw);
          lastActionAt = now;
        }
      }
    }
    if (raw === "POINT" && indexTip) {
      // Pointer coordinates are mapped to viewport, for future interactive widgets.
      document.documentElement.style.setProperty("--hand-x", `${(1 - indexTip.x) * 100}%`);
      document.documentElement.style.setProperty("--hand-y", `${indexTip.y * 100}%`);
    }
  }

  function handleGesture(gesture) {
    switch (gesture) {
      case "OPEN_PALM":
        menuOpen = !menuOpen;
        document.body.classList.toggle("menu-open", menuOpen);
        showToast(menuOpen ? "메인 메뉴 열림" : "메인 메뉴 닫힘");
        addLog(menuOpen ? "메인 메뉴를 열었습니다." : "메인 메뉴를 닫았습니다.", "ACTION");
        if (menuOpen) highlightSelectedApp();
        break;
      case "FIST":
        executeSelectedApp();
        break;
      case "POINT":
        showToast("포인터 모드 활성");
        break;
      case "PEACE":
        if (settingsDialog.open) settingsDialog.close();
        else settingsDialog.showModal();
        addLog("빠른 설정을 열었습니다.", "ACTION");
        break;
      case "THUMBS_UP":
        if (appDialog.open) appDialog.close();
        else if (settingsDialog.open) settingsDialog.close();
        else { menuOpen = false; document.body.classList.remove("menu-open"); showToast("메인 화면"); }
        addLog("뒤로 가기 동작", "ACTION");
        break;
      case "OK_SIGN":
        executeSelectedApp();
        break;
      case "ROCK":
        openApp("games");
        break;
      case "LEFT":
        selectApp(-1);
        break;
      case "RIGHT":
        selectApp(1);
        break;
      case "THREE":
        openApp("media");
        break;
    }
  }

  function getSelectedAppId() {
    const cards = [...document.querySelectorAll(".app-card")];
    return cards[selectedIndex]?.dataset.app || "media";
  }
  function highlightSelectedApp() {
    const cards = [...document.querySelectorAll(".app-card")];
    cards.forEach((card, i) => card.classList.toggle("selected", i === selectedIndex));
  }
  function selectApp(direction) {
    const cards = [...document.querySelectorAll(".app-card")];
    selectedIndex = (selectedIndex + direction + cards.length) % cards.length;
    highlightSelectedApp();
    showToast(`선택: ${apps[getSelectedAppId()].title}`);
  }
  function executeSelectedApp() { openApp(getSelectedAppId()); }

  function openApp(id) {
    const app = apps[id] || apps.media;
    $("dialogKicker").textContent = `GESTURE APP / ${id.toUpperCase()}`;
    $("dialogTitle").textContent = app.title;
    $("dialogDescription").textContent = app.description;
    const content = $("dialogContent");
    content.replaceChildren();
    if (id === "media") {
      const demo = document.createElement("div");
      demo.className = "media-demo";
      const prev = document.createElement("button");
      prev.textContent = "◀";
      const label = document.createElement("span");
      label.textContent = "미디어 연결 대기 중";
      const next = document.createElement("button");
      next.textContent = "▶";
      prev.addEventListener("click", () => label.textContent = "이전 미디어 (데모)");
      next.addEventListener("click", () => label.textContent = "재생 요청 (데모)");
      demo.append(prev, label, next);
      content.append(demo);
    } else {
      const note = document.createElement("div");
      note.className = "media-demo";
      note.innerHTML = `<span>${app.icon}</span>`;
      content.append(note);
    }
    if (!appDialog.open) appDialog.showModal();
    addLog(`${app.title} 실행`, "APP");
  }

  document.querySelectorAll(".app-card").forEach((card, index) => {
    card.addEventListener("click", () => {
      selectedIndex = index;
      highlightSelectedApp();
      openApp(card.dataset.app);
    });
    card.addEventListener("mouseenter", () => {
      selectedIndex = index;
      highlightSelectedApp();
    });
  });
  startButton.addEventListener("click", startCamera);
  $("loadModelButton").addEventListener("click", loadTeachableMachineModel);
  stopButton.addEventListener("click", stopCamera);
  $("settingsButton").addEventListener("click", () => settingsDialog.showModal());
  $("minimizeCamera").addEventListener("click", () => {
    webcamCard.classList.toggle("minimized");
    $("minimizeCamera").textContent = webcamCard.classList.contains("minimized") ? "+" : "−";
  });
  $("clearLog").addEventListener("click", () => {
    activityLog.innerHTML = '<div class="empty-log">활동 기록이 지워졌습니다.</div>';
  });
  $("mirrorToggle").addEventListener("change", (event) => {
    mirror = event.target.checked;
    video.style.transform = mirror ? "scaleX(-1)" : "none";
    // Canvas mirrors with video; overlay coordinates are still drawn in video space.
    overlay.style.transform = mirror ? "scaleX(-1)" : "none";
  });
  $("cameraToggle").addEventListener("change", (event) => {
    cameraVisible = event.target.checked;
    webcamCard.style.display = cameraVisible ? "" : "none";
  });
  $("saveSettings").addEventListener("click", () => {
    sensitivity = Number($("sensitivity").value) / 100;
    settingsDialog.close();
    showToast(`설정 적용 · 민감도 ${Math.round(sensitivity * 100)}%`);
    addLog(`민감도 ${Math.round(sensitivity * 100)}% 적용`, "SETTINGS");
  });
  $("dialogOk").addEventListener("click", () => appDialog.close());
  appDialog.addEventListener("click", (event) => {
    if (event.target === appDialog) appDialog.close();
  });
  window.addEventListener("beforeunload", () => {
    if (stream) stream.getTracks().forEach((track) => track.stop());
  });

  addLog("GESTURE OS 준비 완료. 카메라를 시작해 주세요.", "SYSTEM");
})();