const MODE_TYPES = ["2x1", "1x2", "2x2"];
const STORAGE_KEY = "timesPracticeSettings";
const DEFAULT_TIME_LIMIT_SECONDS = 60;
const TIME_LIMIT_OPTIONS = [30, 60, 90, 120];

const elements = {
  sessionStatus: document.querySelector("#sessionStatus"),
  newSetButton: document.querySelector("#newSetButton"),
  checkSetButton: document.querySelector("#checkSetButton"),
  modeButtons: [...document.querySelectorAll("[data-mode]")],
  countSelect: document.querySelector("#countSelect"),
  timeLimitSelect: document.querySelector("#timeLimitSelect"),
  summaryPanel: document.querySelector("#summaryPanel"),
  summaryMark: document.querySelector("#summaryMark"),
  summaryAverage: document.querySelector("#summaryAverage"),
  listTitle: document.querySelector("#listTitle"),
  scoreBadge: document.querySelector("#scoreBadge"),
  problemGrid: document.querySelector("#problemGrid"),
  previousButton: document.querySelector("#previousButton"),
  nextButton: document.querySelector("#nextButton"),
  problemCounter: document.querySelector("#problemCounter"),
  timerDisplay: document.querySelector("#timerDisplay"),
  timerText: document.querySelector("#timerText"),
  leftOperand: document.querySelector("#leftOperand"),
  rightOperand: document.querySelector("#rightOperand"),
  answerInput: document.querySelector("#answerInput"),
  feedback: document.querySelector("#feedback"),
  keypad: document.querySelector("#keypad"),
  canvas: document.querySelector("#scratchCanvas"),
  pencilButton: document.querySelector("#pencilButton"),
  eraserButton: document.querySelector("#eraserButton"),
  undoButton: document.querySelector("#undoButton"),
  clearScratchButton: document.querySelector("#clearScratchButton"),
};

const state = {
  mode: "mix",
  count: 10,
  timeLimitSeconds: DEFAULT_TIME_LIMIT_SECONDS,
  problems: [],
  currentIndex: 0,
  checked: false,
  tool: "pencil",
  isDrawing: false,
  activeStroke: null,
  timerStartedAt: null,
  timerId: null,
};

const canvasContext = elements.canvas.getContext("2d");

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (["mix", ...MODE_TYPES].includes(saved.mode)) {
      state.mode = saved.mode;
    }
    if ([6, 10, 12, 16].includes(Number(saved.count))) {
      state.count = Number(saved.count);
    }
    if (TIME_LIMIT_OPTIONS.includes(Number(saved.timeLimitSeconds))) {
      state.timeLimitSeconds = Number(saved.timeLimitSeconds);
    }
  } catch {
    state.mode = "mix";
    state.count = 10;
    state.timeLimitSeconds = DEFAULT_TIME_LIMIT_SECONDS;
  }
}

