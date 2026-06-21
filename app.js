const MODE_TYPES = ["2x1", "1x2", "2x2"];
const STORAGE_KEY = "timesPracticeSettings";

const elements = {
  sessionStatus: document.querySelector("#sessionStatus"),
  newSetButton: document.querySelector("#newSetButton"),
  checkSetButton: document.querySelector("#checkSetButton"),
  modeButtons: [...document.querySelectorAll("[data-mode]")],
  countSelect: document.querySelector("#countSelect"),
  listTitle: document.querySelector("#listTitle"),
  scoreBadge: document.querySelector("#scoreBadge"),
  problemGrid: document.querySelector("#problemGrid"),
  previousButton: document.querySelector("#previousButton"),
  nextButton: document.querySelector("#nextButton"),
  problemCounter: document.querySelector("#problemCounter"),
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
  problems: [],
  currentIndex: 0,
  checked: false,
  tool: "pencil",
  isDrawing: false,
  activeStroke: null,
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
  } catch {
    state.mode = "mix";
    state.count = 10;
  }
}

function saveSettings() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ mode: state.mode, count: state.count })
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

function updateProblemResult(problem) {
  if (!state.checked) {
    problem.result = null;
    return;
  }

  problem.result =
    problem.userAnswer !== "" && Number(problem.userAnswer) === problem.answer;
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

function renderSettings() {
  elements.modeButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.mode === state.mode));
  });
  elements.countSelect.value = String(state.count);
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

    const status = problem.result === true
      ? "correct"
      : problem.result === false
        ? "incorrect"
        : problem.userAnswer
          ? "answered"
          : "empty";
    button.setAttribute("aria-label", `Problem ${index + 1}, ${status}`);
    button.addEventListener("click", () => selectProblem(index));
    elements.problemGrid.append(button);
  });
}

function renderScore() {
  if (state.checked) {
    elements.listTitle.textContent = "Score";
    elements.scoreBadge.textContent = `${correctCount()} / ${state.problems.length}`;
    elements.sessionStatus.textContent = `${correctCount()} of ${state.problems.length} correct`;
  } else {
    elements.listTitle.textContent = "Answered";
    elements.scoreBadge.textContent = `${answeredCount()} / ${state.problems.length}`;
    elements.sessionStatus.textContent = "Ready";
  }
}

function renderCurrentProblem() {
  const problem = currentProblem();
  elements.problemCounter.textContent = `Problem ${state.currentIndex + 1} of ${state.problems.length}`;
  elements.leftOperand.textContent = String(problem.left);
  elements.rightOperand.textContent = String(problem.right);
  elements.answerInput.value = problem.userAnswer;

  elements.previousButton.disabled = state.currentIndex === 0;
  elements.nextButton.disabled = state.currentIndex === state.problems.length - 1;

  elements.feedback.className = "feedback";
  if (!state.checked) {
    elements.feedback.textContent = "";
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
  elements.pencilButton.classList.toggle("active", pencilActive);
  elements.eraserButton.classList.toggle("active", !pencilActive);
  elements.pencilButton.setAttribute("aria-pressed", String(pencilActive));
  elements.eraserButton.setAttribute("aria-pressed", String(!pencilActive));
}

function render() {
  renderSettings();
  renderScore();
  renderProblemGrid();
  renderCurrentProblem();
  renderToolButtons();
  renderScratch();
}

function selectProblem(index) {
  if (index < 0 || index >= state.problems.length) {
    return;
  }

  state.currentIndex = index;
  state.activeStroke = null;
  render();
  elements.answerInput.focus({ preventScroll: true });
}

function newSet() {
  saveSettings();
  generateProblems();
  render();
  elements.answerInput.focus({ preventScroll: true });
}

function checkSet() {
  state.checked = true;
  updateAllResults();
  render();
}

function storeAnswer(value) {
  const problem = currentProblem();
  problem.userAnswer = sanitizeAnswer(value);
  elements.answerInput.value = problem.userAnswer;

  if (state.checked) {
    updateProblemResult(problem);
  }

  renderScore();
  renderProblemGrid();
  renderCurrentProblem();
}

function appendDigit(digit) {
  const value = sanitizeAnswer(`${elements.answerInput.value}${digit}`);
  storeAnswer(value);
  elements.answerInput.focus({ preventScroll: true });
}

function backspaceAnswer() {
  storeAnswer(elements.answerInput.value.slice(0, -1));
  elements.answerInput.focus({ preventScroll: true });
}

function clearAnswer() {
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
  renderScratch();
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
  currentProblem().strokes.pop();
  renderScratch();
}

function clearScratch() {
  currentProblem().strokes = [];
  renderScratch();
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

  elements.previousButton.addEventListener("click", () => selectProblem(state.currentIndex - 1));
  elements.nextButton.addEventListener("click", () => selectProblem(state.currentIndex + 1));

  elements.answerInput.addEventListener("input", (event) => {
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
      renderScratch();
    }
  });

  window.addEventListener("resize", resizeCanvas);
}

loadSettings();
attachEvents();
generateProblems();
renderSettings();
render();
requestAnimationFrame(resizeCanvas);
