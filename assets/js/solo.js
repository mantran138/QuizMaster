document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const fileInput = document.getElementById('file-input');
    const triggerFileButton = document.getElementById('trigger-file-input');
    const uploadSection = document.getElementById('upload-section');
    const quizSection = document.getElementById('quiz-section');
    const resultsSection = document.getElementById('results-section');
    const answersContainer = document.getElementById('answers-container');
    const feedback = document.getElementById('feedback');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const restartBtn = document.getElementById('restart-quiz');
    const reviewWrongBtn = document.getElementById('review-wrong');
    const newQuizBtn = document.getElementById('new-quiz');
    const mainContainer = document.getElementById('main-container');
    
    // New Game Elements
    const timerContainer = document.getElementById('timer-container');
    const timerFill = document.getElementById('timer-fill');
    const livesContainer = document.getElementById('lives-container');
    const streakContainer = document.getElementById('streak-container');
    const streakCountEl = document.getElementById('streak-count');
    const pointsDisplay = document.getElementById('points-display');
    const gameOverOverlay = document.getElementById('game-over-overlay');
    const retryBtn = document.getElementById('retry-btn');
    const backBtn = document.getElementById('back-btn');
    const modeToggleBtns = document.querySelectorAll('.mode-toggle-btn');

    // Quiz State
    let originalQuizData = null;
    let quizData = null;
    let currentQuestion = 0;
    let totalQuestions = 0;
    let answered = false;
    let score = 0;
    let wrongAnswersMode = false;
    let wrongQuestionIndices = [];

    // Game Mode State
    let gameMode = 'classic'; // 'classic' or 'blitz'
    let lives = 3;
    const MAX_LIVES = 3; // Maximum health
    let streak = 0;
    let bestStreak = 0;
    let points = 0;
    let timerInterval = null;
    let timeLeft = 100;
    const BLITZ_TIME = 15; // seconds per question
    const BASE_POINTS = 100;
    const STREAK_BONUS = 50;

    const stats = {
        totalCorrect: 0,
        totalWrong: 0,
        totalAttempts: 0,
    };

    // Event Listeners - Mode Toggle
    const modeDescText = document.getElementById('mode-desc-text');
    const modeDescriptions = {
        classic: `<span style="color: var(--neon-cyan); font-weight: 600;">🎯 Classic Mode:</span> Take your time to answer each question. No timer, no pressure. Perfect for learning and practice. You have 3 lives — wrong answers cost a heart!`,
        blitz: `<span style="color: var(--neon-magenta); font-weight: 600;">⚡ Blitz Mode:</span> Race against the clock! You have 15 seconds per question. Faster answers = more points. Build streaks for bonus multipliers. Can you handle the heat?`
    };

    modeToggleBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            modeToggleBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            gameMode = btn.dataset.mode;
            // Update description
            if (modeDescText) {
                modeDescText.innerHTML = modeDescriptions[gameMode];
            }
        });
    });

    // Event Listeners - File Upload
    triggerFileButton.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
    });

    uploadSection.addEventListener('dragover', (event) => {
        event.preventDefault();
        uploadSection.classList.add('dragover');
    });

    uploadSection.addEventListener('dragleave', () => {
        uploadSection.classList.remove('dragover');
    });

    uploadSection.addEventListener('drop', (event) => {
        event.preventDefault();
        uploadSection.classList.remove('dragover');
        const [file] = event.dataTransfer.files;
        if (file) processFile(file);
    });

    fileInput.addEventListener('change', (event) => {
        const [file] = event.target.files;
        if (file) processFile(file);
    });

    // Navigation
    prevBtn.addEventListener('click', () => {
        if (currentQuestion > 0) {
            currentQuestion -= 1;
            showQuestion();
        }
    });

    nextBtn.addEventListener('click', () => {
        if (currentQuestion < totalQuestions - 1) {
            currentQuestion += 1;
            showQuestion();
        } else {
            showResults();
        }
    });

    // Action Buttons
    restartBtn.addEventListener('click', () => {
        wrongAnswersMode = false;
        startQuiz();
    });

    reviewWrongBtn.addEventListener('click', () => {
        wrongAnswersMode = true;
        startQuiz();
    });

    newQuizBtn.addEventListener('click', resetToUpload);

    // Game Over Buttons
    retryBtn?.addEventListener('click', () => {
        gameOverOverlay.classList.add('hidden');
        wrongAnswersMode = false;
        startQuiz();
    });

    backBtn?.addEventListener('click', () => {
        gameOverOverlay.classList.add('hidden');
        resetToUpload();
    });

    // ==================== CHATBOT INTEGRATION ====================
    // Check if coming from chatbot with quiz data
    checkChatbotQuiz();

    function checkChatbotQuiz() {
        const params = new URLSearchParams(window.location.search);
        if (params.get('from') === 'chatbot') {
            const quizDataStr = sessionStorage.getItem('chatbot_quiz_data');
            const quizMode = sessionStorage.getItem('chatbot_quiz_mode');
            
            if (quizDataStr) {
                try {
                    const quizJson = JSON.parse(quizDataStr);
                    if (quizJson.questions && Array.isArray(quizJson.questions) && quizJson.questions.length > 0) {
                        originalQuizData = quizJson;
                        
                        // Set the game mode
                        if (quizMode === 'blitz') {
                            gameMode = 'blitz';
                            modeToggleBtns.forEach(btn => {
                                btn.classList.toggle('active', btn.dataset.mode === 'blitz');
                            });
                            if (modeDescText) {
                                modeDescText.innerHTML = modeDescriptions['blitz'];
                            }
                        } else {
                            gameMode = 'classic';
                        }
                        
                        // Clean up sessionStorage
                        sessionStorage.removeItem('chatbot_quiz_data');
                        sessionStorage.removeItem('chatbot_quiz_mode');
                        
                        // Clear URL params
                        window.history.replaceState({}, document.title, window.location.pathname);
                        
                        // Start the quiz immediately
                        startQuiz();
                    }
                } catch (e) {
                    console.error('Failed to load chatbot quiz:', e);
                }
            }
        }
    }

    // ==================== CORE FUNCTIONS ====================

    function resetToUpload() {
        stopTimer();
        uploadSection.classList.remove('hidden');
        quizSection.classList.add('hidden');
        resultsSection.classList.add('hidden');
        gameOverOverlay?.classList.add('hidden');
        feedback.classList.add('hidden');
        fileInput.value = '';
        originalQuizData = null;
        quizData = null;
        wrongAnswersMode = false;
        wrongQuestionIndices = [];
        answered = false;
        currentQuestion = 0;
        totalQuestions = 0;
        score = 0;
        resetGameState();
    }

    function resetGameState() {
        lives = 3;
        streak = 0;
        bestStreak = 0;
        points = 0;
        timeLeft = 100;
        updateLivesDisplay();
        updateStreakDisplay();
        updatePointsDisplay();
    }

    function processFile(file) {
        if (file.type !== 'application/json') {
            alertModal('Please upload a JSON file.');
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const parsed = JSON.parse(event.target.result);
                if (!parsed.questions || !Array.isArray(parsed.questions)) {
                    throw new Error('Invalid JSON format.');
                }
                originalQuizData = parsed;
                wrongAnswersMode = false;
                wrongQuestionIndices = [];
                stats.totalAttempts = 0;
                stats.totalCorrect = 0;
                stats.totalWrong = 0;
                startQuiz();
            } catch (error) {
                alertModal('Invalid JSON file. Please check the structure.');
            }
        };
        reader.readAsText(file);
    }

    function startQuiz() {
        if (!originalQuizData) {
            alertModal('Please load a quiz first.');
            return;
        }

        const baseQuestions = wrongAnswersMode
            ? wrongQuestionIndices.map((idx) => originalQuizData.questions[idx])
            : originalQuizData.questions;

        if (!baseQuestions.length) {
            alertModal('No questions available for this mode.');
            return;
        }

        // Reset game state
        resetGameState();

        // UI transitions
        uploadSection.classList.add('hidden');
        resultsSection.classList.add('hidden');
        quizSection.classList.remove('hidden');
        quizSection.classList.add('page-enter');

        currentQuestion = 0;
        score = 0;
        answered = false;
        quizData = { questions: shuffleArray(JSON.parse(JSON.stringify(baseQuestions))) };
        totalQuestions = quizData.questions.length;

        // Show/hide timer based on mode
        if (gameMode === 'blitz') {
            timerContainer.classList.remove('hidden');
        } else {
            timerContainer.classList.add('hidden');
        }

        shuffleQuizOptions();
        showQuestion();
    }

    function shuffleQuizOptions() {
        quizData.questions.forEach((question) => {
            const correctAnswer = question.options[question.correct];
            const indices = [...Array(question.options.length).keys()];
            for (let i = indices.length - 1; i > 0; i -= 1) {
                const j = Math.floor(Math.random() * (i + 1));
                [indices[i], indices[j]] = [indices[j], indices[i]];
            }
            const shuffledOptions = indices.map((index) => question.options[index]);
            question.options = shuffledOptions;
            question.correct = shuffledOptions.indexOf(correctAnswer);
        });
    }

    function showQuestion() {
        if (!quizData) return;

        answered = false;
        const question = quizData.questions[currentQuestion];
        
        document.getElementById('question-number').textContent = `Question ${currentQuestion + 1} of ${totalQuestions}`;
        document.getElementById('question-text').textContent = question.question;
        document.getElementById('progress-fill').style.width = `${(currentQuestion / totalQuestions) * 100}%`;

        answersContainer.innerHTML = '';
        question.options.forEach((option, index) => {
            const button = document.createElement('button');
            button.className = 'answer-btn';
            button.textContent = option;
            button.addEventListener('click', () => selectAnswer(index));
            answersContainer.appendChild(button);
        });

        feedback.classList.add('hidden');
        updateNavButtons();

        // Start timer in blitz mode
        if (gameMode === 'blitz') {
            startTimer();
        }
    }

    function updateNavButtons() {
        prevBtn.classList.toggle('hidden', currentQuestion <= 0 || gameMode === 'blitz');
        prevBtn.disabled = answered;

        nextBtn.classList.toggle('hidden', totalQuestions <= 0);
        nextBtn.textContent = currentQuestion < totalQuestions - 1 ? 'Next Question' : 'Finish Quiz';
        nextBtn.disabled = !answered;
    }

    function selectAnswer(selectedIndex) {
        if (answered) return;

        answered = true;
        stopTimer();

        const question = quizData.questions[currentQuestion];
        const buttons = answersContainer.querySelectorAll('.answer-btn');
        buttons.forEach((button) => button.classList.add('disabled'));

        const isCorrect = selectedIndex === question.correct;

        if (isCorrect) {
            buttons[selectedIndex].classList.add('correct');
            score += 1;
            stats.totalCorrect += 1;
            streak += 1;
            
            // Heal half a heart if not at full health
            if (lives < MAX_LIVES) {
                lives = Math.min(lives + 0.5, MAX_LIVES);
                updateLivesDisplay(false, true); // animate heal
            }
            
            // Calculate points based on time left (blitz mode)
            let earnedPoints = BASE_POINTS;
            if (gameMode === 'blitz') {
                earnedPoints = Math.round(BASE_POINTS * (timeLeft / 100));
            }
            
            // Streak bonus
            if (streak >= 3) {
                earnedPoints += STREAK_BONUS * (streak - 2);
                streakContainer.classList.add('fire');
            }
            
            points += earnedPoints;
            
            if (streak > bestStreak) bestStreak = streak;
            
            // Effects
            createConfetti();
            showPointsPopup(earnedPoints);
            
        } else {
            buttons[selectedIndex].classList.add('incorrect');
            buttons[question.correct].classList.add('correct');
            stats.totalWrong += 1;
            streak = 0;
            streakContainer.classList.remove('fire');
            
            // Lose a life
            lives -= 1;
            updateLivesDisplay(true);
            
            // Screen shake
            mainContainer.classList.add('screen-shake');
            setTimeout(() => mainContainer.classList.remove('screen-shake'), 500);

            if (!wrongAnswersMode) {
                const originalIndex = originalQuizData.questions.findIndex((q) => q.question === question.question);
                if (originalIndex !== -1 && !wrongQuestionIndices.includes(originalIndex)) {
                    wrongQuestionIndices.push(originalIndex);
                }
            }

            // Check game over
            if (lives <= 0) {
                setTimeout(() => showGameOver(), 1000);
                return;
            }
        }

        stats.totalAttempts += 1;
        updateStreakDisplay();
        updatePointsDisplay();
        showFeedback(isCorrect, question.explanation);
        updateNavButtons();
    }

    // ==================== TIMER FUNCTIONS ====================

    function startTimer() {
        timeLeft = 100;
        timerFill.style.width = '100%';
        timerFill.classList.remove('critical');

        timerInterval = setInterval(() => {
            timeLeft -= (100 / (BLITZ_TIME * 10));
            timerFill.style.width = `${Math.max(0, timeLeft)}%`;

            if (timeLeft <= 30) {
                timerFill.classList.add('critical');
            }

            if (timeLeft <= 0) {
                stopTimer();
                if (!answered) {
                    // Time's up - treat as wrong answer
                    handleTimeOut();
                }
            }
        }, 100);
    }

    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }

    function handleTimeOut() {
        answered = true;
        const question = quizData.questions[currentQuestion];
        const buttons = answersContainer.querySelectorAll('.answer-btn');
        
        buttons.forEach((button) => button.classList.add('disabled'));
        buttons[question.correct].classList.add('correct');
        
        stats.totalWrong += 1;
        streak = 0;
        streakContainer.classList.remove('fire');
        lives -= 1;
        updateLivesDisplay(true);

        if (!wrongAnswersMode) {
            const originalIndex = originalQuizData.questions.findIndex((q) => q.question === question.question);
            if (originalIndex !== -1 && !wrongQuestionIndices.includes(originalIndex)) {
                wrongQuestionIndices.push(originalIndex);
            }
        }

        stats.totalAttempts += 1;
        updateStreakDisplay();
        showFeedback(false, "⏰ Time's up!");
        updateNavButtons();

        mainContainer.classList.add('screen-shake');
        setTimeout(() => mainContainer.classList.remove('screen-shake'), 500);

        if (lives <= 0) {
            setTimeout(() => showGameOver(), 1000);
        }
    }

    // ==================== UI UPDATE FUNCTIONS ====================

    function updateLivesDisplay(animateLoss = false, animateHeal = false) {
        const hearts = livesContainer.querySelectorAll('.heart');
        hearts.forEach((heart, index) => {
            const heartThreshold = index + 1; // Heart 0 represents lives 0-1, Heart 1 represents lives 1-2, etc.
            
            // Remove all states first
            heart.classList.remove('lost', 'losing', 'half', 'healing');
            
            if (lives >= heartThreshold) {
                // Full heart
                heart.textContent = '❤️';
                if (animateHeal && lives === heartThreshold && lives % 1 === 0) {
                    // Just healed to full
                    heart.classList.add('healing');
                    setTimeout(() => heart.classList.remove('healing'), 500);
                }
            } else if (lives >= heartThreshold - 0.5 && lives < heartThreshold) {
                // Half heart
                heart.textContent = '💔';
                heart.classList.add('half');
                if (animateHeal) {
                    heart.classList.add('healing');
                    setTimeout(() => heart.classList.remove('healing'), 500);
                }
            } else {
                // Empty heart
                heart.textContent = '🖤';
                if (animateLoss && Math.ceil(lives) === index) {
                    heart.classList.add('losing');
                    setTimeout(() => {
                        heart.classList.remove('losing');
                        heart.classList.add('lost');
                    }, 500);
                } else {
                    heart.classList.add('lost');
                }
            }
        });
    }

    function updateStreakDisplay() {
        streakCountEl.textContent = streak;
        if (streak >= 3) {
            streakContainer.classList.add('active');
        } else {
            streakContainer.classList.remove('active', 'fire');
        }
    }

    function updatePointsDisplay() {
        pointsDisplay.textContent = points.toLocaleString();
    }

    function showFeedback(isCorrect, explanation) {
        feedback.classList.remove('hidden', 'correct', 'incorrect');
        feedback.classList.add(isCorrect ? 'correct' : 'incorrect');
        
        let streakText = '';
        if (isCorrect && streak >= 3) {
            streakText = `<span class="block mt-1 text-sm">🔥 ${streak} streak bonus!</span>`;
        }
        
        feedback.innerHTML = `
            ${isCorrect ? '✅ Correct!' : '❌ Incorrect.'}
            <span class="block mt-1 opacity-80">${explanation || ''}</span>
            ${streakText}
        `;
        nextBtn.disabled = false;
    }

    function showGameOver() {
        stopTimer();
        gameOverOverlay.classList.remove('hidden');
    }

    function showResults() {
        stopTimer();
        quizSection.classList.add('hidden');
        resultsSection.classList.remove('hidden');
        resultsSection.classList.add('page-enter');

        const percentage = Math.round((score / totalQuestions) * 100);
        const overallAccuracy = stats.totalAttempts > 0
            ? Math.round((stats.totalCorrect / stats.totalAttempts) * 100)
            : 0;

        document.getElementById('final-score').textContent = `${percentage}%`;
        document.getElementById('correct-count').textContent = score;
        document.getElementById('wrong-count').textContent = totalQuestions - score;
        document.getElementById('total-questions').textContent = totalQuestions;
        document.getElementById('accuracy').textContent = `${overallAccuracy}%`;
        
        // New stats
        document.getElementById('final-points').textContent = points.toLocaleString();
        document.getElementById('best-streak').textContent = bestStreak;
        document.getElementById('lives-remaining').textContent = lives;

        if (wrongQuestionIndices.length > 0 && !wrongAnswersMode) {
            reviewWrongBtn.classList.remove('hidden');
        } else {
            reviewWrongBtn.classList.add('hidden');
        }

        // Celebration confetti for good scores
        if (percentage >= 70) {
            for (let i = 0; i < 3; i++) {
                setTimeout(() => createConfetti(), i * 300);
            }
        }
    }

    // ==================== EFFECTS ====================

    function createConfetti() {
        const colors = ['#00f5ff', '#ff00e5', '#a855f7', '#10b981', '#f59e0b'];
        const container = document.getElementById('confetti-container') || document.body;

        for (let i = 0; i < 30; i++) {
            const confetti = document.createElement('div');
            confetti.className = 'confetti';
            confetti.style.left = `${Math.random() * 100}vw`;
            confetti.style.top = '-10px';
            confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.width = `${Math.random() * 10 + 5}px`;
            confetti.style.height = `${Math.random() * 10 + 5}px`;
            confetti.style.animationDuration = `${Math.random() * 2 + 2}s`;
            confetti.style.animationDelay = `${Math.random() * 0.5}s`;
            container.appendChild(confetti);

            setTimeout(() => confetti.remove(), 4000);
        }
    }

    function showPointsPopup(earnedPoints) {
        const popup = document.createElement('div');
        popup.className = 'points-popup';
        popup.textContent = `+${earnedPoints}`;
        popup.style.left = `${50 + (Math.random() - 0.5) * 20}%`;
        popup.style.top = '40%';
        document.body.appendChild(popup);
        setTimeout(() => popup.remove(), 1000);
    }

    // ==================== UTILITIES ====================

    function shuffleArray(array) {
        const clone = [...array];
        for (let i = clone.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [clone[i], clone[j]] = [clone[j], clone[i]];
        }
        return clone;
    }

    function alertModal(message, callback) {
        const modalId = 'custom-alert-modal';
        let modal = document.getElementById(modalId);

        if (!modal) {
            modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal-content text-center">
                    <h4 class="text-xl font-bold mb-4" style="color: var(--text-primary);">Notification</h4>
                    <p id="alert-message" class="mb-6" style="color: var(--text-secondary);"></p>
                    <button id="alert-ok-btn" class="primary-btn w-full">OK</button>
                </div>
            `;
            document.body.appendChild(modal);

            modal.querySelector('#alert-ok-btn').addEventListener('click', () => {
                modal.classList.remove('active');
                if (callback) callback();
            });

            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                }
            });
        }

        modal.querySelector('#alert-message').textContent = message;
        modal.classList.add('active');
    }

    // Initialize
    mainContainer.classList.add('page-enter');
});