function saveSettings() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        mode: state.mode,
        count: state.count,
        timeLimitSeconds: state.timeLimitSeconds,
      })
    );
  } catch {
    return;
  }
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffled(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function createProblem(type) {
  let left;
  let right;

  if (type === "2x1") {
    left = randomInt(10, 99);
    right = randomInt(2, 9);
  } else if (type === "1x2") {
    left = randomInt(2, 9);
    right = randomInt(10, 99);
  } else {
    left = randomInt(10, 99);
    right = randomInt(10, 99);
  }

  return {
    type,
    left,
    right,
    answer: left * right,
    userAnswer: "",
    result: null,
    strokes: [],
    timeSpentMs: 0,
    timedOut: false,
  };
}

function buildTypeList() {
  if (state.mode !== "mix") {
    return Array.from({ length: state.count }, () => state.mode);
  }

  const types = [];
  for (let i = 0; i < state.count; i += 1) {
    types.push(MODE_TYPES[i % MODE_TYPES.length]);
  }
  return shuffled(types);
}

function generateProblems() {
  const signatures = new Set();
  const types = buildTypeList();
  const problems = [];

  types.forEach((type) => {
    let problem = createProblem(type);
    let signature = `${problem.left}x${problem.right}`;
    let attempts = 0;

    while (signatures.has(signature) && attempts < 80) {
      problem = createProblem(type);
      signature = `${problem.left}x${problem.right}`;
      attempts += 1;
    }

    signatures.add(signature);
    problems.push(problem);
  });

  state.problems = problems;
  state.currentIndex = 0;
  state.checked = false;
}

function currentProblem() {
  return state.problems[state.currentIndex];
}

function sanitizeAnswer(value) {
  return value.replace(/\D/g, "").slice(0, 4);
}

function timeLimitMs() {
  return state.timeLimitSeconds * 1000;
}

function expectedAnswerLength(problem) {
  return String(problem.answer).length;
}

function hasCompleteAnswer(problem) {
  return problem.userAnswer.length >= expectedAnswerLength(problem);
}

function hasSolvingWork(problem) {
  return problem.strokes.length > 0;
}

function hasSolvedProblem(problem) {
  return hasSolvingWork(problem) && hasCompleteAnswer(problem);
}

function isProblemComplete(problem) {
  return problem.timedOut || hasSolvedProblem(problem);
}

function allProblemsComplete() {
  return state.problems.length > 0 && state.problems.every(isProblemComplete);
}

function canAcceptAnswer(problem) {
  return !state.checked && !problem.timedOut;
}

function canTypeInAnswerField(problem) {
  return canAcceptAnswer(problem) && hasSolvingWork(problem);
}

function canProceedFromProblem(problem) {
  return state.checked || problem.timedOut || hasSolvedProblem(problem);
}

function canSelectProblem(index) {
  if (state.checked || index <= state.currentIndex) {
    return true;
  }

  for (let problemIndex = state.currentIndex; problemIndex < index; problemIndex += 1) {
    if (!canProceedFromProblem(state.problems[problemIndex])) {
      return false;
    }
  }

  return true;
}

function proceedLockMessage(problem) {
  if (!hasSolvingWork(problem)) {
    return "Add scratch work before moving ahead.";
  }

  if (!hasCompleteAnswer(problem)) {
    return "Enter an answer before moving ahead.";
  }

  return "Complete earlier problems before moving ahead.";
}

function shouldRunTimer(problem) {
  return (
    !state.checked &&
    !problem.timedOut &&
    !hasSolvedProblem(problem) &&
    problem.timeSpentMs < timeLimitMs()
  );
}

function activeElapsedMs(problem) {
  if (problem !== currentProblem() || state.timerStartedAt === null) {
    return 0;
  }

  return Math.max(0, Date.now() - state.timerStartedAt);
}

function elapsedMs(problem) {
  return Math.min(timeLimitMs(), problem.timeSpentMs + activeElapsedMs(problem));
}

function remainingMs(problem) {
  return Math.max(0, timeLimitMs() - elapsedMs(problem));
}

function formatClock(ms) {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatDuration(ms) {
  const totalSeconds = Math.round(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds} sec`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")} min`;
}

function updateProblemResult(problem) {
  if (!state.checked) {
    problem.result = null;
    return;
  }

  problem.result =
    !problem.timedOut &&
    hasSolvingWork(problem) &&
    problem.userAnswer !== "" &&
    Number(problem.userAnswer) === problem.answer;
}

function updateAllResults() {
  state.problems.forEach(updateProblemResult);
}

function correctCount() {
  return state.problems.filter((problem) => problem.result === true).length;
}

function answeredCount() {
  return state.problems.filter((problem) => problem.userAnswer !== "").length;
}

function attemptedProblems() {
  return state.problems.filter(
    (problem) => problem.timeSpentMs > 0 || problem.userAnswer !== "" || problem.timedOut
  );
}

function averageTimeMs() {
  const problems = attemptedProblems();
  if (problems.length === 0) {
    return 0;
  }

  const total = problems.reduce((sum, problem) => sum + problem.timeSpentMs, 0);
  return total / problems.length;
}

function renderSettings() {
  elements.modeButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.mode === state.mode));
  });
  elements.countSelect.value = String(state.count);
  elements.timeLimitSelect.value = String(state.timeLimitSeconds);
}

function renderProblemGrid() {
  elements.problemGrid.replaceChildren();

  state.problems.forEach((problem, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "problem-jump";
    button.textContent = String(index + 1);

    if (index === state.currentIndex) {
      button.classList.add("active");
    }
    if (problem.result === true) {
      button.classList.add("correct");
    } else if (problem.result === false) {
      button.classList.add("incorrect");
    }
    if (problem.timedOut) {
      button.classList.add("timed-out");
    }

    if (!canSelectProblem(index)) {
      button.disabled = true;
      button.title =
        index === state.currentIndex + 1
          ? proceedLockMessage(currentProblem())
          : "Complete earlier problems before moving ahead.";
    }

    const status = problem.result === true
      ? "correct"
      : problem.result === false
        ? "incorrect"
        : problem.timedOut
          ? "timed out"
          : problem.userAnswer
            ? "answered"
            : "empty";
    const lockStatus = button.disabled ? ", locked" : "";
    button.setAttribute("aria-label", `Problem ${index + 1}, ${status}${lockStatus}`);
    button.addEventListener("click", () => selectProblem(index));
    elements.problemGrid.append(button);
  });
}

function renderScore() {
  if (state.checked) {
    elements.listTitle.textContent = "Score";
    elements.scoreBadge.textContent = `${correctCount()} / ${state.problems.length}`;
    elements.sessionStatus.textContent = `${correctCount()} of ${state.problems.length} correct · ${formatDuration(averageTimeMs())} average`;
  } else {
    elements.listTitle.textContent = "Answered";
    elements.scoreBadge.textContent = `${answeredCount()} / ${state.problems.length}`;
    elements.sessionStatus.textContent = "Timed practice";
  }
}

function renderSummary() {
  elements.summaryPanel.hidden = !state.checked;

  if (!state.checked) {
    return;
  }

  elements.summaryMark.textContent = `${correctCount()} / ${state.problems.length}`;
  elements.summaryAverage.textContent = `${formatDuration(averageTimeMs())} / problem`;
}

function renderTimer() {
  const problem = currentProblem();
  const remaining = remainingMs(problem);
  const isExpired = problem.timedOut || remaining <= 0;
  const isStopped = state.checked || hasSolvedProblem(problem);

  elements.timerText.textContent = formatClock(remaining);
  elements.timerDisplay.classList.toggle("warning", !isExpired && !isStopped && remaining <= 10000);
  elements.timerDisplay.classList.toggle("expired", isExpired);
  elements.timerDisplay.classList.toggle("stopped", !isExpired && isStopped);
  elements.timerDisplay.setAttribute(
    "aria-label",
    `${formatClock(remaining)} remaining for problem ${state.currentIndex + 1}`
  );
}

function renderAnswerEntryState() {
  const problem = currentProblem();
  const acceptsAnswer = canAcceptAnswer(problem);
  const textEntryAllowed = canTypeInAnswerField(problem);

  elements.answerInput.readOnly = !textEntryAllowed;
  elements.answerInput.classList.toggle("entry-locked", !acceptsAnswer || !textEntryAllowed);
  elements.answerInput.title = !acceptsAnswer
    ? "Answer entry is closed for this problem."
    : textEntryAllowed
      ? ""
      : "Add scratch work before typing an answer.";

  elements.keypad.querySelectorAll("button").forEach((button) => {
    button.disabled = !acceptsAnswer;
  });
}

function renderCurrentProblem() {
  const problem = currentProblem();
  elements.problemCounter.textContent = `Problem ${state.currentIndex + 1} of ${state.problems.length}`;
  elements.leftOperand.textContent = String(problem.left);
  elements.rightOperand.textContent = String(problem.right);
  elements.answerInput.value = problem.userAnswer;
  renderAnswerEntryState();

  const nextLocked =
    state.currentIndex < state.problems.length - 1 && !canSelectProblem(state.currentIndex + 1);
  elements.previousButton.disabled = state.currentIndex === 0;
  elements.nextButton.disabled = state.currentIndex === state.problems.length - 1 || nextLocked;
  elements.nextButton.title = nextLocked ? proceedLockMessage(problem) : "Next problem";

  elements.feedback.className = "feedback";
  if (!state.checked) {
    elements.feedback.textContent = problem.timedOut ? "Time up" : "";
    if (problem.timedOut) {
      elements.feedback.classList.add("incorrect");
    }
    return;
  }

  if (problem.result === true) {
    elements.feedback.textContent = "Correct";
    elements.feedback.classList.add("correct");
  } else {
    elements.feedback.textContent = `Correct answer: ${problem.answer}`;
    elements.feedback.classList.add("incorrect");
  }
}

function renderToolButtons() {
  const pencilActive = state.tool === "pencil";
  const toolsDisabled = !canAcceptAnswer(currentProblem());
  elements.pencilButton.classList.toggle("active", pencilActive);
  elements.eraserButton.classList.toggle("active", !pencilActive);
  elements.pencilButton.setAttribute("aria-pressed", String(pencilActive));
  elements.eraserButton.setAttribute("aria-pressed", String(!pencilActive));
  elements.pencilButton.disabled = toolsDisabled;
  elements.eraserButton.disabled = toolsDisabled;
  elements.undoButton.disabled = toolsDisabled;
  elements.clearScratchButton.disabled = toolsDisabled;
}

function renderActionButtons() {
  const canCheck = !state.checked && allProblemsComplete();
  elements.checkSetButton.disabled = !canCheck;
  elements.checkSetButton.title = canCheck
    ? "Check set"
    : "Complete every problem or let time expire before checking.";
}

function render() {
  renderSettings();
  renderScore();
  renderSummary();
  renderProblemGrid();
  renderCurrentProblem();
  renderTimer();
  renderToolButtons();
  renderActionButtons();
  renderScratch();
}

function finishScratchChange() {
  render();
  syncCurrentTimer();

  if (!state.checked && allProblemsComplete()) {
    checkSet();
  }
}

function clearTimerInterval() {
  if (state.timerId === null) {
    return;
  }

  window.clearInterval(state.timerId);
  state.timerId = null;
}

function commitCurrentTimer() {
  if (state.timerStartedAt === null || state.problems.length === 0) {
    return;
  }

  const problem = currentProblem();
  const delta = Math.max(0, Date.now() - state.timerStartedAt);
  problem.timeSpentMs = Math.min(timeLimitMs(), problem.timeSpentMs + delta);
  state.timerStartedAt = null;
}

function syncCurrentTimer() {
  if (state.problems.length === 0) {
    clearTimerInterval();
    state.timerStartedAt = null;
    return;
  }

  const problem = currentProblem();
  if (shouldRunTimer(problem)) {
    if (state.timerStartedAt === null) {
      state.timerStartedAt = Date.now();
    }
    if (state.timerId === null) {
      state.timerId = window.setInterval(onTimerTick, 250);
    }
  } else {
    commitCurrentTimer();
    clearTimerInterval();
  }

  renderTimer();
}

function findNextIncompleteProblemIndex() {
  for (let offset = 1; offset <= state.problems.length; offset += 1) {
    const index = (state.currentIndex + offset) % state.problems.length;
    if (!isProblemComplete(state.problems[index])) {
      return index;
    }
  }

  return -1;
}

function expireCurrentProblem() {
  commitCurrentTimer();
  const problem = currentProblem();
  problem.timeSpentMs = timeLimitMs();
  problem.timedOut = true;
  clearTimerInterval();

  if (allProblemsComplete()) {
    checkSet();
    return;
  }

  const nextIndex = findNextIncompleteProblemIndex();
  if (nextIndex !== -1 && nextIndex !== state.currentIndex) {
    state.currentIndex = nextIndex;
    state.activeStroke = null;
  }

  render();
  syncCurrentTimer();
}

function onTimerTick() {
  const problem = currentProblem();

  if (!shouldRunTimer(problem)) {
    syncCurrentTimer();
    return;
  }

  if (remainingMs(problem) <= 0) {
    expireCurrentProblem();
    return;
  }

  renderTimer();
}

function selectProblem(index) {
  if (index < 0 || index >= state.problems.length) {
    return;
  }

  if (!canSelectProblem(index)) {
    renderCurrentProblem();
    return;
  }

  commitCurrentTimer();
  state.currentIndex = index;
  state.activeStroke = null;
  render();
  syncCurrentTimer();
  elements.answerInput.focus({ preventScroll: true });
}

function newSet() {
  clearTimerInterval();
  state.timerStartedAt = null;
  saveSettings();
  generateProblems();
  render();
  syncCurrentTimer();
  elements.answerInput.focus({ preventScroll: true });
}

function checkSet() {
  if (!allProblemsComplete()) {
    render();
    return;
  }

  commitCurrentTimer();
  clearTimerInterval();
  state.checked = true;
  updateAllResults();
  render();
}

function storeAnswer(value) {
  const problem = currentProblem();
  if (!canAcceptAnswer(problem)) {
    elements.answerInput.value = problem.userAnswer;
    return;
  }

  const wasComplete = hasCompleteAnswer(problem);
  problem.userAnswer = sanitizeAnswer(value);
  const isComplete = hasCompleteAnswer(problem);
  elements.answerInput.value = problem.userAnswer;

  if (!wasComplete && isComplete) {
    commitCurrentTimer();
  }

  if (state.checked) {
    updateProblemResult(problem);
  }

  renderScore();
  renderSummary();
  renderProblemGrid();
  renderCurrentProblem();
  syncCurrentTimer();

  if (!state.checked && allProblemsComplete()) {
    checkSet();
  }
}

function appendDigit(digit) {
  if (!canAcceptAnswer(currentProblem())) {
    return;
  }

  const value = sanitizeAnswer(`${elements.answerInput.value}${digit}`);
  storeAnswer(value);
  elements.answerInput.focus({ preventScroll: true });
}

function backspaceAnswer() {
  if (!canAcceptAnswer(currentProblem())) {
    return;
  }

  storeAnswer(elements.answerInput.value.slice(0, -1));
  elements.answerInput.focus({ preventScroll: true });
}

function clearAnswer() {
  if (!canAcceptAnswer(currentProblem())) {
    return;
  }

  storeAnswer("");
  elements.answerInput.focus({ preventScroll: true });
}

function getCanvasSize() {
  const rect = elements.canvas.getBoundingClientRect();
  return {
    width: Math.max(1, rect.width),
    height: Math.max(1, rect.height),
  };
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const { width, height } = getCanvasSize();
  const nextWidth = Math.round(width * dpr);
  const nextHeight = Math.round(height * dpr);

  if (elements.canvas.width !== nextWidth || elements.canvas.height !== nextHeight) {
    elements.canvas.width = nextWidth;
    elements.canvas.height = nextHeight;
  }

  canvasContext.setTransform(dpr, 0, 0, dpr, 0, 0);
  renderScratch();
}

function pointFromEvent(event) {
  const rect = elements.canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function drawStroke(stroke) {
  if (!stroke || stroke.points.length === 0) {
    return;
  }

  canvasContext.save();
  canvasContext.globalCompositeOperation =
    stroke.tool === "eraser" ? "destination-out" : "source-over";
  canvasContext.strokeStyle = stroke.color;
  canvasContext.fillStyle = stroke.color;
  canvasContext.lineWidth = stroke.width;
  canvasContext.lineCap = "round";
  canvasContext.lineJoin = "round";

  if (stroke.points.length === 1) {
    const point = stroke.points[0];
    canvasContext.beginPath();
    canvasContext.arc(point.x, point.y, stroke.width / 2, 0, Math.PI * 2);
    canvasContext.fill();
    canvasContext.restore();
    return;
  }

  canvasContext.beginPath();
  canvasContext.moveTo(stroke.points[0].x, stroke.points[0].y);

  for (let i = 1; i < stroke.points.length - 1; i += 1) {
    const current = stroke.points[i];
    const next = stroke.points[i + 1];
    const midpoint = {
      x: (current.x + next.x) / 2,
      y: (current.y + next.y) / 2,
    };
    canvasContext.quadraticCurveTo(current.x, current.y, midpoint.x, midpoint.y);
  }

  const last = stroke.points[stroke.points.length - 1];
  canvasContext.lineTo(last.x, last.y);
  canvasContext.stroke();
  canvasContext.restore();
}

function renderScratch() {
  const { width, height } = getCanvasSize();
  canvasContext.clearRect(0, 0, width, height);

  currentProblem().strokes.forEach(drawStroke);
  if (state.activeStroke) {
    drawStroke(state.activeStroke);
  }
}

function startDrawing(event) {
  if (!canAcceptAnswer(currentProblem())) {
    return;
  }

  if (event.button !== undefined && event.button !== 0) {
    return;
  }

  event.preventDefault();
  elements.canvas.setPointerCapture(event.pointerId);
  state.isDrawing = true;
  state.activeStroke = {
    tool: state.tool,
    color: "#1f2937",
    width: state.tool === "eraser" ? 28 : 4,
    points: [pointFromEvent(event)],
  };
  renderScratch();
}

function continueDrawing(event) {
  if (!state.isDrawing || !state.activeStroke) {
    return;
  }

  event.preventDefault();
  state.activeStroke.points.push(pointFromEvent(event));
  renderScratch();
}

function stopDrawing(event) {
  if (!state.isDrawing || !state.activeStroke) {
    return;
  }

  if (elements.canvas.hasPointerCapture(event.pointerId)) {
    elements.canvas.releasePointerCapture(event.pointerId);
  }

  currentProblem().strokes.push(state.activeStroke);
  state.isDrawing = false;
  state.activeStroke = null;
  finishScratchChange();
}

function cancelDrawing(event) {
  if (elements.canvas.hasPointerCapture(event.pointerId)) {
    elements.canvas.releasePointerCapture(event.pointerId);
  }
  state.isDrawing = false;
  state.activeStroke = null;
  renderScratch();
}

function undoStroke() {
  if (!canAcceptAnswer(currentProblem())) {
    return;
  }

  currentProblem().strokes.pop();
  finishScratchChange();
}

function clearScratch() {
  if (!canAcceptAnswer(currentProblem())) {
    return;
  }

  currentProblem().strokes = [];
  finishScratchChange();
}

function attachEvents() {
  elements.newSetButton.addEventListener("click", newSet);
  elements.checkSetButton.addEventListener("click", checkSet);

  elements.modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      newSet();
    });
  });

  elements.countSelect.addEventListener("change", () => {
    state.count = Number(elements.countSelect.value);
    newSet();
  });

  elements.timeLimitSelect.addEventListener("change", () => {
    state.timeLimitSeconds = Number(elements.timeLimitSelect.value);
    newSet();
  });

  elements.previousButton.addEventListener("click", () => selectProblem(state.currentIndex - 1));
  elements.nextButton.addEventListener("click", () => selectProblem(state.currentIndex + 1));

  elements.answerInput.addEventListener("input", (event) => {
    if (!canTypeInAnswerField(currentProblem())) {
      event.target.value = currentProblem().userAnswer;
      return;
    }

    storeAnswer(event.target.value);
  });

  elements.answerInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    if (state.currentIndex < state.problems.length - 1) {
      selectProblem(state.currentIndex + 1);
    } else {
      checkSet();
    }
  });

  elements.keypad.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) {
      return;
    }

    if (button.dataset.key) {
      appendDigit(button.dataset.key);
    } else if (button.dataset.action === "clear") {
      clearAnswer();
    } else if (button.dataset.action === "backspace") {
      backspaceAnswer();
    }
  });

  elements.pencilButton.addEventListener("click", () => {
    state.tool = "pencil";
    renderToolButtons();
  });

  elements.eraserButton.addEventListener("click", () => {
    state.tool = "eraser";
    renderToolButtons();
  });

  elements.undoButton.addEventListener("click", undoStroke);
  elements.clearScratchButton.addEventListener("click", clearScratch);

  elements.canvas.addEventListener("pointerdown", startDrawing);
  elements.canvas.addEventListener("pointermove", continueDrawing);
  elements.canvas.addEventListener("pointerup", stopDrawing);
  elements.canvas.addEventListener("pointercancel", cancelDrawing);
  elements.canvas.addEventListener("lostpointercapture", () => {
    if (state.isDrawing && state.activeStroke) {
      currentProblem().strokes.push(state.activeStroke);
      state.isDrawing = false;
      state.activeStroke = null;
      finishScratchChange();
    }
  });

  window.addEventListener("resize", resizeCanvas);
}

loadSettings();
attachEvents();
generateProblems();
renderSettings();
render();
syncCurrentTimer();
requestAnimationFrame(resizeCanvas);
